# tessdata — custom OCR model deployment folder

Drop your fine-tuned Tesseract model here as an **uncompressed** file:

```
public/tessdata/labelnet.traineddata
```

## Where does `labelnet.traineddata` come from?

1. Train it with **Google Colab**: open `training/colab_train_ocr.ipynb` and run all cells.
   - Upload your label photos to `training/images/` and matching text files to `training/ground-truth/` first (see `training/README.md`).
   - The notebook produces `labelnet.traineddata` in its output/archive — download it.
2. Or train **locally**: run `training/train_local.sh` (requires Tesseract training tools, see `training/README.md`).

Then copy the file into this folder and commit it (or upload it directly to your host).

## Rules

- Filename **must** be exactly `labelnet.traineddata` — the app probes this URL at
  `/tessdata/labelnet.traineddata` (HEAD request) before switching from the stock `eng` model.
- Must be **uncompressed** (`.traineddata`, not `.traineddata.gz`) — the app fetches with
  `gzip: false`, which disables the `.gz` suffix that tesseract.js normally appends.
- Keep it small if you can: a fine-tuned model starts from a "mini" traineddata and usually
  stays a few MB, which is fine for hosting on Vercel/Netlify/Cloudflare Pages.

## How the app uses it

`src/lib/ocr.ts` exposes `isCustomModelAvailable()` (HEAD probe) and `LMCC_MODEL = 'labelnet'`.
When the probe succeeds, every OCR pass — full image, per-region, and table rows — runs through a
shared Tesseract worker created with `langPath: '/tessdata'`. When the file is absent, the app
falls back to the stock `eng` model from the CDN automatically.
