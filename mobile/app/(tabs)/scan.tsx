// ═══════════════════════════════════════════════════════════════
// Scan Product — photograph (or pick) a product label, send it to the
// backend's AI vision extractor (/api/vision-fallback — the same
// endpoint the web app's AI/Hybrid modes use), then run the local
// rules engine and persist the scan. On-device Tesseract isn't
// available in React Native, so AI extraction is the native path;
// the fully-offline alternative is the manual Audit tab.
// ═══════════════════════════════════════════════════════════════

import { useRef, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat, type Action } from 'expo-image-manipulator';
import { router } from 'expo-router';
import { apiJson } from '@/lib/api';
import { createScanFromOCR } from '@/lib/local-data';
import { notifyDataChange } from '@/lib/hooks';
import { enabledProvider } from '@/lib/ai-providers';
import { C, F, R } from '@/theme';
import {
  Badge,
  Btn,
  BusyOverlay,
  Card,
  ErrorBanner,
  InfoBanner,
  Screen,
  T,
} from '@/components/ui';

/** Downscale to ≤1400px (vision models don't need more; upload stays fast). */
async function prepareBase64(uri: string, width?: number, height?: number): Promise<string> {
  let actions: Action[] = [];
  const maxDim = 1400;
  if (width && height && Math.max(width, height) > maxDim) {
    const scale = maxDim / Math.max(width, height);
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);
    actions = [{ resize: { width: targetW, height: targetH } }];
  }
  const result = await manipulateAsync(uri, actions, { compress: 0.75, format: SaveFormat.JPEG, base64: true });
  if (!result.base64) throw new Error('Could not read the image');
  return `data:image/jpeg;base64,${result.base64}`;
}

interface VisionField {
  fieldName: string;
  value: string | null;
  confidence: number;
  sourceText?: string;
  reasoning?: string;
}

interface VisionResult {
  productName?: string | null;
  manufacturerName?: string | null;
  fields?: VisionField[];
  rawText?: string;
  overallConfidence?: number;
  usedBuiltIn?: boolean;
  extractionMethod?: string;
  error?: string;
}

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState('');

  const provider = enabledProvider();
  const usingBuiltIn = provider === null;

  async function runScan(dataUrl: string) {
    setError(null);
    setNote(null);
    setScanning(true);
    setBusyLabel('Reading the label with AI vision…');
    try {
      const { ok, status, data } = await apiJson<VisionResult>('/api/vision-fallback', {
        method: 'POST',
        body: JSON.stringify({
          image: dataUrl,
          provider: provider
            ? { apiUrl: provider.apiUrl, model: provider.model, apiKey: provider.apiKey, category: provider.category }
            : undefined,
        }),
      });
      if (!ok || !data.fields) {
        setScanning(false);
        setPreview(null);
        setError(data.error ?? (status === 429 ? 'Rate limited — wait a moment and try again.' : 'The scan failed. Try again or use the Audit tab.'));
        return;
      }
      setBusyLabel('Running the Legal Metrology rules engine…');
      const scan = createScanFromOCR({
        productName: data.productName ?? null,
        manufacturerName: data.manufacturerName ?? null,
        fields: (data.fields ?? []).map((f) => ({
          fieldName: f.fieldName,
          value: f.value,
          confidence: f.confidence,
          notes: f.reasoning ?? f.sourceText ?? null,
        })),
        overallConfidence: data.overallConfidence,
      });
      notifyDataChange();
      setScanning(false);
      setPreview(null);
      router.push(`/scan/${scan.id}`);
    } catch {
      setScanning(false);
      setPreview(null);
      setError('The scan failed unexpectedly. Try again or use the Audit tab.');
    }
  }

  async function shoot() {
    setError(null);
    setNote(null);
    try {
      const shot = await cameraRef.current?.takePictureAsync({ quality: 0.8, base64: false });
      if (!shot?.uri) return;
      const dataUrl = await prepareBase64(shot.uri, shot.width, shot.height);
      setCameraOn(false);
      setPreview(dataUrl);
    } catch {
      setCameraOn(false);
      setError('Could not capture the photo — check camera permissions.');
    }
  }

  async function pickFromLibrary() {
    setError(null);
    setNote(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      base64: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    try {
      const dataUrl = await prepareBase64(asset.uri, asset.width, asset.height);
      setPreview(dataUrl);
    } catch {
      setError('Could not read that image.');
    }
  }

  async function openCamera() {
    setError(null);
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Camera permission needed', 'Allow camera access to photograph labels, or pick an existing photo instead.');
        return;
      }
    }
    setCameraOn(true);
  }

  /* ── Live camera ── */
  if (cameraOn) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, padding: 24 }}>
          <Btn title="Cancel" variant="outline" onPress={() => setCameraOn(false)} />
          <View style={{ width: 160 }}>
            <Btn title="📸 Capture" onPress={shoot} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <Screen>
      <T size={F.xxl} weight="700" style={{ marginBottom: 4 }}>
        📷 Scan Product
      </T>
      <T size={F.sm} color={C.textDim} style={{ marginBottom: 16 }}>
        Photograph a packaged-commodity label — AI vision extracts every mandatory declaration, then the rules engine checks it against the LM (PC) Rules, 2011.
      </T>

      {usingBuiltIn ? (
        <InfoBanner message="Using the built-in default AI model (server-held key, 10 scans/min per network). Add your own key in Settings → AI Providers for unlimited personal scans." />
      ) : (
        <InfoBanner message={`Using your provider: ${provider?.model ?? ''}`} />
      )}

      <ErrorBanner message={error} />
      {note ? <InfoBanner message={note} /> : null}

      {preview ? (
        <Card>
          <Image
            source={{ uri: preview }}
            style={{ width: '100%', height: 320, borderRadius: R.md, backgroundColor: C.bgSoft }}
            resizeMode="contain"
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <View style={{ flex: 1 }}>
              <Btn title="Run compliance scan" onPress={() => runScan(preview)} disabled={scanning} />
            </View>
            <Btn title="Discard" variant="outline" onPress={() => setPreview(null)} disabled={scanning} />
          </View>
          <T size={F.xs} color={C.textFaint} style={{ marginTop: 10 }}>
            Extraction typically takes 20–60 seconds with the vision model.
          </T>
        </Card>
      ) : (
        <>
          <Pressable onPress={openCamera}>
            <Card style={{ alignItems: 'center', padding: 28 }}>
              <T size={40}>📷</T>
              <T size={F.lg} weight="600" style={{ marginTop: 8 }}>
                Take a label photo
              </T>
              <T size={F.sm} color={C.textDim} align="center" style={{ marginTop: 4 }}>
                Fill the frame with the label; keep text sharp and well-lit
              </T>
            </Card>
          </Pressable>
          <Pressable onPress={pickFromLibrary} style={{ marginTop: 10 }}>
            <Card style={{ alignItems: 'center', padding: 20 }}>
              <T size={26}>🖼️</T>
              <T size={F.md} weight="600" style={{ marginTop: 6 }}>
                Choose from gallery
              </T>
            </Card>
          </Pressable>
          <View style={{ marginTop: 16, alignItems: 'center' }}>
            <Badge text="No connection? Use the Audit tab — fully offline" tone="slate" small />
          </View>
        </>
      )}

      <BusyOverlay visible={scanning} label={busyLabel} />
    </Screen>
  );
}
