# LMCC — Legal Metrology Compliance Checker

> **TL;DR — What this app is & how it works**
>
> LMCC scans photos of product labels and checks them against India's **Legal Metrology (Packaged Commodities) Rules, 2011** (plus EU CLP advisory checks). Three OCR modes:
>
> | Mode | How it works | Needs internet? |
> |---|---|---|
> | **Local** | Tesseract.js in your browser (optionally your own fine-tuned model) | ❌ No |
> | **AI** | Image → `/api/vision-fallback` → vision LLM (OpenRouter / NVIDIA) → structured fields | ✅ Yes |
> | **Hybrid** | Local first; AI fallback for low-confidence high-severity fields | ✅ Yes |
>
> Everything runs client-side (Next.js + localStorage) — no database, no auth. Train your own
> OCR model on your label photos via `training/` (Colab or local) and drop it into
> `public/tessdata/labelnet.traineddata`; the app picks it up automatically.
>
> **Status (2026-09-11): AI mode verified working end-to-end** against NVIDIA NIM
> (`meta/llama-3.2-11b-vision-instruct`) with real label photos. See
> `docs/AI_MODE_DEBUG_LOG.md` for the full diagnosis that made it work.

## 📑 Documentation Map

| File | Purpose |
|---|---|
| `docs/README.md` | **This file** — overview, setup, architecture |
| `docs/AI_PROVIDERS.md` | AI provider configuration, model IDs, troubleshooting |
| `docs/OCR_TRAINING.md` | Train your own OCR model (Colab / local) + hosting |
| `docs/ARCHITECTURE.md` | Codebase tour, data flow, key modules |
| `docs/AI_MODE_DEBUG_LOG.md` | How AI mode was debugged & fixed (2026-09-11) |
| `docs/DEVELOPER_GUIDE.md` | Historical developer notes |
| `training/README.md` | Training-folder quickstart (mirrors OCR_TRAINING) |

---

## 🌟 Key Features

- **Three OCR modes** (Local / AI / Hybrid) with per-mode progress UI
- **Custom fine-tuned models**: auto-detected at `/tessdata/labelnet.traineddata`
  (probe endpoint: `GET /api/ocr-model`)
- **Editable Model ID on every provider** — providers retire model IDs without notice;
  users can swap in new IDs without code changes
- **Resilient AI calls**: image downscaling before upload, retry with backoff for
  transient 5xx, 120s server timeout, JSON mode enforcement, prose→JSON conversion
  fallback, field-name synonym mapping
- **Compliance checking**: Legal Metrology 2011 (high severity) + EU CLP (advisory)
- **Review Queue**: approve/override low-confidence fields, re-runs compliance on edit
- **Export**: PDF (jsPDF + autotable) and CSV
- **100% client-side data**: localStorage only; works offline in Local mode

## 🚀 Quick Start

```bash
bun install        # or npm install
bun run dev        # http://localhost:3000
```

1. **Scan** (Demo Mode) works immediately — three seeded scenarios.
2. **Upload Mode → Local**: upload any label photo; OCR runs in-browser.
3. **Upload Mode → AI/Hybrid**: first configure a provider in **AI Providers**
   (see `docs/AI_PROVIDERS.md`), then pick the mode on the Scan page.

## 🏗️ Technology Stack

- **Next.js 16** (App Router, Turbopack) · **TypeScript 5** · **React 19**
- **Tailwind CSS 4** + **shadcn/ui** + Lucide icons + Framer Motion
- **Tesseract.js 5** (local OCR, shared worker), **heic2any**, **pdfjs-dist**
- **Zustand** + localStorage persistence
- **jsPDF** for report export
- **axios** (NVIDIA proxy) + native fetch (OpenRouter proxy)

## 📁 Project Layout

```
src/
├── app/
│   ├── api/
│   │   ├── vision-fallback/route.ts   # AI OCR proxy (OpenRouter + NVIDIA)
│   │   ├── validate-api-key/route.ts  # Provider key validation
│   │   └── ocr-model/route.ts         # Custom-model deployment status
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── app/
│   │   ├── AppShell.tsx               # Layout + navigation
│   │   ├── UploadScanView.tsx         # Scan UI (demo + upload, 3 OCR modes)
│   │   ├── AIProvidersView.tsx        # Provider config (editable model IDs)
│   │   ├── ComplianceReportView.tsx   # Report + PDF/CSV export
│   │   ├── ReviewQueueView.tsx        # Approve/override low-confidence fields
│   │   ├── DashboardView.tsx          # Stats & charts
│   │   ├── ProductHistoryView.tsx     # Scan history
│   │   ├── LegalReferenceView.tsx     # Rule reference browser
│   │   └── SettingsView.tsx
│   └── ui/                            # shadcn/ui primitives
└── lib/
    ├── ocr.ts                         # Local + cloud + hybrid OCR engine
    ├── local-data.ts                  # localStorage CRUD + compliance pipeline
    ├── compliance-rules.ts            # LM 2011 + EU CLP rules
    ├── extract/types.ts               # Field schema definitions
    ├── store.ts / hooks.ts / types.ts
public/
└── tessdata/                          # ← drop labelnet.traineddata here
training/                              # OCR model training pipeline (see docs)
docs/                                  # This documentation set
```

## 🔌 API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/vision-fallback` | POST | AI OCR: `{ image, provider: { apiUrl, model, apiKey }, category }` → structured OCR result |
| `/api/validate-api-key` | POST | Live key validation before saving |
| `/api/ocr-model` | GET | `{ deployed }` — is the fine-tuned model present? |

## 🧠 How OCR Works (condensed)

**Local**: format normalize (HEIC/PDF→JPEG) → resize → region detection (Sobel edges +
flood fill, QR/barcode exclusion) → per-region preprocessing (upscale + Otsu) →
Tesseract.js (shared worker, PSM per region type, row-by-row for tables) → regex +
spatial keyword extraction → confidence aggregation.

**AI**: image → client downscale (1400px JPEG) → `/api/vision-fallback` → provider
vision model with `response_format: json_object` → validation + field-name
normalization → (if prose) automatic prose→JSON conversion pass → fields.

**Hybrid**: local first; if any high-severity field is missing or < 0.65 confidence →
AI fallback → merge (cloud wins for high-severity when better).

Full details: `docs/ARCHITECTURE.md`.

## 📦 Deployment (Vercel / Netlify / Cloudflare Pages)

- Static asset hosting works out of the box — including
  `public/tessdata/labelnet.traineddata` (the fine-tuned OCR model).
- API routes need a Node runtime host (Vercel: default; Netlify: Next runtime;
  Cloudflare Pages: `@cloudflare/next-on-pages`).
- Verify a deployment: `curl -I https://<app>/tessdata/labelnet.traineddata` (expect 200)
  and `curl https://<app>/api/ocr-model` (expect `"deployed":true` once the model is added).

## 🔐 Security Notes

- API keys are entered in the browser, stored in `localStorage`, and forwarded to
  `/api/vision-fallback` per request — the route adds the key server-side to the
  provider call. Keys are never baked into client bundles.
- Labels are sent to the configured external AI provider only in AI/Hybrid modes.
- **Never commit real API keys.** Diagnostic scripts read keys from env vars
  (`NVIDIA_KEY_1`, `NVIDIA_KEY_2`).

## 🧪 Development Checks

```bash
npx tsc --noEmit   # typecheck (0 errors as of 2026-09-11)
bun run lint       # eslint
bun run build      # production build
```

## 📜 Changelog (highlights)

- **2026-09-11** — AI mode debugged live and fixed: JSON-mode enforcement, prose→JSON
  conversion fallback, 120s timeout, retry/backoff, image downscaling, field-name
  synonym mapping, dedicated AI progress steps, editable Model IDs everywhere,
  dead NVIDIA model IDs replaced (see `docs/AI_MODE_DEBUG_LOG.md`).
- **2026-09-10** — 502 investigation, skip-validation option, NVIDIA section.
- **Earlier** — localStorage rewrite, real Tesseract OCR, hazard fields, exports.

## 📄 License

TBD — add your license here.
