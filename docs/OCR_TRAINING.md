# OCR Model Training — Fine-Tune Tesseract on Your Labels

> **Summary**: Yes, you can train the local OCR with sample images. Put label photos in
> `training/images/`, generate + review ground truth, train via **Google Colab** (no
> local install) or locally with tesstrain, then drop the resulting
> `labelnet.traineddata` into `public/tessdata/`. The app auto-detects it — no code
> changes. The trained model also hosts fine as a static file on Vercel/Netlify/Cloudflare.

## The Pipeline at a Glance

```
training/images/*.jpg  ──►  prepare_ground_truth.py  ──►  training/ground-truth/*.png + *.gt.txt
        (your photos)         (auto line-split + draft        (⚠ YOU review the .gt.txt files —
                               transcriptions)                   exact transcriptions are critical)
                                                                       │
                                                        ┌──────────────┴──────────────┐
                                                        ▼                             ▼
                                              colab_train_ocr.ipynb           train_local.sh
                                              (Google Colab, ~15-45 min)      (WSL/Linux/macOS)
                                                        └──────────────┬──────────────┘
                                                                       ▼
                                                     labelnet.traineddata
                                                                       │
                                                          copy to public/tessdata/
                                                                       ▼
                                              app auto-detects on next scan ✅
```

## Step-by-Step

1. **Add photos** — 10-50 straight-on, sharp, evenly-lit label photos → `training/images/`.
2. **Generate ground truth** — `pip install Pillow numpy` then
   `python training/scripts/prepare_ground_truth.py`.
3. **Review transcriptions** — fix every `.gt.txt` in `training/ground-truth/` to match
   the image exactly. *This step determines model quality more than anything else.*
4. **Train**:
   - **Colab (recommended)**: upload `training/colab_train_ocr.ipynb` to
     [colab.research.google.com](https://colab.research.google.com) → Runtime → Run all →
     upload your images when prompted → download `labelnet.traineddata` at the end.
     You can also upload a pre-reviewed `ground-truth/` zip instead of raw images.
   - **Locally**: `bash training/train_local.sh` (needs Tesseract + training tools;
     WSL recommended on Windows). Output: `training/models/labelnet.traineddata`.
5. **Deploy into the app** — `cp training/models/labelnet.traineddata public/tessdata/`
   (must keep the exact filename, uncompressed).
6. **Verify** — `GET /api/ocr-model` returns `{"deployed": true}`; the scan progress then
   shows "Loading fine-tuned labelnet OCR model...".

## Hosting the Trained Model

`public/tessdata/labelnet.traineddata` is an ordinary static asset:

- **Vercel**: commit the file and deploy — served via CDN automatically.
- **Netlify**: ships with the published `public/` output.
- **Cloudflare Pages**: served from the edge; optionally add
  `Cache-Control: immutable` for `/tessdata/*` in `_headers`.

Verify any deployment: `curl -I https://<app>/tessdata/labelnet.traineddata` → 200.
If it 404s or serves HTML, the app silently falls back to stock `eng`.

## Rules & Troubleshooting

- Filename **must** be `labelnet.traineddata`, **uncompressed** (never `.gz` — the app
  fetches with `gzip: false`).
- Aim for **100+ reviewed line crops** across your label variants (10 is a smoke test).
- OCR got worse after training? → transcription errors in `.gt.txt`; fix and retrain.
- Full details, knobs (`MODEL_NAME`, `MAX_ITERATIONS`), and the troubleshooting table:
  **`training/README.md`**.
