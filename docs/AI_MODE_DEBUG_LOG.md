# AI Mode Debug Log — 2026-09-11

> **Summary**: AI mode always failed with what looked like a "region detection" error.
> Deep debugging with live NVIDIA API keys revealed the real failures; all are fixed and
> verified end-to-end. This document records the evidence so future regressions are fast
> to diagnose.

## Symptom

- AI mode always threw an error — the progress UI appeared to fail at **"Region Detect"**.
- Fields were never filled in AI mode.

**First insight**: AI mode never runs region detection. All cloud progress was mapped to
step 2 ("Region Detect") in `UploadScanView.tsx`, so *any* AI error surfaced as an
"error at region detection". The step label was a red herring — the failures were
downstream. AI mode now has dedicated steps (Format Check → Uploading → AI Analyzing →
Parsing Fields → Compliance Check → Complete).

## Diagnosis (live API testing)

Using temporary NVIDIA keys and a real label photo
(`organic-high-fiber-healthy-brown-basmati-rice-back.webp`), the exact app payload was
replayed against `integrate.api.nvidia.com`:

| Test | Result |
|---|---|
| `meta/llama-3.2-11b-vision-instruct`, exact app payload | **200 OK in 28.7s** — but returned **prose**, not JSON |
| Same model + `response_format: { type: 'json_object' }` | **200 OK in 47.5s — valid JSON** ✅ |
| Same model + `nvext.guided_json` | **ignored** (prose again) — guided decoding not supported on this model |
| `meta/llama-3.2-90b-vision-instruct` | **timeout > 120s** |
| `moonshotai/kimi-k3` (with image) | **timeout > 120s** (model is text-only; hangs on images) |
| `qwen/qwen-2-vl-7b-instruct` | **404 — model does not exist on NVIDIA anymore** |
| Model list (`/v1/models`) | no Qwen VL models at all; no `phi-3.5-vision` (only `phi-3-vision-128k`) |

## Root Causes Found

1. **The 11B model ignored JSON instructions** → route's `extractJSON` failed → 500
   "Failed to parse AI response" → generic OCR Error toast. This was the primary bug.
   (Non-deterministic: sometimes it *does* emit JSON — which is why the failure seemed
   constant but the code looked correct.)
2. **Dead model IDs**: `qwen/qwen-2-vl-7b-instruct` 404s; `phi-3.5-vision` is gone;
   Kimi K3 hangs on images (text-only). Two of four NVIDIA defaults were unusable.
3. **30s timeout vs 28-50s real latency**: responses that would have succeeded were
   aborted mid-flight.
4. **Field-name mismatch**: even on JSON successes, the model emitted field names like
   `"Serving Size"`, `"Manufacturer Name"` — all rejected by strict schema validation,
   producing "success" with **0 fields**.
5. **Large uploads**: phone photos sent multi-MB base64 payloads, worsening latency/timeouts.

## Fixes Applied

| Fix | Where |
|---|---|
| `response_format: { type: 'json_object' }` on the extraction request | `vision-fallback/route.ts` |
| Prose→JSON **conversion pass** (re-ask same model, 90s) + final prose-as-rawText fallback | `vision-fallback/route.ts` |
| Timeout 30s → **120s** | `vision-fallback/route.ts` (NVIDIA/axios path) |
| **Field-name synonym mapping** (`normalizeFieldName` + `FIELD_SYNONYMS`) | `vision-fallback/route.ts` |
| Lenient validation (string confidence, missing rawText, missing sourceText) | `vision-fallback/route.ts` (earlier session) |
| Client **image downscaling** (≤1400px JPEG, skips when already small) | `ocr.ts` |
| **Retry ×3 with backoff** on 502/503/504 + network errors | `ocr.ts` |
| Dedicated **AI progress steps** (no more fake "Region Detect") | `UploadScanView.tsx` |
| Live provider re-check at scan time | `UploadScanView.tsx` |
| **Editable Model ID on every provider** (was custom-only) | `AIProvidersView.tsx` |
| Dead NVIDIA defaults replaced + localStorage **migration** drops dead IDs | `AIProvidersView.tsx` |
| New error messages (parse errors distinguished from timeouts) | `UploadScanView.tsx` |

## Verification (through the real route on the dev server)

`POST /api/vision-fallback` with the real label image, NVIDIA Llama 3.2 11B:

```
status=200 in ~48-51s
productName: "Organic Pusa Basmati Rice (Brown)"
manufacturerName: "Vedica Organics LLC"
fields with values: 4-5/13  (manufacturer_name, manufacturer_address,
                             consumer_care, other_declarations, precautionary_statements)
```

Regression: dead model ID (`qwen/qwen-2-vl-7b-instruct`) → clean
`404 "NVIDIA model not found. Please check the model ID in AI Providers settings."`

Both runs consistent; the prose→JSON conversion path also exercised successfully.

## Reproducing the Tests

Diagnostic scripts live in `scripts/` (keys are read from env vars — never hardcode):

```bash
NVIDIA_KEY_1=nvapi-... NVIDIA_KEY_2=nvapi-... node scripts/diag-nvidia.cjs   # raw payload replay
NVIDIA_KEY_1=nvapi-... node scripts/diag-nvidia2.cjs                          # model list + guided_json
NVIDIA_KEY_1=nvapi-... NVIDIA_KEY_2=nvapi-... node scripts/diag-e2e.cjs      # full route E2E
```

## Notes for the Future

- The 11B model's JSON compliance is unreliable **without** `response_format`; if a
  provider is added that doesn't support `response_format`, the prose-conversion pass
  is the safety net.
- Re-verify model IDs against `GET https://integrate.api.nvidia.com/v1/models`
  periodically — NVIDIA rotates its catalog without notice.
- Latency budget: expect 30-60s per label on the 11B model; UI progress reflects the
  upload → analyze → parse phases.
