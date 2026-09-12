# LMCC Developer Guide

This guide provides detailed information for developers who want to understand, extend, or modify the LMCC application.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Core Concepts](#core-concepts)
3. [Data Models](#data-models)
4. [OCR Pipeline](#ocr-pipeline)
5. [Compliance Rules Engine](#compliance-rules-engine)
6. [State Management](#state-management)
7. [Adding New Features](#adding-new-features)
8. [Testing](#testing)
9. [Performance Optimization](#performance-optimization)
10. [Troubleshooting](#troubleshooting)
11. [Changes Made](#changes-made)
12. [Additional Resources](#additional-resources)

---

## Getting Started

### Prerequisites Setup

```bash
# Install Bun (recommended)
curl -fsSL https://bun.sh/install | bash

# Clone and install
git clone <repo-url>
cd lmcc-legal-metrology-compliance-checker
bun install
```

### Development Workflow

```bash
# Start dev server
bun run dev

# In another terminal, watch for lint issues
bun run lint --watch

# Make changes and save - Turbopack will hot-reload
```

---

## Core Concepts

### Single-Route SPA Architecture

This is a **single-page application** that uses Next.js App Router but only has one client-accessible route: `/`.

**Why?**
- Simplifies deployment (no route conflicts)
- All navigation is client-side via Zustand
- Faster page transitions
- Easier state management

**View Routing**:

```typescript
// src/app/page.tsx
const VIEW_MAP: Record<string, React.ReactNode> = {
  dashboard: <DashboardView />,
  'upload-scan': <UploadScanView />,
  'review-queue': <ReviewQueueView />,
  'compliance-report': <ComplianceReportView />,
  'product-history': <ProductHistoryView />,
  'legal-reference': <LegalReferenceView />,
  'ai-providers': <AIProvidersView />,
  settings: <SettingsView />,
};

// Navigation happens via Zustand store
const { currentView, setCurrentView } = useAppStore();
setCurrentView('upload-scan');
```

### Client-Side Data Layer

All data is stored in `localStorage` - **no database, no server state**.

**Storage Structure**:

```typescript
// lmcc-scans
{
  "scans": [
    {
      "id": "abc123",
      "productName": "Noodles",
      "manufacturerName": "Company Ltd",
      "status": "compliant",
      "ocrConfidence": 0.85,
      "fields": [ ... ],
      "violations": [ ... ],
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}

// lmcc-ai-providers
{
  "providers": [
    {
      "id": "thinking-machines-inkling",
      "apiKey": "sk-or-...",
      "isEnabled": true,
      "isConfigured": true
    }
  ]
}

// lmcc-cloud-ocr-enabled
"true"
```

**Data Layer** (`lib/local-data.ts`):

```typescript
// All data operations go through this module
export function getAllScans(): LocalScan[] { ... }
export function createScanFromOCR(...): LocalScan { ... }
export function updateFieldReview(...): void { ... }
export function deleteScan(id: string): void { ... }
export function getDashboardStats(): DashboardStats { ... }
export function getReviewQueue(): ReviewQueueItem[] { ... }
```

**Reactive Data with `useSyncExternalStore`**:

```typescript
// lib/hooks.ts
export function useScans() {
  return useSyncExternalStore(
    (callback) => subscribeToDataChanges(callback),
    () => getAllScans()
  );
}

// Components use this hook
const scans = useScans();
```

### Offline-First Design

The application is designed to work **completely offline** for core functionality:

- Tesseract.js runs entirely in the browser
- All data is in localStorage
- No external API calls (except optional cloud OCR)

**What works offline:**
- ✅ Local OCR (Tesseract.js)
- ✅ Compliance checking
- ✅ Review queue
- ✅ Export to PDF/CSV
- ✅ All UI features

**What requires internet:**
- ⚠️ HEIC/PDF conversion (client-side WASM)
- ⚠️ Cloud OCR (optional opt-in)
- ⚠️ Initial page load (fetching from server)

---

## Data Models

### Core Types

```typescript
// lib/types.ts

export type ViewName =
  | 'dashboard'
  | 'upload-scan'
  | 'review-queue'
  | 'compliance-report'
  | 'product-history'
  | 'legal-reference'
  | 'ai-providers'
  | 'settings';

export type ScanStatus =
  | 'extracted'
  | 'needs_review'
  | 'compliant'
  | 'non_compliant'
  | 'completed';

export type FieldComplianceStatus =
  | 'compliant'
  | 'non_compliant'
  | 'missing'
  | 'needs_review';

export type ViolationSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface LocalField {
  id: string;
  fieldName: string;              // e.g., 'net_quantity'
  value: string | null;
  confidence: number;              // 0.0 - 1.0
  complianceStatus: FieldComplianceStatus;
  ruleReference: string | null;
  notes: string | null;
  violationType?: string;
  violationDescription?: string;
  severity?: ViolationSeverity;
  reviewStatus: 'pending' | 'approved' | 'overridden';
}

export interface LocalViolation {
  id: string;
  scanFieldId: string;             // Links to LocalField.id
  violationType: string;
  description: string;
  severity: ViolationSeverity;
  isOverridden: boolean;
}

export interface LocalScan {
  id: string;
  productName: string;
  manufacturerName: string;
  status: ScanStatus;
  ocrConfidence: number;           // Overall OCR confidence
  fields: LocalField[];
  violations: LocalViolation[];
  createdAt: string;               // ISO 8601 timestamp
}
```

### OCR Result Types

```typescript
// lib/ocr.ts

export interface ExtractedField {
  fieldName: string;
  value: string | null;
  confidence: number;
  sourceText: string;              // Original text from image
}

export interface OCRResult {
  productName: string | null;
  manufacturerName: string | null;
  fields: ExtractedField[];
  rawText: string;                 // All extracted text
  overallConfidence: number;
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
  stage: string;                   // 'normalizing', 'detecting_regions', 'ocr', etc.
  progress: number;                // 0.0 - 1.0
  message: string;
}
```

### AI Provider Types

```typescript
// components/app/AIProvidersView.tsx

export interface AIProvider {
  id: string;
  name: string;
  description: string;
  apiUrl: string;
  model: string;
  apiKey: string;
  isEnabled: boolean;
  isConfigured: boolean;
  requiresApiKey: boolean;
  tier: 'free' | 'paid';
  features: string[];
}
```

---

## OCR Pipeline

### Overview

```
Input File (Image/HEIC/PDF)
        ↓
┌─────────────────────────────┐
│  Format Normalization       │
│  - HEIC → JPEG (heic2any)   │
│  - PDF → Image (pdfjs-dist) │
└─────────────────────────────┘
        ↓
┌─────────────────────────────┐
│  Image Preprocessing        │
│  - Resize (max 2000px)      │
│  - Convert to grayscale     │
└─────────────────────────────┘
        ↓
┌─────────────────────────────┐
│  Region Detection           │
│  - Sobel edge detection     │
│  - Contour finding          │
│  - QR/barcode exclusion     │
└─────────────────────────────┘
        ↓
┌─────────────────────────────┐
│  Per-Region OCR             │
│  - Paragraph: PSM 3         │
│  - Table: Row-by-row, PSM 6 │
│  - Small text: 2x upscale   │
└─────────────────────────────┘
        ↓
┌─────────────────────────────┐
│  Field Extraction           │
│  - Regex pattern matching   │
│  - Confidence scoring       │
└─────────────────────────────┘
        ↓
OCRResult
```

### Format Normalization

**HEIC/HEIF Conversion**:

```typescript
async function convertHeicToImage(file: File): Promise<File> {
  const heic2any = (await import('heic2any')).default;

  const blob = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.95,
  }) as Blob;

  return new File([blob], file.name.replace(/\.heic?$/i, '.jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
```

**PDF Conversion**:

```typescript
async function convertPdfToImage(file: File): Promise<File> {
  const pdfjsLib = await import('pdfjs-dist');

  // Set worker source
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdf.getPage(1); // First page only

  const scale = 2.0;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.95);
  });

  return new File([blob], file.name.replace(/\.pdf$/i, '_page1.jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
```

### Region Detection

**Sobel Edge Detection**:

```typescript
function sobelEdgeDetection(imageData: ImageData): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const src = imageData.data;

  // Convert to grayscale
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
```

**Contour Detection (Flood Fill)**:

```typescript
function findContours(edgeData: ImageData, minArea: number = 1000): Region[] {
  const width = edgeData.width;
  const height = edgeData.height;
  const data = edgeData.data;
  const visited = new Set<number>();
  const regions: Region[] = [];

  const floodFill = (startX: number, startY: number) => {
    const stack = [[startX, startY]];
    let minX = startX, maxX = startX, minY = startY, maxY = startY;
    let pixelCount = 0;

    while (stack.length > 0 && pixelCount < 50000) {
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
          const nx = x + dx, ny = y + dy;
          if (!visitedPixel(nx, ny) && isEdge(nx, ny)) {
            stack.push([nx, ny]);
          }
        }
      }
    }

    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, pixelCount };
  };

  // Scan for edge pixels and start flood fill
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (isEdge(x, y) && !visitedPixel(x, y)) {
        const region = floodFill(x, y);
        if (region.pixelCount >= minArea) {
          regions.push({ ...region });
        }
      }
    }
  }

  return regions;
}
```

### Per-Region OCR

**Table Processing (Row-by-Row)**:

```typescript
async function processTableRegion(canvas: HTMLCanvasElement, region: Region): Promise<{text: string, confidence: number}> {
  const tableCanvas = document.createElement('canvas');
  const tableCtx = tableCanvas.getContext('2d')!;
  tableCanvas.width = region.width;
  tableCanvas.height = region.height;
  tableCtx.drawImage(canvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);

  // Detect horizontal lines
  const rowLines: number[] = [0, region.height];

  for (let y = 20; y < region.height - 20; y++) {
    let darkPixels = 0;
    for (let x = 0; x < region.width; x++) {
      if (isDarkPixel(x, y)) darkPixels++;
    }
    if (darkPixels > region.width * 0.7) {
      const isNewLine = !rowLines.some(line => Math.abs(line - y) < 5);
      if (isNewLine) rowLines.push(y);
    }
  }

  rowLines.sort((a, b) => a - b);

  // OCR each row
  const rowTexts: string[] = [];
  for (let i = 0; i < rowLines.length - 1; i++) {
    const rowY = rowLines[i];
    const rowHeight = Math.max(rowLines[i + 1] - rowY, 20);

    const rowCanvas = document.createElement('canvas');
    const rowCtx = rowCanvas.getContext('2d')!;
    rowCanvas.width = region.width;
    rowCanvas.height = rowHeight;
    rowCtx.drawImage(tableCanvas, 0, rowY, region.width, rowHeight, 0, 0, region.width, rowHeight);

    const result = await Tesseract.recognize(rowCanvas.toDataURL(), 'eng', {
      tessedit_pageseg_mode: 6, // Single uniform block
    });

    const text = result.data.text.trim();
    if (text.length > 0) rowTexts.push(text);
  }

  return {
    text: rowTexts.join('\n'),
    confidence: calculateAverageConfidence(rowTexts),
  };
}
```

### Field Extraction

**Pattern Matching**:

```typescript
const FIELD_PATTERNS = {
  net_quantity: [
    /(?:net\s+wt\.?|net\s+weight|net\s+quantity)[:\s]+(\d+(?:\.\d+)?\s*(?:g|kg|ml|l))/i,
    /(\d+(?:\.\d+)?\s*(?:g|kg|ml|l))/i,
  ],
  mrp: [
    /(?:mrp|maximum\s+retail\s+price)[:\s]*[₹Rs.]?\s*(\d+(?:\.\d{1,2})?)/i,
    /[₹Rs.]?\s*(\d+(?:\.\d{1,2})?)\s*(?:\/-|only)/i,
  ],
  // ... more patterns
};

function extractFieldsFromText(text: string, regionConfidence: number): ExtractedField[] {
  const fields: ExtractedField[] = [];

  for (const [fieldName, patterns] of Object.entries(FIELD_PATTERNS)) {
    let bestMatch = { value: null as string | null, confidence: 0, sourceText: '' };

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();
        const baseConfidence = value.length > 3 ? 0.85 : 0.6;
        const confidence = baseConfidence * regionConfidence;

        if (confidence > bestMatch.confidence) {
          bestMatch = { value, confidence, sourceText: match[0] };
        }
      }
    }

    fields.push({ fieldName, ...bestMatch });
  }

  return fields;
}
```

---

## Compliance Rules Engine

### Rule Structure

```typescript
interface RuleCheck {
  fieldName: string;
  label: string;
  ruleReference: string;  // e.g., 'Rule 6(1)(a)'
  check: (value: string | null) => 'compliant' | 'non_compliant' | 'missing' | 'needs_review';
  notes: (value: string | null) => string | null;
  severity: ViolationSeverity;
}
```

### Example Rule

```typescript
const RULES: RuleCheck[] = [
  {
    fieldName: 'net_quantity',
    label: 'Net Quantity',
    ruleReference: 'Rule 6(1)(a)',
    check: (value) => {
      if (!value) return 'missing';
      const hasQuantity = /\d+\s*(g|kg|mg|ml|l|litre)/i.test(value);
      return hasQuantity ? 'compliant' : 'needs_review';
    },
    notes: (value) => {
      if (!value) return 'Net quantity must be declared';
      if (!/\d+\s*(g|kg|mg|ml|l|litre)/i.test(value)) {
        return 'Net quantity must include numeric value and unit';
      }
      return null;
    },
    severity: 'HIGH',
  },
  // ... more rules
];
```

### Running Compliance Checks

```typescript
function runComplianceCheckBatch(fields: LocalField[]): LocalField[] {
  const updatedFields = fields.map(field => {
    const rule = RULES.find(r => r.fieldName === field.fieldName);
    if (!rule) return field;

    const status = rule.check(field.value);
    const notes = rule.notes(field.value);

    return {
      ...field,
      complianceStatus: status,
      ruleReference: rule.ruleReference,
      notes,
      severity: status === 'non_compliant' ? rule.severity : undefined,
    };
  });

  return updatedFields;
}
```

### Adding New Rules

1. Define the rule in `compliance-rules.ts`:

```typescript
{
  fieldName: 'new_field',
  label: 'New Field Label',
  ruleReference: 'Rule X(Y)(z)',
  check: (value) => {
    // Validation logic
    if (!value) return 'missing';
    if (/* condition */) return 'compliant';
    return 'non_compliant';
  },
  notes: (value) => {
    // Explanation logic
    if (!value) return 'This field is required';
    return null;
  },
  severity: 'MEDIUM',
}
```

2. Add field label to `types.ts`:

```typescript
export const FIELD_KEY_TO_LABEL: Record<string, string> = {
  // ... existing fields
  new_field: 'New Field Label',
};
```

3. Add extraction pattern to `ocr.ts`:

```typescript
const FIELD_PATTERNS = {
  // ... existing patterns
  new_field: [
    /pattern\s+(.+)/i,
  ],
};
```

---

## State Management

### Zustand Store

```typescript
// lib/store.ts

interface AppState {
  // Navigation state
  currentView: ViewName;
  sidebarOpen: boolean;
  selectedScanId: string | null;

  // Actions
  setCurrentView: (view: ViewName) => void;
  toggleSidebar: () => void;
  setSelectedScanId: (id: string | null) => void;
  triggerRefresh: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  sidebarOpen: false,
  selectedScanId: null,

  setCurrentView: (view) => set({ currentView: view }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSelectedScanId: (id) => set({ selectedScanId: id }),
  triggerRefresh: () => set({}), // Triggers re-renders in components using useScans()
}));
```

### Using the Store

```typescript
// In components
const { currentView, setCurrentView } = useAppStore();

// Subscribing to specific state
const currentView = useAppStore((state) => state.currentView);
```

### Custom Data Hooks

```typescript
// lib/hooks.ts

export function useScans() {
  return useSyncExternalStore(
    (callback) => subscribeToDataChanges(callback),
    () => getAllScans()
  );
}

export function useDashboardStats() {
  return useSyncExternalStore(
    (callback) => subscribeToDataChanges(callback),
    () => getDashboardStats()
  );
}

export function useReviewQueue() {
  return useSyncExternalStore(
    (callback) => subscribeToDataChanges(callback),
    () => getReviewQueue()
  );
}
```

---

## Adding New Features

### Adding a New View

1. Create the view component:

```typescript
// src/components/app/NewView.tsx
'use client';

import { Card } from '@/components/ui/card';

export default function NewView() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1>New View</h1>
      <Card>
        {/* Content */}
      </Card>
    </div>
  );
}
```

2. Add to `page.tsx`:

```typescript
import NewView from '@/components/app/NewView';

const VIEW_MAP: Record<string, React.ReactNode> = {
  // ... existing views
  'new-view': <NewView />,
};
```

3. Add navigation in `AppShell.tsx`:

```typescript
const NAV_ITEMS = [
  // ... existing items
  { view: 'new-view', label: 'New View', icon: <Icon /> },
];

const VIEW_TITLES = {
  // ... existing titles
  'new-view': 'New View',
};
```

4. Add to `types.ts`:

```typescript
export type ViewName =
  | // ... existing views
  | 'new-view';
```

### Adding a New AI Provider

1. Add to `DEFAULT_PROVIDERS` in `AIProvidersView.tsx`:

```typescript
{
  id: 'new-provider',
  name: 'New AI Provider',
  description: 'Description of the provider',
  apiUrl: 'https://api.example.com/v1/completions',
  model: 'model-name',
  isEnabled: false,
  requiresApiKey: true,
  tier: 'paid',
  features: ['Feature 1', 'Feature 2'],
}
```

2. Update API route if needed (`/api/vision-fallback/route.ts`):

```typescript
// Add any provider-specific request formatting
if (provider.id === 'new-provider') {
  // Custom formatting
}
```

---

## Testing

### Manual Testing Checklist

- [ ] Upload JPG image and verify OCR
- [ ] Upload PNG image and verify OCR
- [ ] Upload HEIC image and verify conversion + OCR
- [ ] Upload PDF and verify conversion + OCR
- [ ] Test cloud OCR with valid API key
- [ ] Test cloud OCR with invalid API key (should fall back)
- [ ] Verify compliance checking works
- [ ] Test review queue flow
- [ ] Export scan to PDF
- [ ] Export scan to CSV
- [ ] Test responsive design on mobile
- [ ] Test dark mode toggle
- [ ] Verify all views are accessible

### Linting

```bash
# Run linter
bun run lint

# Auto-fix issues
bun run lint --fix
```

### Type Checking

```bash
bun run tsc --noEmit
```

---

## Performance Optimization

### OCR Performance Tips

1. **Image Resizing**: Images are resized to max 2000px width
2. **Region Detection**: Reduces OCR area significantly
3. **Adaptive PSM**: Uses appropriate PSM per region type
4. **Progressive Loading**: Shows progress during long operations

### React Performance

1. **useMemo**: For expensive calculations
2. **useCallback**: For event handlers
3. **React.memo**: For components that re-render frequently
4. **Virtualization**: For long lists (not yet implemented)

### Storage Optimization

1. **Limit History**: Consider adding a max scan limit
2. **Compress Data**: Consider compressing large OCR results
3. **Clean Up Old Data**: Add data cleanup functionality

---

## Troubleshooting

### Common Issues

**Issue**: OCR is very slow
- **Solution**: Check image size (should be < 10MB)
- **Solution**: Try with simpler, clearer images
- **Solution**: Disable cloud mode to use only local OCR

**Issue**: Cloud OCR fails
- **Solution**: Check API key is valid
- **Solution**: Check internet connection
- **Solution**: Check OpenRouter status page
- **Solution**: Check browser console for errors

**Issue**: HEIC conversion fails
- **Solution**: Ensure browser supports WASM
- **Solution**: Try converting HEIC to JPG first
- **Solution**: Check browser console for errors

**Issue**: Data not persisting
- **Solution**: Check localStorage quota
- **Solution**: Check browser privacy settings
- **Solution**: Check browser console for errors

---

## Changes Made

### Recent Updates

#### AI Providers Enhancement (January 2025)

**NVIDIA NIM Models Integration**
- Added 4 NVIDIA vision models to `DEFAULT_PROVIDERS` in `AIProvidersView.tsx`:
  - Kimi K3 (`moonshotai/kimi-k3`) - Paid
  - Phi-3.5 Vision (`microsoft/phi-3.5-vision-instruct`) - Free
  - Llama 3.2 Vision (`meta/llama-3.2-11b-vision-instruct`) - Free
  - Qwen VL (`qwen/qwen-2-vl-7b-instruct`) - Free
- Updated `AIProvider` type to include `category: 'openrouter' | 'nvidia' | 'custom'`
- Added NVIDIA providers section in UI with proper categorization
- NVIDIA API endpoint: `https://integrate.api.nvidia.com/v1/chat/completions`

**API Key Validation System**
- Enhanced `validateApiKey()` function with category-aware validation:
  ```typescript
  async function validateApiKey(apiKey: string, apiUrl: string, model: string, category: string)
  ```
- Format validation based on provider category:
  - NVIDIA: `nvapi-` prefix required
  - OpenRouter/Custom: `sk-or-` or `sk-` prefix required
- Live API testing with minimal request before saving
- Comprehensive error messages for:
  - Invalid API key format (401)
  - Rate limit exceeded (429)
  - Insufficient credits (402)
  - Model not found (404)
  - Network errors
- "Validate Key" button in UI for pre-save testing
- Visual error display with red warning text
- Toast notifications for validation success/failure

**AI Prompt Security Guardrails**
- Enhanced `SYSTEM_PROMPT` in `/api/vision-fallback/route.ts` with guardrails section:
  - **Data Privacy**: No data retention, process only provided image
  - **Output Restriction**: Return ONLY valid JSON, no conversational text
  - **Content Boundaries**:
    - Extract ONLY information present in the image
    - No data fabrication or assumptions
    - No pricing, reviews, or recommendations
    - No personal opinions or subjective assessments
  - **Code Execution Prevention**: No code/script execution
  - **No External References**: No external sources or databases
  - **Malicious Content Handling**: Return empty fields for suspicious content
- Output guardrails:
  - Single valid JSON object only
  - No conversational filler text
  - No Markdown code blocks
  - No comments within JSON
  - Structured error responses on failure

**Backend API Architecture Updates**
- Updated `/api/vision-fallback/route.ts` with dual API support:
  - OpenRouter API: Uses `fetch` with standard headers
  - NVIDIA API: Uses `axios` with 30-second timeout
- Category-based request routing:
  ```typescript
  if (category === 'nvidia') {
    // Use axios for NVIDIA API
  } else {
    // Use fetch for OpenRouter API
  }
  ```
- Proper error handling for both APIs:
  - `axios.isAxiosError()` detection for NVIDIA
  - Standard error response parsing for OpenRouter
- Enhanced error messages specific to provider type

**OCR Service Updates**
- Updated `performCloudOCR()` in `lib/ocr.ts`:
  ```typescript
  provider: {
    apiUrl: string;
    model: string;
    apiKey: string;
    category?: string;  // ← Added
  }
  ```
- Passes `category` to API route for proper routing
- Defaults to `'openrouter'` if not specified

**Frontend Integration**
- Updated `UploadScanView.tsx` to pass provider category:
  ```typescript
  await performCloudOCR(uploadedFile!, {
    apiUrl: activeProvider.apiUrl,
    model: activeProvider.model,
    apiKey: activeProvider.apiKey,
    category: activeProvider.category,  // ← Added
  }, onProgressCallback);
  ```

**Dependencies**
- Added `axios@1.20.0` for NVIDIA API integration

**File Changes Summary**
| File | Changes |
|------|---------|
| `src/components/app/AIProvidersView.tsx` | Added NVIDIA providers, enhanced validation, category support |
| `src/app/api/vision-fallback/route.ts` | Dual API support, guardrails in prompts |
| `src/lib/ocr.ts` | Category parameter for provider routing |
| `src/components/app/UploadScanView.tsx` | Pass category when calling cloud OCR |
| `package.json` | Added `axios` dependency |
| `README.md` | Updated AI provider documentation, added Changes Made section |
| `DEVELOPER_GUIDE.md` | Added Changes Made section |

**Testing & Verification**
- Browser testing confirmed all functionality working:
  - Page loads without errors
  - All provider categories visible
  - NVIDIA models displayed correctly
  - API key configuration dialog functional
  - Validation buttons operational
  - Proper placeholders (`nvapi-...`, `sk-or-...`)
  - No broken UI elements
  - No console errors
- ESLint check passed without errors
- Dev server running smoothly

#### Bug Fixes & UI Improvements (January 2025)

**API Key Validation Timeout Fix**
- **Issue**: Validation requests timing out at 10 seconds
- **Files Modified**: `/src/app/api/validate-api-key/route.ts`
- **Changes**:
  - Increased timeout from 10 seconds → 30 seconds for both APIs
  - Added `AbortController` for fetch timeout handling (OpenRouter)
  - Added `AbortError` handling in catch block
  - Updated axios timeout configuration (NVIDIA)
  ```typescript
  // NVIDIA timeout
  timeout: 30000, // Increased from 10000

  // OpenRouter timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  ```
- **Error Messages**: Clear timeout error for users

**Dialog Transparency Fix**
- **Issue**: AI Provider configuration dialog had transparent/see-through background
- **Files Modified**: `/src/components/ui/dialog.tsx`
- **Changes**:
  - Added explicit inline style: `style={{ background: 'var(--bg-card)' }}`
  - Removed `bg-background` Tailwind class (not mapping correctly)
  - Fixed close button color: `style={{ color: 'var(--text-secondary)' }}`
- **Result**: Solid, opaque dialog backgrounds in both light and dark modes

**Duplicate Sidebar/Menu Bar Fix**
- **Issue**: Hamburger menu visible on desktop viewports (should be mobile-only)
- **Files Modified**: `/src/app/globals.css`, `/src/components/app/AppShell.tsx`
- **Changes**:
  - Added custom CSS class `.desktop-hidden` with media query:
    ```css
    @media (min-width: 1024px) {
      .desktop-hidden {
        display: none !important;
      }
    }
    ```
  - Updated AppShell to use `desktop-hidden` class on hamburger button
  - Replaced unreliable `lg:hidden` Tailwind class
- **Result**: Hamburger menu properly hidden on desktop (≥1024px), mobile intact

**Runtime Error Fix (DashboardView)**
- **Issue**: `Cannot read properties of undefined (reading 'length')` error
- **Root Cause**: `scan.violations` array not defined in demo data
- **Files Modified**: `/src/lib/local-data.ts` (created complete file)
- **Changes**:
  - Created complete `local-data.ts` module with proper scan structure
  - Added `violations: LocalViolation[]` to all scan objects
  - Aligned with `LocalScan` type definition from `types.ts`
  - Implemented all required functions:
    - `seedDemoData()`, `getAllScans()`, `saveScan()`, `deleteScan()`
    - `getScanById()`, `createScanFromOCR()`, `updateFieldReview()`
    - `getDashboardStats()`, `getReviewQueue()` functions
  - Updated demo scans to include proper field and violation arrays
- **Result**: Dashboard loads without errors, violations display correctly

**Sandbox Startup Fix**
- **Issue**: Dev server failing to start, showing 500 errors
- **Root Cause**: Missing `/src/lib/local-data.ts` file
- **Solution**: Created complete local-data.ts module with all required exports
- **Result**: Server starts successfully, HTTP 200 responses

**Documentation Updates**
- Created `VALIDATION_FIX_SUMMARY.md` - Detailed API validation fix documentation
- Created `UI_FIXES_SUMMARY.md` - Dialog and sidebar fix documentation
- Created `FEATURES.md` - Comprehensive feature documentation
- Updated `README.md` Changes Made section with all fixes
- Updated model listings with complete descriptions for all 13 models
- Added NVIDIA models section to documentation

**Updated File Changes Summary**
| File | Changes |
|------|---------|
| `src/app/api/validate-api-key/route.ts` | Increased timeout, added AbortController |
| `src/components/ui/dialog.tsx` | Fixed transparency with solid background |
| `src/app/globals.css` | Added `.desktop-hidden` CSS class |
| `src/components/app/AppShell.tsx` | Fixed hamburger menu visibility |
| `src/lib/local-data.ts` | Created complete module, fixed violations array |
| `README.md` | Updated Changes Made, model listings |
| `VALIDATION_FIX_SUMMARY.md` | New file - API validation details |
| `UI_FIXES_SUMMARY.md` | New file - UI fixes documentation |
| `FEATURES.md` | New file - Complete feature documentation |

---

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Tesseract.js Documentation](https://tesseract.projectnaptha.com/)
- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Zustand Documentation](https://zustand-demo.pmnd.rs/)
