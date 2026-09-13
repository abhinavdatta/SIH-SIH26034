// ═══════════════════════════════════════════════════════════════
// Training Samples — turn human review-queue corrections into OCR
// training data (image crop + verified text pairs).
//
// OPT-IN: nothing is captured unless the user enables it in Settings
// (lmcc-training-capture-enabled). Data lives in IndexedDB, separate
// from scan-history localStorage. Exports as a ZIP of <name>.png +
// <name>.gt.txt pairs — exactly the layout
// training/scripts/prepare_ground_truth.py writes into
// training/ground-truth/ for tesstrain.
//
// How capture works:
//  1. At scan time (opt-in), a downscaled copy of the label image plus
//     the local OCR word boxes are stored in IndexedDB (capped/expiring).
//  2. When a reviewer later OVERRIDES a field value (an actual human
//     correction — never a plain approval), the region around the
//     field's keyword is cropped from the stored image and saved with
//     the corrected text as a training pair.
//  3. Settings can export everything as a tesstrain-ready ZIP.
// ═══════════════════════════════════════════════════════════════

import { getExportStamp } from './auth';

/* ── Settings ── */

const TRAINING_CAPTURE_KEY = 'lmcc-training-capture-enabled';
const IMAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // keep scan images 7 days
const MAX_STORED_IMAGES = 30; // cap IndexedDB usage
const MAX_TRAINING_PAIRS = 500; // cap accumulated pairs

export function isTrainingCaptureEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TRAINING_CAPTURE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setTrainingCaptureEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TRAINING_CAPTURE_KEY, enabled ? 'true' : 'false');
    if (!enabled) {
      // Opting out purges retained scan images (already-derived pairs are
      // kept — the user may still want to export them).
      void clearStoredScanImages();
    }
  } catch {
    // Ignore storage errors
  }
}

/* ── IndexedDB plumbing ── */

const DB_NAME = 'lmcc-training';
const DB_VERSION = 1;
const IMG_STORE = 'images'; // key: scanId → StoredScanImage
const PAIR_STORE = 'pairs'; // keyPath: id

interface StoredScanImage {
  blob: Blob;
  createdAt: number;
  /** Word boxes from the local OCR pass (OCR-canvas pixel space). */
  words?: Array<{ text: string; x0: number; y0: number; x1: number; y1: number }>;
  /** Width of the OCR canvas the word boxes refer to. */
  ocrCanvasWidth?: number;
}

function openTrainingDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IMG_STORE)) db.createObjectStore(IMG_STORE);
      if (!db.objectStoreNames.contains(PAIR_STORE)) db.createObjectStore(PAIR_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function txRequest<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openTrainingDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = run(tx.objectStore(storeName));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
        tx.oncomplete = () => db.close();
      })
  );
}

/* ── Scan image retention (opt-in, downscaled, capped, expiring) ── */

async function downscaleToJpegBlob(file: File, maxEdge = 1200, quality = 0.85): Promise<{ blob: Blob; width: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas context');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('canvas.toBlob failed');
    return { blob, width };
  } finally {
    bitmap.close?.();
  }
}

/**
 * Store a downscaled copy of the scanned label (+ word boxes) so later
 * review corrections can be cropped into training pairs. ONLY runs when
 * training capture is enabled; every failure is swallowed — training data
 * must never break or slow down scanning.
 */
export async function maybeStoreScanImage(
  scanId: string,
  file: File,
  words?: Array<{ text: string; x0: number; y0: number; x1: number; y1: number }>,
  ocrCanvasWidth?: number
): Promise<void> {
  if (!isTrainingCaptureEnabled()) return;
  try {
    const { blob } = await downscaleToJpegBlob(file);
    const record: StoredScanImage = {
      blob,
      createdAt: Date.now(),
      words: words && words.length > 0 ? words : undefined,
      ocrCanvasWidth,
    };
    await txRequest<void>(IMG_STORE, 'readwrite', (store) => store.put(record, scanId));
    void pruneStoredScanImages();
  } catch {
    // Non-fatal by design
  }
}

async function pruneStoredScanImages(): Promise<void> {
  try {
    const db = await openTrainingDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IMG_STORE, 'readwrite');
      const store = tx.objectStore(IMG_STORE);
      const keysReq = store.getAllKeys();
      const recsReq = store.getAll();
      keysReq.onsuccess = () => {
        recsReq.onsuccess = () => {
          const keys = keysReq.result as IDBValidKey[];
          const recs = recsReq.result as StoredScanImage[];
          const now = Date.now();
          // Same-key order is guaranteed for getAllKeys/getAll.
          recs.forEach((rec, i) => {
            if (!rec || now - rec.createdAt > IMAGE_RETENTION_MS) store.delete(keys[i]);
          });
          const live = recs.filter((r) => r && now - r.createdAt <= IMAGE_RETENTION_MS);
          if (live.length > MAX_STORED_IMAGES) {
            // recs are insertion-ordered; drop oldest beyond the cap
            let excess = live.length - MAX_STORED_IMAGES;
            for (let i = 0; i < recs.length && excess > 0; i++) {
              if (recs[i] && now - recs[i].createdAt <= IMAGE_RETENTION_MS) {
                store.delete(keys[i]);
                excess--;
              }
            }
          }
        };
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // Non-fatal
  }
}

async function clearStoredScanImages(): Promise<void> {
  try {
    await txRequest<void>(IMG_STORE, 'readwrite', (store) => store.clear());
  } catch {
    // Non-fatal
  }
}

/* ── Training pair capture ── */

export interface TrainingPair {
  id: string;
  fieldName: string;
  correctedValue: string;
  originalValue: string | null;
  imageDataUrl: string; // PNG data URL of the cropped region
  createdAt: string;
  scanProductName?: string;
}

function makePairId(fieldName: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `pair_${Date.now().toString(36)}_${fieldName}_${rand}`;
}

/**
 * Keyword lists for locating a field's region at crop time. Mirrors the
 * spatial keywords in ocr.ts. Multi-word phrases are matched word-by-word.
 */
const CAPTURE_KEYWORDS: Record<string, string[]> = {
  mrp: ['mrp', 'maximum retail price', 'm.r.p.', 'price', '₹', 'rs.'],
  net_quantity: ['net wt', 'net weight', 'net quantity', 'qty'],
  manufacture_date: ['mfg', 'mfg.', 'manufacture', 'pack', 'packed on', 'best before', 'exp', 'dom'],
  manufacturer_name: ['manufactured by', 'mfg.', 'mfr.', 'packed by', 'marketed by'],
};

function normalizeWordText(text: string): string {
  return text.toLowerCase().replace(/[.:,]/g, '');
}

/**
 * Bounding box (stored-image pixel space) around the keyword and its value:
 * same-line words to the right, else aligned words just below. Returns null
 * when no value words are found — cropping the keyword alone would mislabel
 * the pair (the .gt.txt must contain exactly what the image shows).
 */
function computeValueCrop(
  words: Array<{ text: string; x0: number; y0: number; x1: number; y1: number }>,
  keyword: { x0: number; y0: number; x1: number; y1: number },
  padX = 8,
  padY = 4
): { x0: number; y0: number; x1: number; y1: number } | null {
  const kwMidY = (keyword.y0 + keyword.y1) / 2;
  const sameLine = words.filter(
    (w) => w.x0 > keyword.x1 && Math.abs((w.y0 + w.y1) / 2 - kwMidY) < 12
  );
  const below = words.filter(
    (w) => w.y0 > keyword.y1 && w.y0 - keyword.y1 < 60 && Math.abs(w.x0 - keyword.x0) < 150
  );
  const valueWords = sameLine.length > 0 ? sameLine : below;
  if (valueWords.length === 0) return null;

  const xs = [keyword.x0, keyword.x1, ...valueWords.flatMap((w) => [w.x0, w.x1])];
  const ys = [keyword.y0, keyword.y1, ...valueWords.flatMap((w) => [w.y0, w.y1])];
  return {
    x0: Math.min(...xs) - padX,
    y0: Math.min(...ys) - padY,
    x1: Math.max(...xs) + padX,
    y1: Math.max(...ys) + padY,
  };
}

/**
 * Crop the stored image to the region and return a PNG data URL, upscaled
 * to ~200px height (matching prepare_ground_truth.py's TARGET_HEIGHT so
 * tesstrain sees consistent line inputs).
 */
async function cropRegionFromDataUrl(
  dataUrl: string,
  crop: { x0: number; y0: number; x1: number; y1: number },
  targetHeight = 200
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('failed to decode stored scan image'));
    el.src = dataUrl;
  });

  const x0 = Math.max(0, Math.floor(crop.x0));
  const y0 = Math.max(0, Math.floor(crop.y0));
  const x1 = Math.min(img.naturalWidth, Math.ceil(crop.x1));
  const y1 = Math.min(img.naturalHeight, Math.ceil(crop.y1));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);

  const scale = Math.max(1, targetHeight / h);
  const out = document.createElement('canvas');
  out.width = Math.round(w * scale);
  out.height = Math.round(h * scale);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('no canvas context');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x0, y0, w, h, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Capture a training pair from a human review correction.
 *
 * Called ONLY for overridden fields (a human-entered correction), never on
 * plain approvals. Fire-and-forget safe: never throws; returns true when a
 * pair was stored. Requires that the opt-in image retention captured the
 * scan image WITH word boxes (local spatial OCR path) — otherwise skips.
 */
export async function captureTrainingPair(input: {
  scanId: string;
  fieldName: string;
  correctedValue: string;
  originalValue: string | null;
  scanProductName?: string;
}): Promise<boolean> {
  if (!isTrainingCaptureEnabled()) return false;
  const { scanId, fieldName, correctedValue, originalValue } = input;
  if (!correctedValue.trim()) return false;

  try {
    const record = await txRequest<StoredScanImage | undefined>(IMG_STORE, 'readonly', (store) => store.get(scanId));
    if (!record || !record.words || !record.ocrCanvasWidth) return false;

    // Rescale OCR-canvas word boxes into stored-image pixel space.
    const blobUrl = URL.createObjectURL(record.blob);
    let img: HTMLImageElement | null = null;
    try {
      img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('decode failed'));
        el.src = blobUrl;
      });
    } catch {
      return false;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
    if (!img) return false;

    const scale = img.naturalWidth / record.ocrCanvasWidth;
    if (!Number.isFinite(scale) || scale <= 0) return false;
    const words = record.words.map((w) => ({
      text: w.text,
      x0: w.x0 * scale,
      y0: w.y0 * scale,
      x1: w.x1 * scale,
      y1: w.y1 * scale,
    }));

    // Find the keyword box for this field.
    const kwList = CAPTURE_KEYWORDS[fieldName];
    if (!kwList) return false;
    const lowered = words.map((w) => ({ ...w, norm: normalizeWordText(w.text) }));

    let crop: ReturnType<typeof computeValueCrop> = null;
    for (const kw of kwList) {
      const kwWords = kw.split(' ').map(normalizeWordText);
      for (let i = 0; i <= lowered.length - kwWords.length; i++) {
        const seq = lowered.slice(i, i + kwWords.length);
        const matched = seq.every((w, j) => kwWords[j].length > 0 && w.norm.startsWith(kwWords[j]));
        if (matched) {
          crop = computeValueCrop(words, seq[0]);
          if (crop) break;
        }
      }
      if (crop) break;
    }
    if (!crop) return false; // can't locate the region — skip rather than mislabel

    const dataUrl = await blobToDataUrl(record.blob);
    const imageDataUrl = await cropRegionFromDataUrl(dataUrl, crop);

    const pair: TrainingPair = {
      id: makePairId(fieldName),
      fieldName,
      correctedValue: correctedValue.trim(),
      originalValue,
      imageDataUrl,
      createdAt: new Date().toISOString(),
      scanProductName: input.scanProductName,
    };

    await txRequest<void>(PAIR_STORE, 'readwrite', (store) => store.put(pair));
    void enforcePairCap();
    return true;
  } catch {
    return false;
  }
}

async function enforcePairCap(): Promise<void> {
  try {
    const pairs = await getTrainingPairs();
    if (pairs.length <= MAX_TRAINING_PAIRS) return;
    const excess = pairs
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, pairs.length - MAX_TRAINING_PAIRS);
    for (const p of excess) await deleteTrainingPair(p.id);
  } catch {
    // Non-fatal
  }
}

export async function getTrainingPairs(): Promise<TrainingPair[]> {
  try {
    const all = await txRequest<TrainingPair[]>(PAIR_STORE, 'readonly', (store) => store.getAll());
    return all ?? [];
  } catch {
    return [];
  }
}

export async function getTrainingPairCount(): Promise<number> {
  return (await getTrainingPairs()).length;
}

export async function deleteTrainingPair(id: string): Promise<void> {
  try {
    await txRequest<void>(PAIR_STORE, 'readwrite', (store) => store.delete(id));
  } catch {
    // Non-fatal
  }
}

export async function clearTrainingPairs(): Promise<void> {
  try {
    await txRequest<void>(PAIR_STORE, 'readwrite', (store) => store.clear());
  } catch {
    // Non-fatal
  }
}

/* ── ZIP export (store-only — PNGs are already compressed) ── */

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const d = (((date.getFullYear() - 1980) & 0x7f) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: d };
}

interface ZipEntrySpec {
  name: string;
  data: Uint8Array;
}

/**
 * Minimal store-only ZIP writer (no dependencies). Produces a spec-compliant
 * archive: local headers + data, central directory, end-of-central-directory.
 */
function buildZip(entries: ZipEntrySpec[]): Blob {
  const now = dosDateTime(new Date());
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);

    const local = new Uint8Array(30 + nameBytes.length);
    const ldv = new DataView(local.buffer);
    ldv.setUint32(0, 0x04034b50, true);
    ldv.setUint16(4, 20, true);
    ldv.setUint16(6, 0x0800, true); // UTF-8 names
    ldv.setUint16(8, 0, true); // stored
    ldv.setUint16(10, now.time, true);
    ldv.setUint16(12, now.date, true);
    ldv.setUint32(14, crc, true);
    ldv.setUint32(18, entry.data.length, true);
    ldv.setUint32(22, entry.data.length, true);
    ldv.setUint16(26, nameBytes.length, true);
    ldv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(central.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0x0800, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, now.time, true);
    cdv.setUint16(14, now.date, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, entry.data.length, true);
    cdv.setUint32(24, entry.data.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    localChunks.push(local, entry.data);
    centralChunks.push(central);
    offset += local.length + entry.data.length;
  }

  const centralSize = centralChunks.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const edv = new DataView(end.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(8, entries.length, true);
  edv.setUint16(10, entries.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, offset, true);

  const total = new Uint8Array(offset + centralSize + end.length);
  let pos = 0;
  for (const c of localChunks) { total.set(c, pos); pos += c.length; }
  for (const c of centralChunks) { total.set(c, pos); pos += c.length; }
  total.set(end, pos);
  return new Blob([total], { type: 'application/zip' });
}

/**
 * Export all captured pairs as a ZIP with exactly the folder layout
 * prepare_ground_truth.py / tesstrain expect:
 *   ground-truth/<name>.png
 *   ground-truth/<name>.gt.txt
 * Plus corrections.csv (fieldName, corrected, original, file) for audit.
 */
export async function exportTrainingPairsAsZip(): Promise<{ blob: Blob; count: number } | null> {
  const pairs = await getTrainingPairs();
  if (pairs.length === 0) return null;

  const toBytes = (dataUrl: string): Uint8Array => {
    const base64 = dataUrl.split(',')[1] ?? '';
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };

  const encoder = new TextEncoder();
  const usedStems = new Set<string>();
  const uniqueStem = (base: string): string => {
    let stem = base;
    let n = 2;
    while (usedStems.has(stem)) stem = `${base}_${n++}`;
    usedStems.add(stem);
    return stem;
  };

  const entries: ZipEntrySpec[] = [];
  // Row 2 records who exported this dataset (identity provenance for audits).
  // The .gt.txt files stay pure transcriptions — tesstrain requires that.
  const csvRows: string[] = [
    'fieldName,correctedValue,originalValue,capturedAt,fileName',
    `"${getExportStamp().replace(/"/g, '""')}"`,
  ];

  for (const pair of pairs) {
    const stem = uniqueStem(`review_${pair.fieldName}`);
    entries.push({ name: `ground-truth/${stem}.png`, data: toBytes(pair.imageDataUrl) });
    entries.push({
      name: `ground-truth/${stem}.gt.txt`,
      data: encoder.encode(`${pair.correctedValue}\n`),
    });
    csvRows.push(
      [
        pair.fieldName,
        `"${pair.correctedValue.replace(/"/g, '""')}"`,
        pair.originalValue ? `"${pair.originalValue.replace(/"/g, '""')}"` : '',
        pair.createdAt,
        `${stem}.png`,
      ].join(',')
    );
  }
  entries.push({ name: 'corrections.csv', data: encoder.encode(`${csvRows.join('\n')}\n`) });

  return { blob: buildZip(entries), count: pairs.length };
}

/** Trigger a browser download of the exported ZIP; returns pair count or null. */
export async function downloadTrainingPairsZip(): Promise<number | null> {
  const result = await exportTrainingPairsAsZip();
  if (!result) return null;
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lmcc-ground-truth-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return result.count;
}
