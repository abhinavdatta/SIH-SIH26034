/* ---------------------------------------------------------------------------
   Upload/Scan View — Product selection + compliance check
   Demo mode uses predefined products, Upload mode uses real Tesseract.js OCR
   --------------------------------------------------------------------------- */

'use client';

import { useState } from 'react';
import { Check, Loader2, Eye, RotateCcw, Package, AlertCircle, Upload, Sparkles, Info } from 'lucide-react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableRow, TableHead, TableCell, TableBody,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useAppStore } from '@/lib/store';
import { notifyDataChange } from '@/lib/hooks';
import { STATUS_COLORS, FIELD_STATUS_COLORS, FIELD_KEY_TO_LABEL } from '@/lib/types';
import { PRODUCT_SCENARIOS } from '@/lib/compliance-rules';
import { runProductScan, createScanFromOCR, saveScan } from '@/lib/local-data';
import { performOCR, performCloudOCR, performHybridOCR, type OCRProgress, type OCRRegionMode } from '@/lib/ocr';
import { ConfidenceBadge } from '@/components/confidence-badge';
import type { LocalScan } from '@/lib/types';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

/* Progress step labels - more granular for region-aware OCR */
const STEPS = ['Format Check', 'Preprocessing', 'Region Detect', 'OCR Extraction', 'Compliance Check', 'Complete'];
/* AI mode never runs region detection - dedicated step labels so the UI
   doesn't claim "Region Detect"/"Preprocessing" while waiting on the model.
   (AI failures used to surface as a confusing "error at region detection".) */
const AI_STEPS = ['Format Check', 'Uploading', 'AI Analyzing', 'Parsing Fields', 'Compliance Check', 'Complete'];

/* Scan Mode Types */
type ScanMode = 'demo' | 'upload';

/* OCR Mode Types */
type OcrMode = 'local' | 'ai' | 'hybrid';

/* Shape of a stored AI provider record in localStorage (lmcc-ai-providers) */
interface AiProviderRecord {
  id: string;
  isEnabled: boolean;
  isConfigured: boolean;
  apiUrl: string;
  model: string;
  apiKey: string;
  category?: string;
}

/* -- Main Component -- */

export default function UploadScanView() {
  const { setCurrentView, setSelectedScanId, triggerRefresh } = useAppStore();

  const [scanMode, setScanMode] = useState<ScanMode>('demo');
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<LocalScan | null>(null);
  const [ocrMode, setOcrMode] = useState<OcrMode>('hybrid');
  const [ocrRegion, setOcrRegion] = useState<OCRRegionMode>('full');
  const [aiProviderConfigured, setAiProviderConfigured] = useState(() => {
    // Check if any AI provider is configured and enabled
    try {        const providers: AiProviderRecord[] = JSON.parse(
          localStorage.getItem('lmcc-ai-providers') || '[]'
        );
        return providers.some(
          (p) => p.isEnabled && p.isConfigured && p.apiUrl && p.model && p.apiKey
        );
    } catch {
      return false;
    }
  });

  /* Start the compliance scan on the selected product or uploaded file */
  async function startScan() {
    if (scanMode === 'demo' && selectedProduct === null) {
      toast.error('Please select a product to scan');
      return;
    }
    if (scanMode === 'upload' && !uploadedFile) {
      toast.error('Please upload a product label image');
      return;
    }

    setScanning(true);
    setStep(0);
    setProgress(0);

    try {
      let scan: LocalScan;

      if (scanMode === 'demo') {
        /* Demo Mode: Use predefined product scenarios */
        // Animate through progress steps
        for (let i = 0; i < STEPS.length - 1; i++) {
          await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
          setStep(i + 1);
          setProgress(((i + 1) / STEPS.length) * 100);
        }

        scan = runProductScan(selectedProduct!);
      } else {
        /* Upload Mode: OCR based on selected mode */
        // Re-check provider config at scan time — the user may have just
        // configured it in Settings without leaving this view.
        let ocrResult;
        let usedCloudOCR = false;

        // Get the active AI provider if needed
        const providers: AiProviderRecord[] = JSON.parse(
          localStorage.getItem('lmcc-ai-providers') || '[]'
        );
        const activeProvider = providers.find(
          (p) => p.isEnabled && p.isConfigured && p.apiUrl && p.model && p.apiKey
        );
        const providerNowConfigured = Boolean(activeProvider);
        if (providerNowConfigured !== aiProviderConfigured) {
          setAiProviderConfigured(providerNowConfigured);
        }

        try {
          if (ocrMode === 'local') {
            /* Local Only: Use only Tesseract.js */
            console.log('[Scan] Using Local OCR mode');

            // Step 1: Format Check & Loading
            setStep(1);
            setProgress(10);
            await new Promise(r => setTimeout(r, 200));

            // Step 2: Preprocessing
            setStep(2);
            setProgress(20);

            // Step 3: OCR Extraction
            const ocrProgressRef = { current: 0 };
            ocrResult = await performOCR(uploadedFile!, (progress: OCRProgress) => {
              if (progress.stage === 'normalizing' || progress.stage === 'loading') {
                setStep(2);
                setProgress(20 + progress.progress * 10);
              } else if (progress.stage === 'detecting_regions') {
                setStep(3);
                setProgress(30 + progress.progress * 20);
              } else if (progress.stage === 'ocr') {
                setStep(3);
                setProgress(50 + progress.progress * 20);
              } else if (progress.stage === 'processing_table') {
                setStep(3);
                setProgress(70);
              }

              if (progress.message && ocrProgressRef.current !== progress.progress) {
                console.log(`Local OCR: ${progress.message}`);
                ocrProgressRef.current = progress.progress;
              }
            }, { regionMode: ocrRegion });

            setStep(3);
            setProgress(85);

          } else if (ocrMode === 'ai') {
            /* AI Only: Use only Cloud OCR (no region detection involved) */
            if (!activeProvider) {
              throw new Error('AI provider not configured. Please configure an AI provider in Settings first.');
            }

            console.log('[Scan] Using AI OCR mode');

            const ocrProgressRef = { current: 0 };
            ocrResult = await performCloudOCR(uploadedFile!, {
              apiUrl: activeProvider.apiUrl,
              model: activeProvider.model,
              apiKey: activeProvider.apiKey,
              category: activeProvider.category,
            }, (progress: OCRProgress) => {
              if (progress.message && ocrProgressRef.current !== progress.progress) {
                console.log(`AI OCR: ${progress.message}`);
                ocrProgressRef.current = progress.progress;
              }
              // Map cloud OCR progress to the dedicated AI step system
              // (Uploading → AI Analyzing → Parsing Fields — never "Region Detect")
              if (progress.stage === 'cloud_ocr') {
                setProgress(10 + progress.progress * 80);
                if (progress.progress < 0.3) setStep(1);       // Uploading
                else if (progress.progress < 0.85) setStep(2); // AI Analyzing
                else setStep(3);                               // Parsing Fields
              }
            });

            usedCloudOCR = true;
            setStep(4);
            setProgress(95);

          } else {
            /* Hybrid: Local spatial extraction first, cloud AI fallback for low-confidence fields */
            if (!activeProvider) {
              throw new Error('AI provider not configured for hybrid mode. Please configure an AI provider in Settings first.');
            }

            console.log('[Scan] Using Hybrid OCR mode');

            const ocrProgressRef = { current: 0 };
            ocrResult = await performHybridOCR(uploadedFile!, {
              apiUrl: activeProvider.apiUrl,
              model: activeProvider.model,
              apiKey: activeProvider.apiKey,
              category: activeProvider.category,
            }, (progress: OCRProgress) => {
              if (progress.message && ocrProgressRef.current !== progress.progress) {
                console.log(`Hybrid OCR: ${progress.message}`);
                ocrProgressRef.current = progress.progress;
              }
              // Map hybrid progress to our step system
              if (progress.stage === 'local_ocr') {
                setStep(2);
                setProgress(10 + progress.progress * 40);
              } else if (progress.stage === 'cloud_fallback') {
                setStep(3);
                setProgress(50 + progress.progress * 40);
              } else if (progress.stage === 'merging') {
                setStep(3);
                setProgress(90);
              } else if (progress.stage === 'complete') {
                setStep(4);
                setProgress(95);
              }
            }, { regionMode: ocrRegion });

            usedCloudOCR = ocrResult.extractionMethod === 'hybrid' || ocrResult.extractionMethod === 'cloud_ai';
            console.log(`[Hybrid OCR] Extraction method: ${ocrResult.extractionMethod}`);

            setStep(4);
            setProgress(95);
          }
        } catch (error) {
          console.warn('OCR failed:', error);

          // Determine error type for better messaging
          let errorMessage = 'Scan failed. Please try again.';
          let errorTitle = 'OCR Error';

          if (error instanceof Error) {
            const errorMsg = error.message.toLowerCase();

            if (errorMsg.includes('401') || errorMsg.includes('unauthorized') || errorMsg.includes('invalid api key')) {
              errorTitle = 'Invalid API Key';
              errorMessage = 'Your API key is invalid or has expired. Please check your AI provider configuration.';
            } else if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
              errorTitle = 'Rate Limit Exceeded';
              errorMessage = 'The AI provider rate limit has been reached. Please try again later.';
            } else if (errorMsg.includes('402') || errorMsg.includes('insufficient') || errorMsg.includes('credits')) {
              errorTitle = 'Insufficient Credits';
              errorMessage = 'Your AI provider account has insufficient credits. Please add credits or use local OCR mode.';
            } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
              errorTitle = 'Network Error';
              errorMessage = 'Could not connect to the AI service. Please check your internet connection or use local OCR mode.';
            } else if (errorMsg.includes('timeout')) {
              errorTitle = 'Request Timeout';
              errorMessage = 'The AI service took too long to respond. Vision models can take up to 2 minutes — if this keeps happening, try a smaller/faster model or use local OCR mode.';
            } else if (errorMsg.includes('parse') || errorMsg.includes('invalid ocr result') || errorMsg.includes('unexpected format')) {
              errorTitle = 'AI Response Error';
              errorMessage = 'The AI model returned an unexpected response. Try a different vision-capable model (e.g. Llama 3.2 Vision) or use Local/Hybrid mode.';
            } else if (errorMsg.includes('not configured')) {
              errorTitle = 'AI Provider Not Configured';
              errorMessage = 'Please configure an AI provider in Settings first, or use local OCR mode.';
            } else if (error.message) {
              errorMessage = error.message;
            }
          }

          toast.error(errorTitle, {
            description: errorMessage,
            duration: 6000,
          });

          throw error;
        }

        // Step 4: Compliance Check
        await new Promise(r => setTimeout(r, 200));
        setStep(4);
        setProgress(90);

        // Log which path was used
        console.log(`[Scan] Used ${usedCloudOCR ? 'Cloud AI' : 'Local Tesseract'} OCR`);

        // Create scan from OCR results
        scan = createScanFromOCR({
          productName: ocrResult.productName || 'Unknown Product',
          manufacturerName: ocrResult.manufacturerName || 'Unknown Manufacturer',
          fields: ocrResult.fields.map(field => ({
            fieldName: field.fieldName,
            value: field.value,
            confidence: field.confidence,
            status: field.confidence >= 0.85 ? 'approved' : 'needs_review',
            sourceText: field.sourceText,
          })),
          overallConfidence: ocrResult.overallConfidence,
          complianceStatus: ocrResult.fields.some(f => f.confidence < 0.7) ? 'needs_review' : 'compliant',
        }, uploadedFile);

        // Save the scan to localStorage
        saveScan(scan);
      }

      setStep(STEPS.length - 1);
      setProgress(100);
      setResult(scan);
      triggerRefresh();
      notifyDataChange();
      toast.success('Compliance check completed successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }

  function viewReport() {
    if (result?.id) {
      setSelectedScanId(result.id);
      setCurrentView('compliance-report');
    }
  }

  function scanAnother() {
    setSelectedProduct(null);
    setUploadedFile(null);
    setResult(null);
    setStep(0);
    setProgress(0);
  }

  /* Quick violation count for the preview badge */
  function getPreviewViolations(idx: number) {
    return PRODUCT_SCENARIOS[idx].fields.filter(f => {
      if (!f.value) return true;
      if (f.fieldName === 'mrp_inclusive_statement') return !f.value;
      if (f.fieldName === 'manufacture_date') return !f.value;
      if (f.fieldName === 'consumer_care' && f.confidence < 0.5) return true;
      return false;
    }).length;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="card-static p-5 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center shrink-0"
          style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
        >
          <Package className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Scan a Product Label
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Choose a scan mode to run a compliance check against LM Rules, 2011
          </p>
        </div>
      </div>

      {/* Scan Mode Selector */}
      {!result && !scanning && (
        <div className="card-static p-4">
          <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Select Scan Mode:</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setScanMode('demo'); setSelectedProduct(null); setUploadedFile(null); }}
              className={`p-4 rounded-[var(--radius-md)] border-2 text-left transition-all ${
                scanMode === 'demo'
                  ? 'border-[var(--primary)] bg-[var(--primary-light)]'
                  : 'border-[var(--border-default)] hover:border-[var(--border-hover)]'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className={`h-5 w-5 ${scanMode === 'demo' ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Demo Mode
                </span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Use predefined product scenarios to test compliance checking
              </p>
            </button>

            <button
              onClick={() => { setScanMode('upload'); setSelectedProduct(null); setUploadedFile(null); }}
              className={`p-4 rounded-[var(--radius-md)] border-2 text-left transition-all ${
                scanMode === 'upload'
                  ? 'border-[var(--primary)] bg-[var(--primary-light)]'
                  : 'border-[var(--border-default)] hover:border-[var(--border-hover)]'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Upload className={`h-5 w-5 ${scanMode === 'upload' ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Upload Mode
                </span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Upload a product label image for compliance verification
              </p>
            </button>
          </div>
        </div>
      )}

      {/* Product Selection Grid (Demo Mode) */}
      {!result && !scanning && scanMode === 'demo' && (
        <>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Select a product to scan:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PRODUCT_SCENARIOS.map((product, idx) => {
              const isSelected = selectedProduct === idx;
              const violations = getPreviewViolations(idx);
              return (
                <div
                  key={idx}
                  className={`card product-card p-4 ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedProduct(idx)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedProduct(idx); } }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {product.productName}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {product.manufacturerName}
                      </p>
                      <div className="flex items-center gap-2 mt-2.5">
                        <Badge variant="outline" className="text-[10px]" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-default)' }}>
                          {product.category}
                        </Badge>
                        {violations > 0 && (
                          <Badge variant="outline" className="text-[10px] text-red-600 border-red-200 dark:border-red-800">
                            <AlertCircle className="h-2.5 w-2.5 mr-1" />{violations} issues
                          </Badge>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--primary)' }}>
                        <Check className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scan Button */}
          <div className="card-static p-4">
            <button
              onClick={startScan}
              disabled={selectedProduct === null}
              className="btn-primary w-full py-3"
            >
              <Eye className="h-4 w-4" /> Run Compliance Check
            </button>
          </div>
        </>
      )}

      {/* File Upload Section (Upload Mode) */}
      {!result && !scanning && scanMode === 'upload' && (
        <div className="space-y-4">
          {/* OCR Mode Selector */}
          <div className="card-static p-4">
            <p className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Sparkles className="h-4 w-4" style={{ color: 'var(--primary)' }} />
              Select OCR Mode:
            </p>
            <RadioGroup value={ocrMode} onValueChange={(value) => {
              if (value === 'local') {
                setOcrMode('local');
              } else if (value === 'ai') {
                if (!aiProviderConfigured) {
                  toast.error('AI provider not configured', {
                    description: 'Please configure an AI provider in Settings first.'
                  });
                  return;
                }
                setOcrMode('ai');
              } else if (value === 'hybrid') {
                if (!aiProviderConfigured) {
                  toast.error('AI provider not configured', {
                    description: 'Please configure an AI provider in Settings first.'
                  });
                  return;
                }
                setOcrMode('hybrid');
              }
            }}>
              <div className="flex items-start space-x-3 space-y-0 p-3 rounded-lg border" style={{ borderColor: 'var(--border-default)' }}>
                <RadioGroupItem value="local" id="local" />
                <div className="flex-1">
                  <Label htmlFor="local" className="font-medium cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                    Local Only
                  </Label>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Uses only Tesseract.js running in your browser. No data is sent to external services. Fast and free.
                  </p>
                </div>
              </div>

              <div className={`flex items-start space-x-3 space-y-0 p-3 rounded-lg border transition-all ${!aiProviderConfigured ? 'opacity-50' : ''}`} style={{ borderColor: 'var(--border-default)' }}>
                <RadioGroupItem value="ai" id="ai" disabled={!aiProviderConfigured} />
                <div className="flex-1">
                  <Label htmlFor="ai" className={`font-medium ${!aiProviderConfigured ? 'cursor-not-allowed' : 'cursor-pointer'}`} style={{ color: 'var(--text-primary)' }}>
                    AI Mode
                  </Label>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Uses only AI-powered cloud OCR for best accuracy. Requires internet and configured AI provider.
                  </p>
                </div>
              </div>

              <div className={`flex items-start space-x-3 space-y-0 p-3 rounded-lg border transition-all ${!aiProviderConfigured ? 'opacity-50' : ''}`} style={{ borderColor: 'var(--border-default)' }}>
                <RadioGroupItem value="hybrid" id="hybrid" disabled={!aiProviderConfigured} />
                <div className="flex-1">
                  <Label htmlFor="hybrid" className={`font-medium ${!aiProviderConfigured ? 'cursor-not-allowed' : 'cursor-pointer'}`} style={{ color: 'var(--text-primary)' }}>
                    Hybrid Mode (Recommended)
                  </Label>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Combines local and AI OCR for optimal performance. Uses local first, AI fallback for low-confidence fields.
                  </p>
                </div>
              </div>
            </RadioGroup>

            {(ocrMode === 'local' || ocrMode === 'hybrid') && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-default)' }}>
                <Label htmlFor="ocr-region" className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  OCR Region
                </Label>
                <select
                  id="ocr-region"
                  value={ocrRegion}
                  onChange={(event) => setOcrRegion(event.target.value as OCRRegionMode)}
                  className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
                  style={{
                    borderColor: 'var(--border-default)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="full">Entire label</option>
                  <option value="auto">Detect automatically</option>
                  <option value="top">Top third</option>
                  <option value="middle">Middle third</option>
                  <option value="bottom">Bottom third</option>
                </select>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  Choose a section when automatic region detection misses text or finds noisy areas.
                </p>
              </div>
            )}

            {!aiProviderConfigured && (
              <div className="mt-3 flex items-start gap-2 p-2 rounded-md" style={{ background: 'var(--bg-secondary)' }}>
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  To use AI or Hybrid mode, please configure an AI provider in Settings first.
                </p>
              </div>
            )}

            {(ocrMode === 'ai' || ocrMode === 'hybrid') && aiProviderConfigured && (
              <div className="mt-3 flex items-start gap-2 p-2 rounded-md" style={{ background: 'var(--bg-secondary)' }}>
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Images will be sent to an external AI service. Requires internet. May be logged to improve models.
                </p>
              </div>
            )}
          </div>

          {/* Example Images */}
          <div className="card-static p-5">
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              Example Product Labels to Upload:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Complete Product Label
                </p>
                <div className="rounded-[var(--radius-md)] overflow-hidden border" style={{ borderColor: 'var(--border-default)' }}>
                  <img
                    src="/example-product-label.png"
                    alt="Example product label with manufacturer details, MRP, and compliance information"
                    className="w-full h-auto"
                  />
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Shows: Manufacturer info, MRP, Net quantity, Mfg date, Consumer care, FSSAI license
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Nutrition Facts Panel
                </p>
                <div className="rounded-[var(--radius-md)] overflow-hidden border" style={{ borderColor: 'var(--border-default)' }}>
                  <img
                    src="/example-nutrition-label.png"
                    alt="Example nutrition facts table"
                    className="w-full h-auto"
                  />
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Shows: Serving size, Calories, Nutrients, Vitamins, Daily values
                </p>
              </div>
            </div>
          </div>

          <div className="card-static p-6">
            <div className="border-2 border-dashed rounded-[var(--radius-md)] p-8 text-center transition-colors hover:border-[var(--primary)] cursor-pointer"
                 onClick={() => document.getElementById('file-upload')?.click()}>
              <input
                id="file-upload"
                type="file"
                accept="image/*,.heic,.heif,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    // Validate file type
                    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/heic', 'image/heif', 'application/pdf'];
                    const fileName = file.name.toLowerCase();
                    const isValidExtension = fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') ||
                                           fileName.endsWith('.png') || fileName.endsWith('.webp') ||
                                           fileName.endsWith('.gif') || fileName.endsWith('.bmp') ||
                                           fileName.endsWith('.heic') || fileName.endsWith('.heif') ||
                                           fileName.endsWith('.pdf');

                    if (!validTypes.includes(file.type) && !isValidExtension) {
                      toast.error('Unsupported file format. Please upload an image (JPG, PNG, WEBP, GIF, BMP, HEIC) or PDF file.');
                      return;
                    }

                    // Validate file size (max 10MB)
                    if (file.size > 10 * 1024 * 1024) {
                      toast.error('File size exceeds 10MB limit. Please upload a smaller file.');
                      return;
                    }

                    setUploadedFile(file);
                  }
                }}
              />
              <Upload className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                {uploadedFile ? uploadedFile.name : 'Click to upload or drag and drop'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                JPG, PNG, WEBP, GIF, BMP, HEIC, PDF up to 10MB
              </p>
            </div>

            {uploadedFile && (
              <div className="mt-4 p-3 rounded-[var(--radius-md)]" style={{ background: 'var(--bg-secondary)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4" style={{ color: 'var(--primary)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {uploadedFile.name}
                    </span>
                  </div>
                  <button
                    onClick={() => setUploadedFile(null)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: 'var(--text-muted)', background: 'var(--bg-input)' }}
                  >
                    Remove
                  </button>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {(uploadedFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
            )}
          </div>

          {/* Scan Button */}
          <div className="card-static p-4">
            <button
              onClick={startScan}
              disabled={!uploadedFile}
              className="btn-primary w-full py-3"
            >
              <Eye className="h-4 w-4" /> Run Compliance Check
            </button>
          </div>
        </div>
      )}

      {/* Progress Steps */}
      {scanning && (
        <div className="card-static p-6">
          <div className="flex items-center gap-2 mb-5">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--primary)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Processing…</span>
          </div>
          <Progress value={progress} className="h-1.5 mb-6" />
          <div className="flex justify-between">
            {(ocrMode === 'ai' ? AI_STEPS : STEPS).map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <div key={s} className="flex flex-col items-center gap-1.5 flex-1">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all"
                    style={{
                      background: done ? 'var(--success)' : active ? 'var(--primary)' : 'var(--bg-input)',
                      color: done || active ? 'white' : 'var(--text-muted)',
                    }}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span
                    className="text-[10px] leading-tight text-center"
                    style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}
                  >
                    {s}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scan Results */}
      <AnimatePresence>
        {result && !scanning && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Summary */}
            <div className="card-static p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{result.productName}</h3>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{result.manufacturerName}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={`text-xs font-medium ${STATUS_COLORS[result.status] ?? ''}`}>
                    {result.status.replace(/_/g, ' ')}
                  </Badge>
                  <ConfidenceBadge score={result.ocrConfidence} showScore size="md" />
                </div>
              </div>
            </div>

            {/* Fields Table */}
            <div className="card-static p-5">
              <h4 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Extracted Fields</h4>
              <div className="overflow-x-auto -mx-5 px-5">
                <Table className="clean-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead className="hidden sm:table-cell">Confidence</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.fields.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {FIELD_KEY_TO_LABEL[f.fieldName] ?? f.fieldName}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate" style={{ color: 'var(--text-secondary)' }}>
                          {f.value || <span style={{ color: 'var(--text-muted)' }} className="italic">Missing</span>}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <ConfidenceBadge score={f.confidence} showScore />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[11px] font-medium ${FIELD_STATUS_COLORS[f.complianceStatus] ?? ''}`}>
                            {f.complianceStatus.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button onClick={viewReport} className="btn-ghost flex-1 py-3" style={{ color: 'var(--primary)' }}>
                <Eye className="h-4 w-4" /> View Full Report
              </button>
              <button onClick={scanAnother} className="btn-primary flex-1 py-3">
                <RotateCcw className="h-4 w-4" /> Scan Another
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
