#!/usr/bin/env python3
"""
prepare_ground_truth.py — Build tesstrain ground truth from label photos.

What it does
------------
1. Loads every image in training/images (jpg/jpeg/png/webp/bmp/tif/tiff).
2. Crops to the densest-text block so line segmentation stays clean.
3. Uses Tesseract CLI (if installed) to segment lines + produce draft text.
4. Writes one PNG per text line plus a <name>.gt.txt transcription next to it,
   which is exactly the format tesstrain expects in data/<model>-ground-truth/.
5. --apply-corrections ZIP: applies human-verified transcriptions exported
   from the app's Settings → Training Data (review corrections captured as
   image + .gt.txt pairs). Matching pairs in training/ground-truth are
   overwritten with the corrected text; new pairs (image not yet present)
   are copied in wholesale, so app-captured data can be ingested directly.

Usage
-----
  python training/scripts/prepare_ground_truth.py                  # all images
  python training/scripts/prepare_ground_truth.py path/to/img.jpg  # one image
  python training/scripts/prepare_ground_truth.py --skip-tesseract # crop-only mode
  python training/scripts/prepare_ground_truth.py --apply-corrections lmcc-ground-truth-2026-09-12.zip

IMPORTANT: review the generated .gt.txt files afterwards and fix OCR mistakes —
transcriptions must be EXACT or you will teach the model errors.

If Tesseract CLI is missing, only the cropped page image is written
(ground-truth/page_001.png) — use the Colab notebook to segment + OCR it there.
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parents[2]
IMAGES_DIR = PROJECT_ROOT / "training" / "images"
GT_DIR = PROJECT_ROOT / "training" / "ground-truth"
TARGET_HEIGHT = 200          # upscale each line image to ~200px height
CROP_MIN_DENSITY = 0.02      # min fraction of dark pixels for a dense-text column/row band

SUPPORTED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}

# ── Pillow (required) ─────────────────────────────────────────────────────
try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

# ── Helpers ───────────────────────────────────────────────────────────────

def tesseract_available() -> bool:
    return shutil.which("tesseract") is not None


def to_grayscale(img):
    return img.convert("L")


def find_dense_crop(gray):
    """Crop to the bounding box of the densest text block (simple projection profile)."""
    import numpy as np

    arr = np.asarray(gray, dtype=np.uint8)
    # Binarize: dark pixels = text
    thresh = arr.mean() * 0.75
    dark = arr < thresh

    if not dark.any():
        return None

    col_density = dark.mean(axis=0)  # per-column fraction of dark pixels
    row_density = dark.mean(axis=1)

    def bands(density, min_frac):
        """Return list of (start, end) index runs where density >= min_frac."""
        runs, start = [], None
        for i, d in enumerate(density):
            if d >= min_frac and start is None:
                start = i
            elif d < min_frac and start is not None:
                if i - start >= 4:
                    runs.append((start, i))
                start = None
        if start is not None:
            runs.append((start, len(density)))
        return runs

    col_bands = bands(col_density, CROP_MIN_DENSITY)
    row_bands = bands(row_density, CROP_MIN_DENSITY)
    if not col_bands or not row_bands:
        return None

    # Take the widest column band and the widest row band that overlap dark pixels
    x0, x1 = max(col_bands, key=lambda r: r[1] - r[0])
    y0, y1 = max(row_bands, key=lambda r: r[1] - r[0])

    # Pad a bit
    pad = 8
    w, h = arr.shape[1], arr.shape[0]
    return (
        max(0, x0 - pad),
        max(0, y0 - pad),
        min(w, x1 + pad),
        min(h, y1 + pad),
    )


def upscale_line(img, target_height=TARGET_HEIGHT):
    """Upscale a line image to a consistent height (Tesseract prefers ~30-50px x-height)."""
    scale = target_height / img.height
    return img.resize((max(1, int(img.width * scale)), target_height), Image.LANCZOS)


def segment_and_ocr_lines(img, name, out_dir):
    """Use Tesseract CLI to split the image into line images with draft transcriptions."""
    import numpy as np

    gray = to_grayscale(img)
    arr = np.asarray(gray, dtype=np.uint8)
    thresh = arr.mean() * 0.75
    dark = arr < thresh

    row_density = dark.mean(axis=1)
    line_bands = []
    start = None
    for i, d in enumerate(row_density):
        if d > 0.01 and start is None:
            start = i
        elif d <= 0.01 and start is not None:
            if i - start >= 12:  # ignore tiny specks
                line_bands.append((start, i))
            start = None
    if start is not None:
        line_bands.append((start, len(row_density)))

    if not line_bands:
        print(f"  ⚠️  No text lines found in {name}; skipping")
        return 0

    count = 0
    pad = 4
    for idx, (y0, y1) in enumerate(line_bands, start=1):
        band = img.crop((0, max(0, y0 - pad), img.width, min(img.height, y1 + pad)))
        band = upscale_line(band)

        stem = f"{name}_line_{idx:03d}"
        png_path = out_dir / f"{stem}.png"
        band.save(png_path)

        # OCR the single line for a draft transcription
        try:
            result = subprocess.run(
                ["tesseract", str(png_path), "stdout", "--psm", "7"],
                capture_output=True, text=True, timeout=30,
            )
            draft = result.stdout.strip()
        except (subprocess.TimeoutExpired, FileNotFoundError):
            draft = ""

        txt_path = out_dir / f"{stem}.gt.txt"
        txt_path.write_text(draft + "\n", encoding="utf-8")
        count += 1

    return count


def process_image(img_path, out_dir, skip_tesseract):
    name = img_path.stem
    print(f"Processing {img_path.name} →")

    img = Image.open(img_path)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    # Crop to dense text region
    gray = to_grayscale(img)
    crop = find_dense_crop(gray)
    if crop:
        img = img.crop(crop)
        print(f"  cropped to dense text region: {crop}")
    else:
        print("  no dense region found — using full image")

    # Save the cropped page for reference / Colab use
    page_path = out_dir / f"{name}_page.png"
    img.save(page_path)

    if skip_tesseract or not tesseract_available():
        if not skip_tesseract:
            print("  (Tesseract CLI not found — wrote page image only; use Colab to segment lines)")
        else:
            print("  --skip-tesseract: wrote page image only")
        return 0

    n = segment_and_ocr_lines(img, name, out_dir)
    print(f"  {n} line images written")
    return n


def apply_corrections_zip(zip_path, out_dir):
    """Apply app-exported review corrections (image + .gt.txt pairs) to the ground-truth dir.

    The ZIP (from the app's Settings → Training Data → Export) contains:
      ground-truth/<stem>.png       cropped label region
      ground-truth/<stem>.gt.txt    human-verified transcription
      corrections.csv               audit manifest (informational)

    Existing pairs with the same stem are overwritten with the corrected
    text; pairs whose image is not yet on disk are copied in whole.
    """
    import zipfile

    with zipfile.ZipFile(zip_path) as zf:
        names = set(zf.namelist())
        gt_names = sorted(n for n in names if n.startswith("ground-truth/") and n.endswith(".gt.txt"))
        if not gt_names:
            print(f"No ground-truth/*.gt.txt entries found in {zip_path}")
            return

        applied = copied = skipped_empty = 0
        for name in gt_names:
            stem = Path(name).stem
            text = zf.read(name).decode("utf-8")
            if not text.strip():
                skipped_empty += 1
                continue

            png_name = f"ground-truth/{stem}.png"
            png_target = out_dir / f"{stem}.png"
            txt_target = out_dir / f"{stem}.gt.txt"

            if png_name in names and not png_target.exists():
                png_target.write_bytes(zf.read(png_name))
                copied += 1
            elif not png_target.exists():
                print(f"  ⚠️  {stem}: no image in ZIP and none on disk — transcription skipped")
                continue

            txt_target.write_text(text, encoding="utf-8")
            applied += 1

        print(f"✅ Corrections applied to {out_dir}: "
              f"{applied} transcription(s) written, {copied} new image pair(s) copied in")
        if skipped_empty:
            print(f"⚠️  Skipped {skipped_empty} empty correction(s)")
        if "corrections.csv" in names:
            print("   corrections.csv manifest found — kept for audit (not applied)")
        print("⚠️  REVIEW the merged .gt.txt files once more before training!")


def main():
    ap = argparse.ArgumentParser(description="Prepare tesstrain ground truth from label photos")
    ap.add_argument("images", nargs="*", help="specific image files (default: all in training/images)")
    ap.add_argument("--skip-tesseract", action="store_true", help="only crop pages, skip line segmentation")
    ap.add_argument("--out", default=str(GT_DIR), help="output dir (default: training/ground-truth)")
    ap.add_argument(
        "--apply-corrections",
        metavar="ZIP",
        help="apply human-verified corrections from a Training Data ZIP exported by the app",
    )
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.apply_corrections:
        apply_corrections_zip(Path(args.apply_corrections), out_dir)
        return

    if args.images:
        paths = [Path(p) for p in args.images]
    else:
        paths = sorted(p for p in IMAGES_DIR.iterdir()
                       if p.suffix.lower() in SUPPORTED_EXT and not p.name.startswith("."))

    if not paths:
        print(f"No images found in {IMAGES_DIR}")
        print("Add your label photos there first, then re-run this script.")
        return

    print(f"Output: {out_dir}\n")
    total = 0
    for p in paths:
        if p.suffix.lower() not in SUPPORTED_EXT:
            print(f"Skipping unsupported file: {p.name}")
            continue
        try:
            total += process_image(p, out_dir, args.skip_tesseract)
        except Exception as e:
            print(f"  ❌ Failed: {e}")

    print(f"\n✅ Done — {total} line pairs written to {out_dir}")
    if total:
        print("⚠️  REVIEW every .gt.txt file and fix transcription errors before training!")
        print("   Then run:  bash training/train_local.sh   (or the Colab notebook)")


if __name__ == "__main__":
    main()
