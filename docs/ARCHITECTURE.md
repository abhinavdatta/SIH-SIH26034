# Architecture — Codebase Tour

> **Summary**: LMCC is a client-side Next.js SPA. Scans, providers, and settings live in
> `localStorage`; OCR runs either in the browser (Tesseract.js worker) or through one
> server route (`/api/vision-fallback`) that proxies to OpenRouter/NVIDIA. Compliance
> rules are pure functions over the extracted field list.

## High-Level Data Flow

```
                        ┌────────────────────────────────────────────┐
                        │              UploadScanView                │
                        │  (demo mode │ upload mode + OCR mode pick) │
                        └───────────────┬────────────────────────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼ Local                         ▼ AI                            ▼ Hybrid
 performOCR()              performCloudOCR()                    performHybridOCR()
 in-browser Tesseract      downscale → POST /api/                local first; if high-severity
 shared worker             vision-fallback → provider            field missing/<0.65 → cloud →
 region pipeline           (response_format=json_object,         mergeOCRResults (cloud wins
 regex + spatial extract   prose→JSON conversion, retries)       high-severity when better)
        │                               │                               │
        └───────────────┬───────────────┴───────────────────────────────┘
                        ▼
             OCRResult { productName, manufacturerName, fields[],
                         rawText, overallConfidence }
                        ▼
        createScanFromOCR() → runComplianceCheck()  (compliance-rules.ts)
                        ▼
             LocalScan → saveScan() → localStorage('lmcc-scans')
                        ▼
       ComplianceReportView / ReviewQueue / Dashboard / Export (PDF/CSV)
```

## Key Modules

| Module | Responsibility |
|---|---|
| `src/lib/ocr.ts` | All three OCR engines. Local: shared Tesseract worker, custom-model probe (`/tessdata/labelnet.traineddata`), region detection, table row-splitting, spatial keyword extraction. Cloud: downscale, retry/backoff, `/api/vision-fallback` client. Hybrid: threshold + merge logic. |
| `src/app/api/vision-fallback/route.ts` | Server AI proxy. Builds extraction prompt (with guardrails), routes to NVIDIA (axios) or OpenRouter (fetch), enforces JSON mode, converts prose→JSON when needed, normalizes field names, lenient validation. |
| `src/app/api/ocr-model/route.ts` | Reports whether the fine-tuned model is deployed (`{ deployed }`). |
| `src/app/api/validate-api-key/route.ts` | Live key validation with skip option. |
| `src/lib/compliance-rules.ts` | LM 2011 + EU CLP rule checks (pure functions over fields). |
| `src/lib/local-data.ts` | localStorage CRUD, demo seeding, `createScanFromOCR` (OCRResult → compliance-checked LocalScan). |
| `src/components/app/AIProvidersView.tsx` | Provider CRUD UI; **editable Model ID on every provider**; dead-default migration; single-active-provider enforcement. |
| `src/components/app/UploadScanView.tsx` | Scan UI. Demo + upload modes; Local/AI/Hybrid selector; region selector (local/hybrid only); per-mode progress steps (AI has its own set). |
| `src/lib/extract/types.ts` | Canonical field schema (13 fields incl. hazard/CLP advisory fields). |

## localStorage Keys

| Key | Content |
|---|---|
| `lmcc-scans` | All scan records (`LocalScan[]`) |
| `lmcc-ai-providers` | Provider configs (`AIProvider[]`, keys included — browser-local only) |
| `lmcc-cloud-ocr-enabled` | Legacy cloud-mode toggle |

## Progress Step Mapping (Upload Mode)

| Mode | Steps |
|---|---|
| Local | Format Check → Preprocessing → Region Detect → OCR Extraction → Compliance Check → Complete |
| AI | Format Check → Uploading → AI Analyzing → Parsing Fields → Compliance Check → Complete |
| Hybrid | shares the Local set, cloud phase mapped onto OCR Extraction/Compliance |

## AI Reliability Chain (`vision-fallback`)

1. Client downscales image (≤1400px JPEG; skips if already small).
2. Client POSTs with up to 3 attempts (backoff on 502/503/504/network).
3. Server: 120s timeout, `response_format: json_object`.
4. If prose returned: one conversion pass (re-ask model, 90s).
5. If still prose: prose becomes `rawText`; scan degrades instead of failing.
6. Field names pass through `normalizeFieldName` (synonym map) before validation.
7. Validation coerces string/percent confidences, recovers missing `rawText`,
   tolerates missing `sourceText`/`reasoning`.

## Custom OCR Model Chain

`ensureTesseractWorker()` (ocr.ts) HEAD-probes `/tessdata/labelnet.traineddata` once →
creates the shared worker with `langPath: '/tessdata'`, `gzip: false` when present →
every OCR pass (full image / per-region / table rows) uses it → falls back to stock
`eng` from CDN otherwise. `lmccModelActive` / `isCustomModelAvailable()` expose state
for diagnostics.

## Conventions

- TypeScript strict; no `any` (ESLint enforced).
- shadcn/ui primitives + CSS variables for theming (`var(--primary)` etc.).
- Client components mark `'use client'`; API routes are Node runtime.
- Never commit API keys; diagnostic scripts use env vars.
