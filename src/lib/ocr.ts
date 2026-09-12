// ═══════════════════════════════════════════════════════════════
// OCR Service — Client-side text extraction using Tesseract.js
// Region-aware OCR with format support (HEIC, PDF)
// No server-side processing, no external API calls
// ═══════════════════════════════════════════════════════════════

import Tesseract from 'tesseract.js';
import { isLiteMode } from './lite-mode';

/* ── Custom trained model (fine-tuned via training/) ── */

/**
 * Filename (without extension) of the app's fine-tuned Tesseract model.
 * Train it with training/colab_train_ocr.ipynb (Google Colab) or
 * training/train_local.sh (local), then drop the resulting
 * labelnet.traineddata into public/tessdata/.
 */
export const LMCC_MODEL = 'labelnet';

/**
 * Whether the custom model was found and is being used (set lazily).
 * Queryable for diagnostics (e.g. Settings UI or console debugging).
 */
export let lmccModelActive = false;

let sharedWorkerPromise: Promise<Tesseract.Worker> | null = null;

/**
 * Mutable logger target so a per-call progress callback can receive worker
 * events (worker loggers are fixed at creation time).
 */
let tesseractLoggerHandler: ((m: { status?: string; progress?: number }) => void) | null = null;

/**
 * Check whether a custom trained model is deployed at /tessdata/.
 * A 200 response with a non-HTML body means the file exists.
 */
export async function isCustomModelAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const res = await fetch(`/tessdata/${LMCC_MODEL}.traineddata`, { method: 'HEAD' });
    if (!res.ok) return false;
    const type = res.headers.get('content-type') || '';
    return !type.includes('text/html'); // SPA/404 fallbacks serve HTML
  } catch {
    return false;
  }
}

/**
 * Get (or create) the shared Tesseract worker. Prefers the fine-tuned
 * `labelnet` model when it is deployed at public/tessdata/, and falls
 * back to stock `eng` otherwise. Loading the model once and reusing the
 * worker is also significantly faster than Tesseract.recognize(), which
 * boots a fresh worker for every call.
 */
async function ensureTesseractWorker(onProgress?: ProgressCallback): Promise<Tesseract.Worker> {
  if (!sharedWorkerPromise) {
    sharedWorkerPromise = (async () => {
      const customAvailable = await isCustomModelAvailable();
      const lang = customAvailable ? LMCC_MODEL : 'eng';
      lmccModelActive = customAvailable;

      onProgress?.({
        stage: 'loading_model',
        progress: 0,
        message: customAvailable
          ? 'Loading fine-tuned labelnet OCR model...'
          : 'Loading stock English OCR model...',
      });

      const worker = await Tesseract.createWorker(lang, 1, customAvailable
        ? {
            // Serve OUR traineddata instead of the jsDelivr CDN.
            // Files in public/tessdata must be UNCOMPRESSED (.traineddata,
            // not .gz) because gzip:false disables the .gz suffix fetch.
            langPath: '/tessdata',
            gzip: false,
            logger: (m: { status?: string; progress?: number }) => tesseractLoggerHandler?.(m),
          }
        : { logger: (m: { status?: string; progress?: number }) => tesseractLoggerHandler?.(m) });

      return worker;
    })().catch((error) => {
      sharedWorkerPromise = null; // Allow retry on next call
      throw error;
    });
  }
  return sharedWorkerPromise;
}

/**
 * Run OCR on a canvas with the shared worker (custom model when available).
 */
async function runTesseractOnCanvas(
  canvas: HTMLCanvasElement,
  psm: number,
  includeWords: boolean = false,
  onProgress?: ProgressCallback
): Promise<{text: string, confidence: number, words?: WordBox[]}> {
  const worker = await ensureTesseractWorker(onProgress);

  // Route worker events to this call's progress callback (calls are sequential).
  if (onProgress) {
    tesseractLoggerHandler = (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress({
          stage: 'ocr',
          progress: m.progress,
          message: `Extracting text... ${Math.round(m.progress * 100)}%`,
        });
      }
    };
  }

  try {
    await worker.setParameters({ tessedit_pageseg_mode: String(psm) as Tesseract.PSM });
    const { data } = await worker.recognize(canvas.toDataURL('image/png'));

    return {
      text: data.text,
      confidence: data.confidence / 100,
      words: includeWords && data.words ? data.words.map(mapTesseractWord) : undefined,
    };
  } finally {
    tesseractLoggerHandler = null;
  }
}

/* ── Character Whitelisting for Structured Fields (Part B) ──
 *
 * Fields whose content is known to be numeric/structured (MRP, net
 * quantity, manufacture date) get a SECOND, targeted recognition pass on
 * just the cropped keyword+value region with Tesseract's character set
 * restricted. This meaningfully reduces misreads (a smudged "8" read as
 * "B", stray symbols picked up). Free-text fields (manufacturer
 * name/address, consumer care) must NEVER be whitelisted — restricting
 * the charset there cuts off legitimate text.
 */

/** Allowed characters per structured field (Tesseract whitelist syntax). */
const FIELD_CHAR_WHITELISTS: Record<string, string> = {
  // Digits, decimal point, ₹ (U+20B9), Rs prefix letters, /- separators, space
  mrp: '0123456789.₹Rs/- ',
  // Digits, decimal point, unit letters (mg g kg ml l L), space
  net_quantity: '0123456789.gkmlL ',
  // Digits, date separators (/-.) + letters used by month abbreviations
  // (jan..dec) and capitalized forms (Jan, Best Before, MFG, OCT...).
  manufacture_date:
    '0123456789/-.abcdefgjlmnoprstuvy'
    + 'JFMAPYULGSONDBCERT',
};

/**
 * Run a targeted recognition pass on a cropped region with a restricted
 * character set. Uses the shared worker; the whitelist and PSM are reset
 * afterwards so the restriction cannot leak into other recognitions.
 */
async function runWhitelistedRegionPass(
  canvas: HTMLCanvasElement,
  crop: { x0: number; y0: number; x1: number; y1: number },
  whitelist: string
): Promise<{ text: string; confidence: number } | null> {
  try {
    const x0 = Math.max(0, Math.floor(crop.x0));
    const y0 = Math.max(0, Math.floor(crop.y0));
    const x1 = Math.min(canvas.width, Math.ceil(crop.x1));
    const y1 = Math.min(canvas.height, Math.ceil(crop.y1));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w < 8 || h < 8) return null;

    // Crop + upscale small regions (2x) for more reliable single-line reads
    const region = document.createElement('canvas');
    const scale = h < 40 ? 2 : 1;
    region.width = w * scale;
    region.height = h * scale;
    const rctx = region.getContext('2d');
    if (!rctx) return null;
    rctx.imageSmoothingEnabled = true;
    rctx.imageSmoothingQuality = 'high';
    // Lite Mode: skip the 2× upscale (2×-scaled drawImage costs ~4× the
    // pixel memory of a 1:1 draw) — accuracy tradeoff accepted in lite.
    const liteScale = isLiteMode() ? 1 : 2;
    const scale = h < 40 ? liteScale : 1;

    const worker = await ensureTesseractWorker();
    try {
      await worker.setParameters({
        tessedit_char_whitelist: whitelist,
        tessedit_pageseg_mode: '7' as Tesseract.PSM, // single text line
      });
      const { data } = await worker.recognize(region.toDataURL('image/png'));
      const text = data.text.trim();
      if (!text) return null;
      return { text, confidence: data.confidence / 100 };
    } finally {
      // RESET so the whitelist never leaks into other recognition passes.
      await worker.setParameters({
        tessedit_char_whitelist: '',
        tessedit_pageseg_mode: '3' as Tesseract.PSM,
      });
    }
  } catch {
    return null; // refinement is best-effort
  }
}

/* ── Types ── */

export interface ExtractedField {
  fieldName: string;
  value: string | null;
  confidence: number;
  sourceText: string;
  reasoning?: string; // For AI-extracted fields
}

export interface OCRResult {
  productName: string | null;
  manufacturerName: string | null;
  fields: ExtractedField[];
  rawText: string;
  overallConfidence: number;
  extractionMethod?: 'local_spatial' | 'cloud_ai' | 'hybrid'; // Track extraction method
  aiReasoning?: Record<string, string>; // Field reasoning from AI
  /**
   * Word-level boxes from the local OCR pass (OCR-canvas pixel space).
   * Only present on the local/hybrid spatial path; used to crop training
   * samples when a reviewer later corrects a field (opt-in training capture).
   */
  wordBoxes?: Array<{ text: string; x0: number; y0: number; x1: number; y1: number }>;
  /** Width of the OCR canvas the wordBoxes coordinates refer to. */
  ocrCanvasWidth?: number;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'paragraph' | 'table' | 'small_text';
  confidence: number;
}

export interface OCRProgress {
  stage: string;
  progress: number; // 0-1
  message: string;
}

export type OCRRegionMode = 'auto' | 'full' | 'top' | 'middle' | 'bottom';

export interface OCROptions {
  regionMode?: OCRRegionMode;
}

export interface WordBox {
  text: string;
  confidence: number;
  bbox: {
    x0: number; // left
    y0: number; // top
    x1: number; // right
    y1: number; // bottom
  };
  baseline: number;
}

type ProgressCallback = (progress: OCRProgress) => void;

interface TesseractWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  baseline?: { y0: number } | null;
}

function mapTesseractWord(word: TesseractWord): WordBox {
  return {
    text: word.text,
    confidence: word.confidence / 100,
    bbox: {
      x0: word.bbox.x0,
      y0: word.bbox.y0,
      x1: word.bbox.x1,
      y1: word.bbox.y1,
    },
    // Tesseract reports the baseline as a line ({y0, x0..}) — keep its
    // y-intercept as the numeric baseline offset used by WordBox.
    baseline: word.baseline?.y0 ?? 0,
  };
}

/* ── Format Conversion Utilities ── */

/**
 * Convert HEIC/HEIF to JPEG/PNG using heic2any
 */
async function convertHeicToImage(file: File): Promise<File> {
  const heic2any = (await import('heic2any')).default;

  try {
    const blob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.95,
    }) as Blob;

    return new File([blob], file.name.replace(/\.heic?$/i, '.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (error) {
    throw new Error(`HEIC conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Convert PDF to image using pdfjs-dist (renders first page only)
 */
async function convertPdfToImage(file: File): Promise<File> {
  const pdfjsLib = await import('pdfjs-dist');

  // Set worker source
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // Render first page only (covers 95% of label scanning use cases)
    const page = await pdf.getPage(1);

    const scale = 2.0; // High quality for OCR
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    }).promise;

    // Convert to blob
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.95);
    });

    return new File([blob], file.name.replace(/\.pdf$/i, '_page1.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (error) {
    throw new Error(`PDF conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Normalize file format - convert HEIC/PDF to standard image if needed
 */
export async function normalizeImageFile(file: File, onProgress?: ProgressCallback): Promise<File> {
  const fileType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();

  // Check for HEIC/HEIF
  if (fileType.includes('heic') || fileType.includes('heif') || fileName.endsWith('.heic') || fileName.endsWith('.heif')) {
    onProgress?.({ stage: 'converting', progress: 0.1, message: 'Converting HEIC to JPEG...' });
    const converted = await convertHeicToImage(file);
    onProgress?.({ stage: 'converting', progress: 0.2, message: 'Format conversion complete' });
    return converted;
  }

  // Check for PDF
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    onProgress?.({ stage: 'converting', progress: 0.1, message: 'Converting PDF to image...' });
    const converted = await convertPdfToImage(file);
    onProgress?.({ stage: 'converting', progress: 0.2, message: 'PDF rendering complete' });
    return converted;
  }

  // Already a supported image format
  return file;
}

/* ── Image Processing Utilities ── */

/**
 * Convert image to grayscale
 */
function toGrayscale(imageData: ImageData): ImageData {
  const data = imageData.data;
  const grayscale = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const avg = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    grayscale[i] = avg;
    grayscale[i + 1] = avg;
    grayscale[i + 2] = avg;
    grayscale[i + 3] = data[i + 3];
  }

  return new ImageData(grayscale, imageData.width, imageData.height);
}

/**
 * Apply Sobel edge detection
 */
function sobelEdgeDetection(imageData: ImageData): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const src = imageData.data;

  // Convert to grayscale first
  const gray = new Float32Array(width * height);
  for (let i = 0, j = 0; i < src.length; i += 4, j++) {
    gray[j] = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
  }

  // Sobel kernels
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  const edgeData = new Uint8ClampedArray(width * height * 4);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          const kidx = (ky + 1) * 3 + (kx + 1);
          gx += gray[idx] * sobelX[kidx];
          gy += gray[idx] * sobelY[kidx];
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      const pixelIdx = (y * width + x) * 4;
      edgeData[pixelIdx] = magnitude;
      edgeData[pixelIdx + 1] = magnitude;
      edgeData[pixelIdx + 2] = magnitude;
      edgeData[pixelIdx + 3] = 255;
    }
  }

  return new ImageData(edgeData, width, height);
}

/**
 * Apply Otsu's thresholding for adaptive binarization
 */
function otsuThreshold(imageData: ImageData): ImageData {
  const gray = new Float32Array(imageData.width * imageData.height);
  const data = imageData.data;

  // Extract grayscale values
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = data[i];
  }

  // Calculate histogram
  const histogram = new Array(256).fill(0);
  for (const v of gray) {
    histogram[Math.floor(v)]++;
  }

  // Total pixels
  const total = gray.length;

  // Otsu's method
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVariance = 0;
  let threshold = 0;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;

    wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  // Apply threshold
  const result = new Uint8ClampedArray(data.length);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const val = gray[j] >= threshold ? 255 : 0;
    result[i] = val;
    result[i + 1] = val;
    result[i + 2] = val;
    result[i + 3] = 255;
  }

  return new ImageData(result, imageData.width, imageData.height);
}

/**
 * Upscale image using bicubic interpolation
 */
function upscaleImage(canvas: HTMLCanvasElement, scaleFactor: number = 2): HTMLCanvasElement {
  const scaledCanvas = document.createElement('canvas');
  const ctx = scaledCanvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  scaledCanvas.width = canvas.width * scaleFactor;
  scaledCanvas.height = canvas.height * scaleFactor;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);

  return scaledCanvas;
}

/* ── Region Detection ── */

/**
 * Find contours in edge-detected image (simplified edge following)
 */
function findContours(edgeData: ImageData, minArea: number = 1000): Array<{x: number, y: number, width: number, height: number}> {
  const width = edgeData.width;
  const height = edgeData.height;
  const data = edgeData.data;
  const visited = new Set<number>();
  const regions: Array<{x: number, y: number, width: number, height: number}> = [];

  const visitedPixel = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return true;
    return visited.has(y * width + x);
  };

  const isEdge = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const idx = (y * width + x) * 4;
    return data[idx] > 100; // Edge threshold
  };

  const floodFill = (startX: number, startY: number) => {
    const stack = [[startX, startY]];
    let minX = startX, maxX = startX, minY = startY, maxY = startY;
    let pixelCount = 0;

    while (stack.length > 0 && pixelCount < 50000) { // Prevent infinite loops
      const [x, y] = stack.pop()!;
      const key = y * width + x;

      if (visitedPixel(x, y)) continue;
      if (!isEdge(x, y)) continue;

      visited.add(key);
      pixelCount++;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      // 8-connected neighbors
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (!visitedPixel(nx, ny) && isEdge(nx, ny)) {
            stack.push([nx, ny]);
          }
        }
      }
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      pixelCount,
    };
  };

  // Scan for edge pixels and start flood fill
  for (let y = 0; y < height; y += 2) { // Skip every other row for performance
    for (let x = 0; x < width; x += 2) {
      if (isEdge(x, y) && !visitedPixel(x, y)) {
        const region = floodFill(x, y);
        if (region.pixelCount >= minArea) {
          regions.push({
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height,
          });
        }
      }
    }
  }

  return regions;
}

/**
 * Detect rectangular regions with borders
 */
function detectRegions(canvas: HTMLCanvasElement): Region[] {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const width = canvas.width;
  const height = canvas.height;

  // Get image data
  const imageData = ctx.getImageData(0, 0, width, height);

  // Apply edge detection
  const edges = sobelEdgeDetection(imageData);

  // Find contours (border regions)
  const contours = findContours(edges, Math.min(width, height) * 2); // Min area threshold

  // Filter and classify regions
  const regions: Region[] = [];
  const minSize = 50; // Minimum 50px in any dimension
  const maxArea = width * height * 0.9; // Don't take the whole image

  for (const contour of contours) {
    const area = contour.width * contour.height;
    const aspectRatio = contour.width / contour.height;

    // Filter out too small, too large, or extreme aspect ratios
    if (contour.width < minSize || contour.height < minSize) continue;
    if (area > maxArea) continue;
    if (aspectRatio < 0.1 || aspectRatio > 10) continue;

    // Classify region type
    let type: Region['type'] = 'paragraph';

    // Check if it looks like a table (roughly square-ish or landscape rectangle with grid-like proportions)
    if (aspectRatio > 1.2 && aspectRatio < 4 && contour.height > 100) {
      type = 'table';
    } else if (contour.height < 80 || contour.width < 150) {
      type = 'small_text';
    }

    regions.push({
      x: contour.x,
      y: contour.y,
      width: contour.width,
      height: contour.height,
      type,
      confidence: 0.8, // Base confidence for detected regions
    });
  }

  // Sort regions by position (top to bottom, left to right)
  regions.sort((a, b) => {
    if (Math.abs(a.y - b.y) < 50) {
      return a.x - b.x;
    }
    return a.y - b.y;
  });

  return regions;
}

/**
 * Detect QR code regions using pattern analysis
 */
function detectQRCodes(canvas: HTMLCanvasElement): Array<{x: number, y: number, width: number, height: number}> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const qrRegions: Array<{x: number, y: number, width: number, height: number}> = [];

  // Scan for finder patterns (concentric squares with alternating black/white)
  const blockSize = 20; // Size to check
  const threshold = 128;

  for (let y = 0; y < height - blockSize * 7; y += blockSize) {
    for (let x = 0; x < width - blockSize * 7; x += blockSize) {
      // Check 7x7 block pattern typical of QR finder patterns
      let highFrequency = 0;

      // Check center 5x5 area for high contrast variation
      for (let dy = 1; dy < 6; dy++) {
        for (let dx = 1; dx < 6; dx++) {
          const idx1 = ((y + dy * blockSize) * width + (x + dx * blockSize)) * 4;
          const idx2 = ((y + (dy - 1) * blockSize) * width + (x + dx * blockSize)) * 4;
          const diff = Math.abs(data[idx1] - data[idx2]);
          if (diff > threshold) highFrequency++;
        }
      }

      // If we found enough high-frequency variation, it might be a QR code
      if (highFrequency > 15) {
        qrRegions.push({
          x: x,
          y: y,
          width: blockSize * 7,
          height: blockSize * 7,
        });

        // Skip ahead
        x += blockSize * 7;
      }
    }
  }

  return qrRegions;
}

/**
 * Detect barcode regions
 */
function detectBarcodes(canvas: HTMLCanvasElement): Array<{x: number, y: number, width: number, height: number}> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const barcodeRegions: Array<{x: number, y: number, width: number, height: number}> = [];

  // Scan horizontal lines for alternating black/white patterns
  const scanLines = Math.min(10, Math.floor(height / 100));

  for (let i = 0; i < scanLines; i++) {
    const y = Math.floor((height / scanLines) * i + height / (scanLines * 2));
    let transitionCount = 0;
    let lastWasDark = false;
    let startX = -1;
    let barcodeWidth = 0;

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      const isDark = brightness < 128;

      if (isDark !== lastWasDark) {
        transitionCount++;
        lastWasDark = isDark;

        if (startX === -1 && transitionCount > 3) {
          startX = x - barcodeWidth;
        }
        barcodeWidth = x - startX;
      }
    }

    // If we found many transitions (typical of barcodes), mark the region
    if (transitionCount > 20 && startX >= 0 && barcodeWidth > 50) {
      barcodeRegions.push({
        x: Math.max(0, startX - 10),
        y: Math.max(0, y - 30),
        width: Math.min(width - startX + 10, barcodeWidth + 20),
        height: 60,
      });
    }
  }

  return barcodeRegions;
}

/**
 * Get regions excluding QR codes and barcodes
 */
function getFilteredRegions(canvas: HTMLCanvasElement, onProgress?: ProgressCallback): Region[] {
  onProgress?.({ stage: 'detecting_regions', progress: 0.25, message: 'Detecting text regions...' });

  const regions = detectRegions(canvas);
  onProgress?.({ stage: 'detecting_regions', progress: 0.3, message: 'Excluding QR codes and barcodes...' });

  const qrCodes = detectQRCodes(canvas);
  const barcodes = detectBarcodes(canvas);

  // Filter out regions that overlap with QR codes or barcodes
  const filteredRegions = regions.filter(region => {
    // Check overlap with QR codes
    for (const qr of qrCodes) {
      if (rectanglesOverlap(region, qr)) {
        return false;
      }
    }

    // Check overlap with barcodes
    for (const barcode of barcodes) {
      if (rectanglesOverlap(region, barcode)) {
        return false;
      }
    }

    return true;
  });

  return filteredRegions;
}

function getSelectedRegion(canvas: HTMLCanvasElement, regionMode: OCRRegionMode): Region[] {
  if (regionMode === 'full') {
    return [{ x: 0, y: 0, width: canvas.width, height: canvas.height, type: 'paragraph', confidence: 1 }];
  }

  const sections: Record<Exclude<OCRRegionMode, 'auto' | 'full'>, { start: number; end: number }> = {
    top: { start: 0, end: 1 / 3 },
    middle: { start: 1 / 3, end: 2 / 3 },
    bottom: { start: 2 / 3, end: 1 },
  };
  const section = sections[regionMode as Exclude<OCRRegionMode, 'auto' | 'full'>];

  return [{
    x: 0,
    y: Math.floor(canvas.height * section.start),
    width: canvas.width,
    height: Math.max(1, Math.floor(canvas.height * (section.end - section.start))),
    type: 'paragraph',
    confidence: 1,
  }];
}

/**
 * Check if two rectangles overlap
 */
function rectanglesOverlap(a: {x: number, y: number, width: number, height: number},
                          b: {x: number, y: number, width: number, height: number}): boolean {
  return !(a.x + a.width < b.x ||
           b.x + b.width < a.x ||
           a.y + a.height < b.y ||
           b.y + b.height < a.y);
}

/* ── Table-Aware Processing ── */

/**
 * Process table region row-by-row
 */
async function processTableRegion(canvas: HTMLCanvasElement, region: Region, onProgress?: ProgressCallback): Promise<{text: string, confidence: number}> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { text: '', confidence: 0 };

  // Crop the table region
  const tableCanvas = document.createElement('canvas');
  const tableCtx = tableCanvas.getContext('2d');
  if (!tableCtx) return { text: '', confidence: 0 };

  tableCanvas.width = region.width;
  tableCanvas.height = region.height;
  tableCtx.drawImage(canvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);

  // Detect horizontal lines for row separation
  const imageData = tableCtx.getImageData(0, 0, region.width, region.height);
  const gray = new Float32Array(region.width * region.height);

  for (let i = 0, j = 0; i < imageData.data.length; i += 4, j++) {
    gray[j] = 0.299 * imageData.data[i] + 0.587 * imageData.data[i + 1] + 0.114 * imageData.data[i + 2];
  }

  // Find horizontal lines by checking for dark horizontal streaks
  const rowLines: number[] = [0, region.height]; // Start and end

  for (let y = 20; y < region.height - 20; y++) {
    let darkPixels = 0;
    for (let x = 0; x < region.width; x++) {
      if (gray[y * region.width + x] < 128) {
        darkPixels++;
      }
    }

    // If this row has many dark pixels, it's likely a line
    if (darkPixels > region.width * 0.7) {
      // Check if it's part of an existing line
      const isNewLine = !rowLines.some(line => Math.abs(line - y) < 5);
      if (isNewLine) {
        rowLines.push(y);
      }
    }
  }

  rowLines.sort((a, b) => a - b);

  // OCR each row
  const rowTexts: string[] = [];
  let totalConfidence = 0;
  let rowCount = 0;

  for (let i = 0; i < rowLines.length - 1; i++) {
    const rowY = rowLines[i];
    const rowHeight = Math.max(rowLines[i + 1] - rowY, 20);

    if (rowHeight < 15) continue; // Skip too small rows

    const rowCanvas = document.createElement('canvas');
    const rowCtx = rowCanvas.getContext('2d');
    if (!rowCtx) continue;

    rowCanvas.width = region.width;
    rowCanvas.height = rowHeight;
    rowCtx.drawImage(tableCanvas, 0, rowY, region.width, rowHeight, 0, 0, region.width, rowHeight);

    // OCR the row with single-line PSM (shared worker / custom model)
    const result = await runTesseractOnCanvas(rowCanvas, 7);

    const text = result.text.trim();
    if (text.length > 0) {
      rowTexts.push(text);
      totalConfidence += result.confidence;
      rowCount++;
    }
  }

  onProgress?.({ stage: 'processing_table', progress: 0.5, message: 'Table OCR complete' });

  return {
    text: rowTexts.join('\n'),
    confidence: rowCount > 0 ? totalConfidence / rowCount : 0,
  };
}

/* ── Per-Region OCR ── */

/**
 * Get appropriate Tesseract PSM based on region type
 */
function getPSMForRegion(region: Region): number {
  switch (region.type) {
    case 'table':
      return 6; // Assume a single uniform block of text
    case 'small_text':
      return 7; // Treat the image as a single text line
    case 'paragraph':
    default:
      return 3; // Fully automatic page segmentation, but no OSD
  }
}

/**
 * Process a single region with adaptive preprocessing
 */
async function processRegion(canvas: HTMLCanvasElement, region: Region, onProgress?: ProgressCallback): Promise<{text: string, confidence: number}> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { text: '', confidence: 0 };

  // Crop region
  const regionCanvas = document.createElement('canvas');
  const regionCtx = regionCanvas.getContext('2d');
  if (!regionCtx) return { text: '', confidence: 0 };

  regionCanvas.width = region.width;
  regionCanvas.height = region.height;
  regionCtx.drawImage(canvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);

  // Adaptive preprocessing based on region type
  if (region.type === 'small_text') {
    // Upscale for better OCR of small text
    const upscaled = upscaleImage(regionCanvas, 2);

    // Apply Otsu thresholding
    const imageData = regionCtx.getImageData(0, 0, upscaled.width, upscaled.height);
    const thresholded = otsuThreshold(imageData);
    upscaled.getContext('2d')!.putImageData(thresholded, 0, 0);

    return await runTesseract(upscaled, getPSMForRegion(region));
  } else if (region.type === 'table') {
    return await processTableRegion(canvas, region, onProgress);
  } else {
    // For paragraph regions, apply adaptive thresholding
    const imageData = regionCtx.getImageData(0, 0, region.width, region.height);
    const thresholded = otsuThreshold(imageData);
    regionCtx.putImageData(thresholded, 0, 0);

    return await runTesseract(regionCanvas, getPSMForRegion(region));
  }
}

/**
 * Run Tesseract OCR on a canvas (with word-level bounding boxes)
 */
async function runTesseract(
  canvas: HTMLCanvasElement,
  psm: number,
  includeWords: boolean = false
): Promise<{text: string, confidence: number, words?: WordBox[]}> {
  // Delegate to the shared worker so the fine-tuned model is used here too.
  return runTesseractOnCanvas(canvas, psm, includeWords);
}

/* ── Field Extraction Patterns ── */

// Helper: Search for pattern within a window around a keyword match
function findProximityMatch(
  text: string,
  keywordPattern: RegExp,
  valuePattern: RegExp,
  maxDistance: number = 200 // Maximum characters from keyword
): { value: string; sourceText: string; confidence: number } | null {
  const keywordMatch = text.match(keywordPattern);
  if (!keywordMatch || !keywordMatch[0]) {
    return null;
  }

  const keywordIndex = text.indexOf(keywordMatch[0]);
  const searchStart = Math.max(0, keywordIndex - maxDistance);
  const searchEnd = Math.min(text.length, keywordIndex + keywordMatch[0].length + maxDistance);
  const searchWindow = text.slice(searchStart, searchEnd);

  const valueMatch = searchWindow.match(valuePattern);
  if (valueMatch && valueMatch[1]) {
    return {
      value: valueMatch[1].trim(),
      sourceText: valueMatch[0],
      confidence: 0.75, // Lower confidence for proximity matches
    };
  }

  return null;
}

// Helper: Search line by line for a pattern
function findLineByLineMatch(
  text: string,
  patterns: RegExp[],
  valuePattern: RegExp
): { value: string; sourceText: string; confidence: number } | null {
  const lines = text.split('\n');

  for (const line of lines) {
    // First, check if line contains any of the keyword patterns
    const hasKeyword = patterns.some(p => p.test(line));
    if (hasKeyword) {
      // Search this line and adjacent lines for the value pattern
      const lineIndex = lines.indexOf(line);
      const searchLines = [
        ...lines.slice(Math.max(0, lineIndex - 1), lineIndex + 2)
      ].join('\n');

      const valueMatch = searchLines.match(valuePattern);
      if (valueMatch && valueMatch[1]) {
        return {
          value: valueMatch[1].trim(),
          sourceText: valueMatch[0],
          confidence: 0.8,
        };
      }
    }
  }

  return null;
}

/* ── Spatial Proximity Extraction (Part A) ── */

/**
 * Keywords for spatial field extraction - Indian product label variants
 */
const SPATIAL_KEYWORDS = {
  manufacturer_name: [
    'mfg.', 'mfg', 'manufactured by', 'manufacturer', 'manufacturing by',
    'mfr.', 'mfr', 'from', 'produced by', 'made by', 'product of',
    'उत्पादक', 'निर्माता', // Hindi variants
  ],
  manufacturer_address: [
    'address', 'addr.', 'factory', 'plant', 'manufacturing unit',
    'works', 'फैक्टरी', 'पता', // Hindi variants
  ],
  manufacture_date: [
    'mfg', 'mfg.', 'manufacture', 'manufacturing', 'pack', 'packed on',
    'date of manufacture', 'dom', 'best before', 'exp', 'expiry',
    'निर्माण तिथि', // Hindi variant
  ],
  mrp: [
    'mrp', 'maximum retail price', 'm.r.p.', 'price', 'rate', '₹', 'rs.', 'rupees',
    'कीमत', // Hindi variant
  ],
  net_quantity: [
    'net wt', 'net weight', 'net quantity', 'qty',
    'वजन', // Hindi variant
  ],
} as const;

/**
 * Value patterns for spatial extraction (used after keyword is found spatially)
 */
const SPATIAL_VALUE_PATTERNS = {
  manufacturer_name: /([A-Za-z][A-Za-z\s&\.,-]{2,}(?:\s+(?:Ltd|Limited|Pvt|Private|Foods|Products|Industries|Enterprises|Pharma|Chemicals)?))/i,
  manufacturer_address: /([A-Za-z0-9\s,.-]{10,}(?:\s*[A-Z]{2,3}\s*\d{6,7})?)/i,
  manufacture_date: /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\/\-]?\d{4}|0?[1-9][\/\-]\d{4})/i,
  mrp: /([₹Rs.]?\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/i,
  net_quantity: /(\d+(?:\.\d+)?\s*(?:mg|g|kg|ml|l|litre|gram|grams|kilogram|kilograms|millilitre|millilitres))/i,
} as const;

/**
 * Check if two word boxes are on the same line (within a vertical threshold)
 */
function isSameLine(box1: WordBox, box2: WordBox, threshold: number = 10): boolean {
  const y1Mid = (box1.bbox.y0 + box1.bbox.y1) / 2;
  const y2Mid = (box2.bbox.y0 + box2.bbox.y1) / 2;
  return Math.abs(y1Mid - y2Mid) < threshold;
}

/**
 * Check if box2 is to the right of box1 (within a reasonable horizontal distance)
 */
function isToRight(box1: WordBox, box2: WordBox, maxDistance: number = 300): boolean {
  return box2.bbox.x0 > box1.bbox.x1 && (box2.bbox.x0 - box1.bbox.x1) < maxDistance;
}

/**
 * Check if box2 is below box1 (within a reasonable vertical distance)
 */
function isBelow(box1: WordBox, box2: WordBox, maxDistance: number = 50): boolean {
  return box2.bbox.y0 > box1.bbox.y1 && (box2.bbox.y0 - box1.bbox.y1) < maxDistance;
}

/**
 * Extract field value using spatial proximity to a keyword
 */
function extractFieldValueSpatially(
  words: WordBox[],
  fieldKey: keyof typeof SPATIAL_KEYWORDS
): { value: string | null; confidence: number; sourceText: string; crop?: { x0: number; y0: number; x1: number; y1: number } } | null {
  const keywords = SPATIAL_KEYWORDS[fieldKey];
  const valuePattern = SPATIAL_VALUE_PATTERNS[fieldKey];

  if (!keywords || !valuePattern) return null;

  // Find all keyword matches with their positions
  const keywordMatches: WordBox[] = [];

  for (const keyword of keywords) {
    const keywordWords = keyword.toLowerCase().split(' ');

    // Look for consecutive words that match the keyword phrase
    for (let i = 0; i <= words.length - keywordWords.length; i++) {
      let match = true;
      for (let j = 0; j < keywordWords.length; j++) {
        if (words[i + j].text.toLowerCase() !== keywordWords[j]) {
          match = false;
          break;
        }
      }

      if (match) {
        keywordMatches.push(words[i]);
        break; // Take first match for this keyword variant
      }
    }
  }

  if (keywordMatches.length === 0) {
    // Keyword not found - field stays missing (no blob-wide fallback)
    return null;
  }

  // For each keyword match, search for value nearby
  for (const keywordBox of keywordMatches) {
    // Collect candidate words (same line to the right, or lines below)
    const candidates: WordBox[] = [];

    for (const word of words) {
      if (word === keywordBox) continue;

      // Same line, to the right
      if (isSameLine(keywordBox, word) && isToRight(keywordBox, word)) {
        candidates.push(word);
      }
      // Lines below (within reasonable distance)
      else if (isBelow(keywordBox, word)) {
        // Check if it's roughly aligned horizontally with the keyword
        const isAligned = Math.abs(word.bbox.x0 - keywordBox.bbox.x0) < 100;
        if (isAligned) {
          candidates.push(word);
        }
      }
    }

    // Sort candidates by position (left-to-right, top-to-bottom)
    candidates.sort((a, b) => {
      if (Math.abs(a.bbox.y0 - b.bbox.y0) < 10) {
        return a.bbox.x0 - b.bbox.x0; // Same line - sort by x
      }
      return a.bbox.y0 - b.bbox.y0; // Different lines - sort by y
    });

    // Concatenate candidate words and apply value pattern
    const candidateText = candidates.map(w => w.text).join(' ');
    const valueMatch = candidateText.match(valuePattern);

    if (valueMatch && valueMatch[1]) {
      // Calculate confidence based on word confidences and spatial proximity
      const avgWordConfidence = candidates.length > 0
        ? candidates.reduce((sum, w) => sum + w.confidence, 0) / candidates.length
        : 0.7;

      // Boost confidence if value is on the same line as keyword
      const sameLineBoost = candidates.length > 0 && isSameLine(keywordBox, candidates[0]) ? 0.1 : 0;

      const confidence = Math.min(0.95, avgWordConfidence + sameLineBoost);

      // Bounding box over the keyword + candidate value words, for the
      // whitelisted refinement pass on structured fields (Part B).
      const xs = [keywordBox.bbox.x0, keywordBox.bbox.x1, ...candidates.map(c => c.bbox.x0), ...candidates.map(c => c.bbox.x1)];
      const ys = [keywordBox.bbox.y0, keywordBox.bbox.y1, ...candidates.map(c => c.bbox.y0), ...candidates.map(c => c.bbox.y1)];
      const crop = {
        x0: Math.min(...xs) - 6,
        y0: Math.min(...ys) - 4,
        x1: Math.max(...xs) + 6,
        y1: Math.max(...ys) + 4,
      };

      return {
        value: valueMatch[1].trim(),
        confidence,
        sourceText: valueMatch[0],
        crop,
      };
    }
  }

  return null;
}

/**
 * Extract fields using spatial proximity. Structured fields (mrp,
 * net_quantity, manufacture_date) carry a crop region for the whitelisted
 * refinement pass; free-text fields are never cropped/whitelisted.
 */
/** Internal spatial result with the optional crop for refinement (Part B). */
interface SpatialField extends ExtractedField {
  _crop?: { x0: number; y0: number; x1: number; y1: number };
}

function extractFieldsSpatially(words: WordBox[]): SpatialField[] {
  const fields: SpatialField[] = [];
  const highSeverityFields: Array<keyof typeof SPATIAL_KEYWORDS> = [
    'manufacturer_name',
    'manufacturer_address',
    'manufacture_date',
    'mrp',
    'net_quantity',
  ];

  for (const fieldKey of highSeverityFields) {
    const result = extractFieldValueSpatially(words, fieldKey);

    if (result && result.value) {
      fields.push({
        fieldName: fieldKey,
        value: result.value,
        confidence: result.confidence,
        sourceText: result.sourceText,
        _crop: result.crop,
      });
    }
  }

  return fields;
}

const FIELD_PATTERNS = {
  manufacturer_name: [
    /(?:manufactured\s+by|produced\s+and\s+packed\s+by|packed\s+by|mfr\.?|mfg\.?|manufacturer)[:\s]+([^\n\r]+)/i,
    /(?:from|produced\s+by)[:\s]+([^\n\r]+)/i,
  ],
  manufacturer_address: [
    /(?:address|addr\.?)[:\s]+([^\n\r]+?(?:\n|$))/i,
  ],
  net_quantity: [
    /(?:net\s+wt\.?|net\s+weight|net\s+quantity|qty)[:\s]+(\d+(?:\.\d+)?\s*(?:g|kg|mg|ml|l|litre|gram|grams|kilogram|kilograms|millilitre|millilitres))/i,
  ],
  mrp: [
    /(?:mrp|maximum\s+retail\s+price)[:\s]*[₹Rs.]?\s*(\d+(?:\.\d{1,2})?)/i,
    /[₹Rs.]?\s*(\d+(?:\.\d{1,2})?)\s*(?:\/-|\/\s*only|only)/i,
  ],
  mrp_inclusive_statement: [
    /(?:inclusive\s+(?:of\s+)all\s+taxes|taxes\s+included|incl\.?\s*of\s*taxes)/i,
  ],
  manufacture_date: [
    /(?:mfg|manufacture|manufacturing|pack|best\s+before|exp|expiry)[:\s]+([A-Za-z]{3,9}[\s\/-]\d{4}|0?[1-9][\/\-]\d{4})/i,
  ],
  consumer_care: [
    /(?:consumer\s+care|customer\s+care|toll\s*free|helpline|contact|support)[:\s]+([^\n\r]+?)(?:\n|$)/i,
  ],
  other_declarations: [
    /(?:fssai|food\s+safety|license|lic\.?no\.?|imported\s+(?:and|&)\s+marketed\s+by|packed|marketer)[:\s]+([^\n\r]+)/i,
  ],
  hazard_pictograms: [
    /(?:hazard|danger|warning|caution|pictogram|ghs)[:\s]+([^\n\r]+?)(?:\n|$)/i,
  ],
  signal_word: [
    /(?:signal\s*word)[:\s]*(danger|warning|caution)/i,
  ],
  hazard_statements: [
    /(?:hazard\s+statements|h-\s?codes?)[:\s]+([^\n\r]+?)(?:\n|$)/i,
  ],
  precautionary_statements: [
    /(?:precautionary\s+statements|p-\s?codes?)[:\s]+([^\n\r]+?)(?:\n|$)/i,
  ],
  first_aid_instructions: [
    /(?:first\s+aid|overdose|in\s+case\s+of|emergency)[:\s]+([^\n\r]+?)(?:\n|$)/i,
  ],
};

// Proximity-based fallback patterns (only searched near keywords)
const PROXIMITY_PATTERNS = {
  manufacturer_address: {
    keywords: [/(?:address|addr\.?|factory|plant)/i],
    pattern: /([A-Za-z\s]+,\s*[A-Za-z\s]+,\s*[A-Z]{2,3}\s*\d{6,7})/,
  },
  consumer_care: {
    keywords: [/(?:consumer\s+care|customer\s+care|toll\s*free|helpline|contact|support|phone|email)/i],
    pattern: /((?:\+?91[\s-]?)?\d{10,12}|1?800[\s-]?\d{6,10})/,
  },
  consumer_care_email: {
    keywords: [/(?:consumer\s+care|customer\s+care|contact|support|email|mail)/i],
    pattern: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
  },
  hazard_pictograms: {
    keywords: [/(?:hazard|danger|warning|caution|ghs|safety)/i],
    pattern: /(flame|skull|corrosion|exclamation|health|environment|gas|exploding)/i,
  },
  signal_word: {
    keywords: [/(?:signal|warning|caution|danger)/i],
    pattern: /^(danger|warning|caution)[:,\s]*/i,
  },
  hazard_statements: {
    keywords: [/(?:hazard|statements|h-\s?code|ghs)/i],
    pattern: /(h\d{3}[^;\n]*)/i,
  },
  precautionary_statements: {
    keywords: [/(?:precautionary|statements|p-\s?code|safety|handling)/i],
    pattern: /(p\d{3}[^;\n]*)/i,
  },
};

/* ── Extract Fields from Text ── */

function extractFieldsFromText(text: string, regionConfidence: number): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Prefer a product-like title over panel headings such as "Nutrition Facts".
  const productName = lines.find(line =>
    line.length > 3 && line.length < 100 &&
    !/^(nutrition facts|serving size|servings per container|amount per|% daily value|ingredients?|directions?)\b/i.test(line) &&
    /\b(rice|wheat|flour|food|product|organic|basmati|snack|oil|salt|sugar|tea|coffee)\b/i.test(line)
  ) || (lines[0]?.length > 3 && lines[0].length < 100 ? lines[0] : null);

  // Extract manufacturer name (first line containing common manufacturer keywords)
  let manufacturerName: string | null = null;
  for (const line of lines) {
    if (/manufactured|produced|packed\s+by|marketed\s+by|mfr|mfg|ltd|limited|pvt|private|foods|products|industries/i.test(line)) {
      const labeledName = line.match(/(?:manufactured\s+by|produced\s+and\s+packed\s+by|packed\s+by|produced\s+by|marketed\s+by)[:\s]+(.+)/i);
      manufacturerName = (labeledName?.[1] || line.split(/(?:for|limited|ltd|pvt)/i)[0]).trim();
      break;
    }
  }

  // Extract each field using patterns with proximity-based fallback
  for (const [fieldName, patterns] of Object.entries(FIELD_PATTERNS)) {
    let bestMatch: { value: string | null; confidence: number; sourceText: string } = {
      value: null,
      confidence: 0,
      sourceText: '',
    };

    // Try primary patterns first (keyword-anchored)
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();
        // High confidence for keyword-anchored matches
        const baseConfidence = value.length > 3 ? 0.85 : 0.7;
        const confidence = baseConfidence * regionConfidence;

        if (confidence > bestMatch.confidence) {
          bestMatch = { value, confidence, sourceText: match[0] };
        }
      }
    }

    // If no keyword-anchored match found, try proximity-based fallback for certain fields
    if (!bestMatch.value && PROXIMITY_PATTERNS[fieldName as keyof typeof PROXIMITY_PATTERNS]) {
      const proximityConfig = PROXIMITY_PATTERNS[fieldName as keyof typeof PROXIMITY_PATTERNS];
      
      for (const keywordPattern of proximityConfig.keywords) {
        const proximityMatch = findProximityMatch(text, keywordPattern, proximityConfig.pattern);
        if (proximityMatch) {
          const confidence = proximityMatch.confidence * regionConfidence;
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              value: proximityMatch.value,
              confidence,
              sourceText: proximityMatch.sourceText,
            };
          }
        }
      }
    }

    // Special case: consumer_care can have both phone and email
    if (fieldName === 'consumer_care' && !bestMatch.value) {
      // Try email as fallback
      for (const keywordPattern of PROXIMITY_PATTERNS.consumer_care_email.keywords) {
        const emailMatch = findProximityMatch(text, keywordPattern, PROXIMITY_PATTERNS.consumer_care_email.pattern);
        if (emailMatch) {
          const confidence = emailMatch.confidence * regionConfidence;
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              value: emailMatch.value,
              confidence,
              sourceText: emailMatch.sourceText,
            };
          }
        }
      }

      const contactMatch = text.match(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}|[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/);
      if (contactMatch) {
        bestMatch = {
          value: contactMatch[0].trim(),
          confidence: 0.65 * regionConfidence,
          sourceText: contactMatch[0],
        };
      }
    }

    // Only add field if we found a match with reasonable confidence
    if (bestMatch.value && bestMatch.confidence > 0.3) {
      fields.push({
        fieldName,
        value: bestMatch.value,
        confidence: bestMatch.confidence,
        sourceText: bestMatch.sourceText,
      });
    } else {
      // Add field with null value to indicate it was checked but not found
      fields.push({
        fieldName,
        value: null,
        confidence: 0,
        sourceText: '',
      });
    }
  }

  // Add product name and manufacturer as special fields
  if (productName) {
    fields.unshift({
      fieldName: 'product_name',
      value: productName,
      confidence: 0.9 * regionConfidence,
      sourceText: productName,
    });
  }

  if (manufacturerName) {
    fields.unshift({
      fieldName: 'manufacturer_detected',
      value: manufacturerName,
      confidence: 0.8 * regionConfidence,
      sourceText: manufacturerName,
    });
  }

  return fields;
}

/* ── Main OCR Function ── */

export async function performOCR(imageFile: File, onProgress?: ProgressCallback, options?: OCROptions): Promise<OCRResult> {
  try {
    onProgress?.({ stage: 'starting', progress: 0, message: 'Starting OCR...' });

    // Step 1: Normalize file format (convert HEIC/PDF if needed)
    onProgress?.({ stage: 'normalizing', progress: 0.05, message: 'Normalizing file format...' });
    const normalizedFile = await normalizeImageFile(imageFile, onProgress);

    // Step 2: Load image and resize (Lite Mode caps the OCR canvas at 900px
    // to cut peak canvas memory ~4× on low-RAM devices)
    const OCR_MAX_EDGE = isLiteMode() ? 900 : 2000;
    onProgress?.({ stage: 'loading', progress: 0.15, message: 'Loading image...' });
    const canvas = await new Promise<HTMLCanvasElement>((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      img.onload = () => {
        // Set canvas dimensions (resize to reasonable size for OCR)
        const maxWidth = OCR_MAX_EDGE;
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        // Draw original image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas);
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(normalizedFile);
    });

    // Step 3: Detect regions automatically or process the user-selected section
    const regionMode = options?.regionMode || 'auto';
    const regions = regionMode === 'auto'
      ? getFilteredRegions(canvas, onProgress)
      : regionMode === 'full'
        ? []
        : getSelectedRegion(canvas, regionMode);

    let rawText = '';
    let allFields: ExtractedField[] = [];
    let totalConfidence = 0;
    let regionCount = 0;

    /**
     * Word boxes from the full-image spatial OCR pass (OCR-canvas pixel
     * space). Populated only on the fallback spatial path; exported in the
     * result for opt-in training-sample capture.
     */
    let spatialWordBoxes: WordBox[] = [];

    onProgress?.({
      stage: 'detecting_regions',
      progress: 0.35,
      message: regionMode === 'auto'
        ? `Found ${regions.length} text regions`
        : regionMode === 'full'
          ? 'Using the entire label with spatial OCR'
          : 'Using the selected image region',
    });

    // Step 4: Process each region
    if (regions.length > 0) {
      // Region-aware OCR
      for (let i = 0; i < regions.length; i++) {
        const region = regions[i];
        onProgress?.({
          stage: 'ocr',
          progress: 0.35 + (i / regions.length) * 0.5,
          message: `Processing region ${i + 1}/${regions.length} (${region.type})...`
        });

        const result = await processRegion(canvas, region, onProgress);

        if (result.text.trim().length > 0) {
          rawText += result.text.trim() + '\n\n';
          totalConfidence += result.confidence;
          regionCount++;

          // Extract fields from this region
          const regionFields = extractFieldsFromText(result.text, result.confidence);
          allFields = allFields.concat(regionFields);
        }
      }
    } else {
      // Fallback: Full-image OCR with basic preprocessing AND spatial extraction
      onProgress?.({ stage: 'ocr', progress: 0.4, message: 'No regions detected, using full-image OCR with spatial extraction...' });

      // Apply basic preprocessing
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const grayscale = toGrayscale(imageData);
        const thresholded = otsuThreshold(grayscale);
        ctx.putImageData(thresholded, 0, 0);
      }

      // Run OCR with word-level bounding boxes for spatial extraction
      // (uses the shared worker and the fine-tuned model when deployed)
      const result = await runTesseractOnCanvas(canvas, 3, true, (p) => {
        if (p.stage === 'ocr') {
          onProgress?.({
            stage: 'ocr',
            progress: 0.4 + p.progress * 0.4,
            message: p.message,
          });
        }
      });

      rawText = result.text;
      totalConfidence = result.confidence;
      regionCount = 1;

      // Word-level bounding boxes for spatial extraction (Part A)
      const words: WordBox[] = result.words ?? [];
      spatialWordBoxes = words;

      // First, extract high-severity fields using spatial proximity (Part A)
      const spatialFields = extractFieldsSpatially(words);

      // Part B: targeted whitelisted refinement pass on structured fields.
      // Re-runs recognition on just the keyword+value crop with a restricted
      // character set; the whitelisted read is PREFERRED when it disagrees
      // with the general pass (e.g. a smudged "8" read as "B"). Free-text
      // fields (manufacturer name/address) are never whitelisted.
      for (const spatialField of spatialFields) {
        const whitelist = FIELD_CHAR_WHITELISTS[spatialField.fieldName];
        if (!whitelist || !spatialField._crop) continue;

        const refined = await runWhitelistedRegionPass(canvas, spatialField._crop, whitelist);
        if (!refined) continue;

        // Sanity gate: a structured field must contain at least one digit.
        const normalized = refined.text.replace(/\s+/g, ' ').trim();
        if (!/\d/.test(normalized)) continue;

        spatialField.value = normalized;
        spatialField.sourceText = normalized;
        // Whitelisted single-line reads on the exact region are high-trust.
        spatialField.confidence = Math.min(0.98, Math.max(refined.confidence, spatialField.confidence));
      }

      // Then, extract remaining fields using traditional regex patterns
      const regexFields = extractFieldsFromText(rawText, totalConfidence);

      // Merge fields: spatial extraction takes priority for high-severity fields
      const highSeverityFieldNames = ['manufacturer_name', 'manufacturer_address', 'manufacture_date', 'mrp', 'net_quantity'];

      for (const field of regexFields) {
        const spatialField = spatialFields.find(f => f.fieldName === field.fieldName);

        if (highSeverityFieldNames.includes(field.fieldName)) {
          // Use spatial extraction result if available and has reasonable confidence
          if (spatialField && spatialField.confidence > 0.5) {
            // Skip the regex field, spatial field is better
            continue;
          }
          // Otherwise, use regex field as fallback
        }

        // For non-high-severity fields, always use regex
        allFields.push(field);
      }

      // Add spatial fields that weren't covered by regex, stripping the
      // internal _crop helper so it doesn't leak into stored field data.
      for (const spatialField of spatialFields) {
        const regexField = allFields.find(f => f.fieldName === spatialField.fieldName);

        if (!regexField && spatialField.confidence > 0.5) {
          const cleanField: ExtractedField = {
            fieldName: spatialField.fieldName,
            value: spatialField.value,
            confidence: spatialField.confidence,
            sourceText: spatialField.sourceText,
            reasoning: spatialField.reasoning,
          };
          allFields.push(cleanField);
        }
      }
    }

    // Step 5: Aggregate confidence
    const overallConfidence = regionCount > 0 ? totalConfidence / regionCount : 0;

    onProgress?.({ stage: 'complete', progress: 0.95, message: 'OCR complete' });

    // Step 6: Find product name and manufacturer from extracted fields
    const productNameField = allFields.find(f => f.fieldName === 'product_name');
    const manufacturerField = allFields.find(f => f.fieldName === 'manufacturer_detected');

    // Determine extraction method
    const hasSpatialFields = allFields.some(f =>
      ['manufacturer_name', 'manufacturer_address', 'manufacture_date', 'mrp'].includes(f.fieldName) && f.confidence > 0.6
    );

    return {
      productName: productNameField?.value || null,
      manufacturerName: manufacturerField?.value || null,
      fields: allFields.filter(f => !['product_name', 'manufacturer_detected'].includes(f.fieldName)),
      rawText,
      overallConfidence,
      extractionMethod: hasSpatialFields ? 'local_spatial' : undefined,
      // Export word boxes for opt-in training-sample capture (review-time crops).
      wordBoxes: spatialWordBoxes.length > 0
        ? spatialWordBoxes.map(w => ({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }))
        : undefined,
      ocrCanvasWidth: spatialWordBoxes.length > 0 ? canvas.width : undefined,
    };
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error(error instanceof Error ? error.message : 'OCR processing failed');
  }
}

/* ── Utility: Extract field value by name ── */

export function getFieldValue(ocrResult: OCRResult, fieldName: string): string | null {
  const field = ocrResult.fields.find(f => f.fieldName === fieldName);
  return field?.value || null;
}

/* ── Utility: Get field confidence ── */

export function getFieldConfidence(ocrResult: OCRResult, fieldName: string): number {
  const field = ocrResult.fields.find(f => f.fieldName === fieldName);
  return field?.confidence || 0;
}

/**
 * Downscale + recompress an image for cloud AI transport.
 * Vision models don't need 2000px images: 1400px on the long edge keeps label
 * text readable while typically shrinking the payload 5-6x. Huge uploads are
 * the #1 cause of slow/failed cloud OCR calls (and provider 413/429 errors).
 * Returns the original file when it is already small enough or can't be decoded.
 */
async function downscaleImageForAI(file: File, maxEdge: number = 1400, quality: number = 0.85): Promise<File> {
  if (typeof document === 'undefined') return file;
  /* Lite Mode: 900px cuts canvas/decode memory (~4× less peak RAM than
     1400px) with acceptable single-label OCR accuracy. */
  if (isLiteMode()) maxEdge = Math.min(maxEdge, 900);
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    // Skip re-encoding when already within bounds AND small on the wire
    if (scale >= 1 && file.size < 512 * 1024) {
      bitmap.close?.();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file; // Decode failure: send the original
  }
}

/* ── Cloud OCR via AI Provider ── */

/**
 * Perform OCR using cloud AI provider (e.g., Thinking Machines Inkling via OpenRouter)
 * This is an optional, opt-in enhanced accuracy mode
 */
export async function performCloudOCR(
  imageFile: File,
  provider: { apiUrl: string; model: string; apiKey: string; category?: string },
  onProgress?: ProgressCallback
): Promise<OCRResult> {
  try {
    onProgress?.({ stage: 'cloud_ocr', progress: 0.1, message: 'Starting cloud OCR...' });

    // Downscale large photos before upload: cloud vision models don't need
    // full resolution, and big payloads cause most slow/failed AI calls.
    const transportFile = await downscaleImageForAI(imageFile);

    // Convert image to base64
    const base64Image = await fileToBase64(transportFile);
    onProgress?.({ stage: 'cloud_ocr', progress: 0.3, message: 'Sending to AI service...' });

    // Vision models commonly need 30-60s and providers occasionally return
    // transient 5xx/502 — retry with backoff instead of failing the scan.
    const MAX_ATTEMPTS = 3;
    let response: Response | null = null;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch('/api/vision-fallback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image: base64Image,
            provider,
            category: provider.category || 'openrouter',
          }),
        });

        // Retry ONLY transient upstream failures; 4xx are real config errors.
        if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < MAX_ATTEMPTS) {
          lastError = new Error(`Transient provider error (${res.status})`);
          const backoffMs = 1500 * Math.pow(2, attempt - 1); // 1.5s, 3s
          onProgress?.({
            stage: 'cloud_ocr',
            progress: 0.3,
            message: `AI provider hiccup (${res.status}) — retrying in ${Math.round(backoffMs / 1000)}s...`,
          });
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        response = res;
        break;
      } catch (fetchError) {
        lastError = fetchError instanceof Error ? fetchError : new Error('Network failure');
        if (attempt < MAX_ATTEMPTS) {
          const backoffMs = 1500 * Math.pow(2, attempt - 1);
          onProgress?.({
            stage: 'cloud_ocr',
            progress: 0.3,
            message: `Connection issue — retrying in ${Math.round(backoffMs / 1000)}s...`,
          });
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    }

    if (!response) {
      throw lastError ?? new Error('Cloud OCR failed after retries');
    }

    onProgress?.({ stage: 'cloud_ocr', progress: 0.7, message: 'Processing AI response...' });

    if (!response.ok) {
      // Try to parse error response, but handle non-JSON responses gracefully
      const contentType = response.headers.get('content-type');
      let errorMessage = `Cloud OCR failed: ${response.status}`;

      if (contentType?.includes('application/json')) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        errorMessage = errorData.error || errorMessage;
      } else {
        const text = await response.text();
        if (text && !text.startsWith('<!DOCTYPE')) {
          errorMessage = text;
        }
      }

      throw new Error(errorMessage);
    }

    // Check content type before parsing JSON
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Server returned non-JSON response: ${text.substring(0, 100)}`);
    }

    const result = await response.json();

    onProgress?.({ stage: 'cloud_ocr', progress: 0.95, message: 'Cloud OCR complete' });

    return result;
  } catch (error) {
    console.warn('Cloud OCR unavailable; the caller may fall back to local OCR:', error);
    throw new Error(error instanceof Error ? error.message : 'Cloud OCR processing failed');
  }
}

/**
 * Convert a File to base64 string
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix if present
      const base64 = result.split(',')[1] || result;
      resolve(`data:image/jpeg;base64,${base64}`);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/* ── Hybrid Extraction (Part A + Part B) ── */

/**
 * High-severity fields that require cloud fallback if local confidence is low
 */
const HIGH_SEVERITY_FIELDS = [
  'manufacturer_name',
  'manufacturer_address',
  'manufacture_date',
  'mrp',
] as const;

/**
 * Confidence threshold below which cloud AI is triggered for high-severity fields
 */
const CLOUD_FALLBACK_THRESHOLD = 0.65;

/**
 * Merge local and cloud OCR results, prioritizing cloud for high-severity fields
 */
function mergeOCRResults(
  localResult: OCRResult,
  cloudResult: OCRResult
): OCRResult {
  const mergedFields: ExtractedField[] = [...localResult.fields];

  // For high-severity fields, cloud result takes priority if confidence is better
  for (const fieldName of HIGH_SEVERITY_FIELDS) {
    const localField = localResult.fields.find(f => f.fieldName === fieldName);
    const cloudField = cloudResult.fields.find(f => f.fieldName === fieldName);

    // Use cloud field if:
    // 1. Local field is missing, OR
    // 2. Local confidence is below threshold, OR
    // 3. Cloud confidence is significantly better (0.15+ higher)
    if (cloudField) {
      const shouldUseCloud =
        !localField ||
        localField.confidence < CLOUD_FALLBACK_THRESHOLD ||
        (cloudField.confidence - localField.confidence) > 0.15;

      if (shouldUseCloud) {
        // Remove local field if it exists
        const localIndex = mergedFields.findIndex(f => f.fieldName === fieldName);
        if (localIndex >= 0) {
          mergedFields.splice(localIndex, 1);
        }

        // Add cloud field with reasoning
        mergedFields.push(cloudField);
      }
    }
  }

  // Add any non-high-severity fields from cloud that aren't in local
  for (const cloudField of cloudResult.fields) {
    const existsInMerged = mergedFields.some(f => f.fieldName === cloudField.fieldName);
    const isHighSeverity = (HIGH_SEVERITY_FIELDS as readonly string[]).includes(cloudField.fieldName);

    if (!existsInMerged && !isHighSeverity) {
      mergedFields.push(cloudField);
    }
  }

  // Merge reasoning from cloud
  const mergedReasoning = {
    ...localResult.aiReasoning,
    ...cloudResult.aiReasoning,
  };

  // Calculate weighted overall confidence (cloud fields get more weight)
  const cloudFieldsCount = cloudResult.fields.length;
  const localFieldsCount = localResult.fields.length;
  const overallConfidence =
    (localResult.overallConfidence * localFieldsCount + cloudResult.overallConfidence * cloudFieldsCount) /
    (localFieldsCount + cloudFieldsCount);

  return {
    productName: cloudResult.productName || localResult.productName,
    manufacturerName: cloudResult.manufacturerName || localResult.manufacturerName,
    fields: mergedFields,
    rawText: localResult.rawText, // Keep local rawText as it's more complete
    overallConfidence,
    extractionMethod: 'hybrid',
    aiReasoning: Object.keys(mergedReasoning).length > 0 ? mergedReasoning : undefined,
  };
}

/**
 * Perform hybrid OCR: Local spatial extraction first, cloud AI fallback for low-confidence high-severity fields
 */
export async function performHybridOCR(
  imageFile: File,
  provider: { apiUrl: string; model: string; apiKey: string; category?: string },
  onProgress?: ProgressCallback,
  options?: OCROptions
): Promise<OCRResult> {
  try {
    // Step 1: Local OCR with spatial extraction (Part A)
    onProgress?.({ stage: 'local_ocr', progress: 0.05, message: 'Starting local OCR with spatial extraction...' });
    const localResult = await performOCR(imageFile, (progress) => {
      // Map local OCR progress (0-1) to hybrid progress (0-0.5)
      onProgress?.({
        ...progress,
        progress: progress.progress * 0.5,
      });
    }, options);

    onProgress?.({ stage: 'local_ocr', progress: 0.5, message: 'Local OCR complete' });

    // Step 2: Check if cloud fallback is needed for high-severity fields
    const needsCloudFallback = HIGH_SEVERITY_FIELDS.some(fieldName => {
      const field = localResult.fields.find(f => f.fieldName === fieldName);
      // Fallback if field is missing OR has low confidence
      return !field || field.confidence < CLOUD_FALLBACK_THRESHOLD;
    });

    if (!needsCloudFallback) {
      onProgress?.({ stage: 'complete', progress: 1.0, message: 'All high-severity fields extracted locally' });
      console.log('[Hybrid OCR] All high-severity fields have good confidence, skipping cloud fallback');
      return {
        ...localResult,
        extractionMethod: 'local_spatial',
      };
    }

    // Step 3: Cloud OCR fallback for high-severity fields (Part B)
    onProgress?.({ stage: 'cloud_fallback', progress: 0.55, message: 'High-severity fields need cloud AI, initiating...' });

    try {
      const cloudResult = await performCloudOCR(imageFile, provider, (progress) => {
        // Map cloud OCR progress (0-1) to hybrid progress (0.5-1.0)
        onProgress?.({
          ...progress,
          progress: 0.5 + progress.progress * 0.5,
        });
      });

      onProgress?.({ stage: 'merging', progress: 0.95, message: 'Merging local and cloud results...' });

      // Step 4: Merge results
      const mergedResult = mergeOCRResults(localResult, cloudResult);

      // Log what was improved
      const improvedFields = HIGH_SEVERITY_FIELDS.filter(fieldName => {
        const localField = localResult.fields.find(f => f.fieldName === fieldName);
        const cloudField = cloudResult.fields.find(f => f.fieldName === fieldName);
        return cloudField && (!localField || cloudField.confidence > localField.confidence);
      });

      if (improvedFields.length > 0) {
        console.log(`[Hybrid OCR] Cloud AI improved ${improvedFields.length} high-severity fields: ${improvedFields.join(', ')}`);
      }

      onProgress?.({ stage: 'complete', progress: 1.0, message: 'Hybrid OCR complete' });

      return mergedResult;
    } catch (cloudError) {
      console.warn('[Hybrid OCR] Cloud fallback failed, using local result:', cloudError);
      onProgress?.({ stage: 'complete', progress: 1.0, message: 'Cloud fallback failed, using local result' });
      return {
        ...localResult,
        extractionMethod: 'local_spatial',
      };
    }
  } catch (error) {
    console.error('Hybrid OCR Error:', error);
    throw new Error(error instanceof Error ? error.message : 'Hybrid OCR processing failed');
  }
}
