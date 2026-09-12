# 🏷️ OCR Model Training — Complete Guide

This folder contains everything needed to fine-tune a **Tesseract 5 LSTM** model on
your own product-label photos and use it in the app.

```
training/
├── images/                    ← PUT YOUR LABEL PHOTOS HERE (jpg/png/webp/…)
├── ground-truth/              ← generated .png + .gt.txt line pairs (review these!)
├── models/                    ← training output (labelnet.checkpoint, .traineddata)
├── scripts/
│   └── prepare_ground_truth.py  ← crops images & drafts transcriptions
├── colab_train_ocr.ipynb      ← one-click Google Colab training (recommended)
├── train_local.sh             ← local training with tesstrain (WSL/Linux/macOS)
└── README.md                  ← this file
```

**The final artifact is always one file: `labelnet.traineddata`.**
Drop it into `public/tessdata/` and the app picks it up automatically (no code changes).

---

## Step 0 — Add sample images

1. Photograph/scan **10–50 labels** (more = better; 100+ line crops is the sweet spot).
2. Save them into `training/images/`.
   - Good: straight-on shots, sharp focus, even lighting, text fills most of the frame.
   - Avoid: heavy glare, extreme angles, tiny text surrounded by empty background.
3. Make sure Tesseract CLI is installed locally for the draft transcription step
   (`sudo apt install tesseract-ocr` on Ubuntu/WSL; the Colab notebook installs it for you
   in the cloud, so this is optional if you only train on Colab).

## Step 1 — Generate ground truth

```bash
pip install Pillow numpy
python training/scripts/prepare_ground_truth.py
```

This crops each label to its dense text block, splits it into line images, and drafts a
`.gt.txt` transcription for each line using Tesseract.

**⚠️ THE MOST IMPORTANT STEP:** open `training/ground-truth/` and manually fix every
`.gt.txt` so it matches the image **exactly** (spelling, punctuation, casing, ₹ symbols).
Anything wrong in these files is *taught* to the model. A few minutes of review here matters
more than anything else in the whole pipeline.

## Step 2A — Train on Google Colab (recommended, no local install)

1. Go to [colab.research.google.com](https://colab.research.google.com) → **File → Upload notebook**
   → pick `training/colab_train_ocr.ipynb`. Free CPU runtime is fine (≈15–45 min).
2. **Run all cells** (Runtime → Run all). When the upload cell asks, select your
   `training/images/` folder — or upload a zip of it.
3. Wait for training to finish; the notebook evaluates the model on a held-out line and
   writes `labelnet.traineddata` to its outputs.
4. **Download** `labelnet.traineddata` from the final cell's output/files panel.
5. Put it in `public/tessdata/` locally (and/or follow the hosting section below).

### Importing ground truth INTO Colab (alternative flow)

If you already ran `prepare_ground_truth.py` locally and reviewed the `.gt.txt` files,
zip `training/ground-truth/` and upload that instead — the notebook accepts either the raw
images (segments in the cloud) or the ready-made line pairs.

### Exporting from Colab

The final cell offers:
- A browser **download** of `labelnet.traineddata`, and
- An optional cell that saves it to your Google Drive (`/content/drive/MyDrive/`)
  so you can sync it to your machine without a manual download.

## Step 2B — Train locally (WSL/Linux/macOS)

```bash
# WSL (Ubuntu) prerequisites:
sudo apt install tesseract-ocr libtesseract-dev libleptonica-dev make python3 git

# Then, from the project root (Git Bash or WSL on Windows):
bash training/train_local.sh

# Optional knobs:
MODEL_NAME=labelnet MAX_ITERATIONS=3000 bash training/train_local.sh
```

The script clones tesstrain, links your reviewed `ground-truth/`, downloads the English
base model, fine-tunes, and writes **`training/models/labelnet.traineddata`**.

## Step 3 — Deploy the model into the app

Copy the file into the app's public folder (it must keep the exact name):

```bash
cp training/models/labelnet.traineddata public/tessdata/labelnet.traineddata
```

- The app probes `/tessdata/labelnet.traineddata` with a HEAD request at scan time
  (`isCustomModelAvailable()` in `src/lib/ocr.ts`).
- If found → every OCR pass (full image, per-region, table rows) uses your fine-tuned model
  through a single shared Tesseract worker (`langPath: '/tessdata'`, `gzip: false`).
- If absent → stock `eng` from the CDN, unchanged behaviour.
- Check status any time at **`GET /api/ocr-model`** → `{ deployed: true/false }`.
- Files must be **uncompressed** (`.traineddata`, not `.gz`) — `gzip: false` disables the
  `.gz` suffix fetch.

---

## Hosting the trained model (Vercel / Netlify / Cloudflare Pages)

**Yes — it works on all three**, because `public/tessdata/labelnet.traineddata` is just a
static asset that ships with the app. Nothing server-side is needed at scan time (OCR runs
in the browser).

### Vercel

1. Commit `public/tessdata/labelnet.traineddata` to your repo, push → `vercel deploy`.
2. Vercel serves `/tessdata/labelnet.traineddata` as a static file with CDN caching. Done.
3. Notes:
   - Keep the file under ~100 MB (fine-tuned models are usually 2–15 MB).
   - If you don't want the model in git, upload it in the Vercel dashboard build step or
     fetch it from a private bucket in `next.config.ts` rewrites — simplest is committing it.

### Netlify

1. Commit + push, then `netlify deploy --prod` (or connect the repo in the dashboard).
2. Netlify publishes the whole `public/` (or `.next`) output — the traineddata is served at
   `/tessdata/labelnet.traineddata`.
3. Large-asset note: the free plan has a 100 MB/deploy-file practical limit; fine-tuned
   models are far below it.

### Cloudflare Pages

1. Connect the repo → build command `npm run build` → output `.next` (via
   `@cloudflare/next-on-pages`) or `public/` for static export.
2. `public/tessdata/labelnet.traineddata` is served straight from the edge with no config.
3. Tip: add a `_headers` file if you want `Cache-Control: public, max-age=31536000, immutable`
   on `/tessdata/*` (the filename acts as the cache key — bump the name or `LMCC_MODEL`
   constant when you retrain).

### Verifying a deployment

```bash
curl -I https://your-app.vercel.app/tessdata/labelnet.traineddata   # 200 = deployed
curl https://your-app.vercel.app/api/ocr-model                      # {"deployed":true,...}
```

If the HEAD probe gets an HTML 404 page instead of the binary, the app correctly falls back
to `eng` — check that the file name is exact and it was committed before the deploy.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| App never picks up the model | Filename must be exactly `labelnet.traineddata` in `public/tessdata/`; check `GET /api/ocr-model`. |
| OCR got *worse* after training | `.gt.txt` files contain transcription errors — fix them and retrain. |
| `tesstrain` make fails locally | Missing training tools — use WSL or the Colab notebook instead. |
| Model loads but text is garbage | Ensure the traineddata is uncompressed and fully downloaded (check file size). |
| Only 10–20 ground-truth lines | That's a smoke test — aim for 100+ line crops across your label variants. |

## Retraining later

Add new photos to `training/images/`, re-run `prepare_ground_truth.py`, review, retrain,
copy the new traineddata over `public/tessdata/labelnet.traineddata`, redeploy. The app
probes at runtime, so it picks up the new model on the next page load.
