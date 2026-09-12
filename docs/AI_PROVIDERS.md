# AI Providers — Configuration & Troubleshooting

> **Summary**: Configure AI providers in the **AI Providers** view. Every provider —
> including the pre-configured defaults — has an **editable Model ID**, because providers
> retire model IDs without notice. NVIDIA NIM vision models are the recommended free
> option; `meta/llama-3.2-11b-vision-instruct` is verified working (2026-09-11).

## Provider Types

| Provider | Endpoint | Key format |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | `sk-or-...` |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1/chat/completions` | `nvapi-...` |
| Custom | any OpenAI-compatible chat completions URL | any |

## Default Providers (verified 2026-09-11)

**NVIDIA NIM (recommended — free tier):**

| Model ID | Status | Notes |
|---|---|---|
| `meta/llama-3.2-11b-vision-instruct` | ✅ works | ~30-50s per label; **recommended default** |
| `meta/llama-3.2-90b-vision-instruct` | ⚠️ very slow | >2 min per label; highest accuracy |
| `microsoft/phi-3-vision-128k-instruct` | ✅ available | compact, fast |
| ~~`qwen/qwen-2-vl-7b-instruct`~~ | ❌ **404 — removed** | no longer exists on NVIDIA |
| ~~`moonshotai/kimi-k3`~~ | ❌ **removed** | exists but text-only; hangs on image input |
| ~~`microsoft/phi-3.5-vision-instruct`~~ | ❌ **404 — replaced** | use `phi-3-vision-128k-instruct` |

The app auto-removes dead defaults from stored localStorage config on load
(`DEAD_PROVIDER_IDS` migration in `AIProvidersView.tsx`).

**OpenRouter:** GPT-4o / GPT-4o Mini / Claude 3.5 Sonnet / Claude 3 Opus / Gemini Pro
Vision / DeepSeek VL2 / Qwen VL — all vision-capable via one endpoint.

## Editing the Model ID

Every provider's **Configure** dialog includes an editable **Model ID** field:

1. Open **AI Providers** → find the provider card.
2. Click **Add API Key** (or re-configure).
3. Change **Model ID** to any current vision-capable model.
4. Enter/keep the API key → **Save**.

Use this whenever a provider retires a model ID (NVIDIA has done so repeatedly).

## Setting Up (step by step)

1. Get a key: [build.nvidia.com](https://build.nvidia.com) (NVIDIA) or
   [openrouter.ai/keys](https://openrouter.ai/keys) (OpenRouter).
2. **AI Providers** → tab (OpenRouter / NVIDIA) → **Add API Key** on a model card.
3. Paste the key → optionally edit **Model ID** → **Validate Key** → **Save**.
4. Toggle the provider **on** (only one active provider at a time).
5. On the **Scan Product** page (Upload Mode), pick **AI** or **Hybrid**.

If validation fails due to network restrictions, use **Skip validation** and save —
the key is still tested for real on the first scan.

## Troubleshooting

| Symptom | Cause & fix |
|---|---|
| `404 ... model not found` | Model ID retired. Edit the Model ID (see above) to a current one. |
| `Timeout` after ~2 min | Model too slow (90B) or provider overload. Use the 11B model; AI calls retry transient 5xx automatically. |
| `AI Response Error ... unexpected response` | Model ignored JSON mode twice (rare). Try another model. |
| Fields missing in report | Model didn't see the text — try better lighting/contrast, or Hybrid mode (local spatial OCR covers gaps). |
| `429 rate limit` | Free-tier quota; wait or switch provider. |
| `401 invalid key` | Key wrong/revoked — re-enter it. |
| Everything fails, error mentions network | Corporate proxy/firewall blocking `integrate.api.nvidia.com` / `openrouter.ai`. |

## What the App Does to Make AI Calls Reliable

- **Downscales** the image to ≤1400px JPEG before upload (5-6× smaller payload).
- **Retries** transient upstream errors (502/503/504) up to 3× with backoff.
- **120s server timeout** (measured real-world: 28-50s for one label on the 11B model).
- **`response_format: { type: 'json_object' }`** forces structured output.
- **Prose→JSON conversion pass**: if the model ignores JSON mode, the route re-asks the
  same model to convert its prose into the required JSON (verified working).
- **Field-name synonym mapping**: models emit names like `"Manufacturer Name"` /
  `"Net Weight"` / `"MRP"`; these are mapped onto the schema field names.
- **Graceful degradation**: worst case the prose is kept as `rawText` instead of failing.
