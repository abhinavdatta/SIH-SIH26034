#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# LMCC OCR Model Training — Local (tesstrain)
# Fine-tunes a Tesseract LSTM model on YOUR label photos, producing a custom
# <name>.traineddata you can drop into public/tessdata/ so the app uses it.
# ═══════════════════════ CPU: fine-tuning is CPU-friendly (no GPU needed).
#   On Windows: run inside Git Bash, or WSL for the best experience.
# ═══════════════════════════════════════════════════════════"/"═══════════════
set -euo pipefail

# ── Config (override via env: MODEL_NAME=labelnet ./train_local.sh) ──────
MODEL_NAME="${MODEL_NAME:-labelnet}"
START_MODEL="${START_MODEL:-eng}"          # fine-tune from English
MAX_ITERATIONS="${MAX_ITERATIONS:-3000}"
RATIO_TRAIN="${RATIO_TRAIN:-0.90}"
TESSDATA_BEST_URL="https://github.com/tesseract-ocr/tessdata_best/raw/main/eng.traineddata"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRAIN_DIR="$ROOT/training"
GT_DIR="$TRAIN_DIR/ground-truth"
WORK_DIR="$TRAIN_DIR/tesstrain"
OUTPUT_DIR="$TRAIN_DIR/models/$MODEL_NAME"
FINAL_TRAINEDDATA="$TRAIN_DIR/models/$MODEL_NAME.traineddata"

# ── Checks ────────────────────────────────────────────────────────────────
command -v make  >/dev/null 2>&1 || { echo "❌ GNU make is required (Windows: winget install ezwinports.make, or use WSL)"; exit 1; }
command -v python >/dev/null 2>&1 || { echo "❌ Python 3 is required"; exit 1; }
command -v git   >/dev/null 2>&1 || { echo "❌ git is required"; exit 1; }

if ! command -v tesseract >/dev/null 2>&1; then
  echo "❌ Tesseract CLI (with training tools) is required for local training."
  echo "   Install: see https://tesseract-ocr.github.io/tessdoc/Compiling.html"
  echo "   Easiest on Windows: use WSL (Ubuntu): sudo apt install tesseract-ocr libtesseract-dev"
  echo "   Or run training in Google Colab instead: training/colab_train_ocr.ipynb"
  exit 1
fi

# Training tools must exist too (tesseract --version doesn't prove training tools exist)
if ! tesseract --help-lstm 2>/dev/null | head -1 >/dev/null 2>&1; then
  echo "⚠️  tesseract CLI present but training tools may be missing — continuing anyway."
fi

# ── Ground truth presence ─────────────────────────────────────────────────
n_gt=$(find "$GT_DIR" -name '*.gt.txt' 2>/dev/null | wc -l | tr -d ' ')
if [ "$n_gt" -lt 10 ]; then
  echo "❌ Only $n_gt ground-truth line pairs found in $GT_DIR."
  echo "   Run first:  python training/scripts/prepare_ground_truth.py"
  echo "   Then review the generated .gt.txt files (they must be EXACT)."
  echo "   Fine-tuning needs at least ~100 line images for good results (10 is a smoke test)."
  exit 1
fi
echo "✓ Found $n_gt ground-truth line pairs"

# ── Get tesstrain ─────────────────────────────────────────────────────────
if [ ! -d "$WORK_DIR/.git" ]; then
  echo "→ Cloning tesstrain into $WORK_DIR ..."
  git clone --depth 1 https://github.com/tesseract-ocr/tesstrain "$WORK_DIR"
fi

# ── Ground truth location convention: tesstrain uses data/<MODEL>-ground-truth
#    We symlink our GT dir into the expected location.
mkdir -p "$WORK_DIR/data"
if [ ! -e "$WORK_DIR/data/$MODEL_NAME-ground-truth" ]; then
  if command -v ln >/dev/null 2>&1 && ln -s "$GT_DIR" "$WORK_DIR/data/$MODEL_NAME-ground-truth" 2>/dev/null; then
    echo "✓ Linked $GT_DIR → tesstrain data dir"
  else
    echo "→ Symlink failed (Windows?), copying ground truth instead ..."
    mkdir -p "$WORK_DIR/data/$MODEL_NAME-ground-truth"
    cp -r "$GT_DIR"/. "$WORK_DIR/data/$MODEL_NAME-ground-truth/"
  fi
fi

# ── Start model (fine-tuning base) ────────────────────────────────────────
mkdir -p "$TRAIN_DIR/tessdata_best"
if [ ! -f "$TRAIN_DIR/tessdata_best/$START_MODEL.traineddata" ]; then
  echo "→ Downloading $START_MODEL.traineddata (tessdata_best) ..."
  if command -v curl >/dev/null 2>&1; then
    curl -sL "$TESSDATA_BEST_URL" -o "$TRAIN_DIR/tessdata_best/$START_MODEL.traineddata"
  else
    wget -q "$TESSDATA_BEST_URL" -O "$TRAIN_DIR/tessdata_best/$START_MODEL.traineddata"
  fi
fi

# ── Train ─────────────────────────────────────────────────────────────────
cd "$WORK_DIR"
echo "→ Training $MODEL_NAME (fine-tune from $START_MODEL, up to $MAX_ITERATIONS iters) ..."
echo "   (This can take 10-60 min on CPU depending on data size. Watch CER drop.)"

make training \
  MODEL_NAME="$MODEL_NAME" \
  START_MODEL="$START_MODEL" \
  TESSDATA="$TRAIN_DIR/tessdata_best" \
  OUTPUT_DIR="$OUTPUT_DIR" \
  MAX_ITERATIONS="$MAX_ITERATIONS" \
  RATIO_TRAIN="$RATIO_TRAIN" \
  FINETUNE_TYPE=Plus

# ── Copy result ───────────────────────────────────────────────────────────
BEST="$OUTPUT_DIR/tessdata_best/$MODEL_NAME.traineddata"
if [ -f "$BEST" ]; then
  mkdir -p "$TRAIN_DIR/models"
  cp "$BEST" "$FINAL_TRAINEDDATA"
  echo ""
  echo "✅ Training complete: $FINAL_TRAINEDDATA"
  echo ""
  echo "Next steps:"
  echo "  1. Copy it into the app:      cp $FINAL_TRAINEDDATA public/tessdata/labelnet.traineddata"
  echo "  2. Restart the dev server.    The app auto-detects it and prefers it."
  echo "  3. Check /api/ocr-model status to confirm."
else
  echo "⚠️  traineddata not found at $BEST — check the tesstrain log:"
  echo "   $OUTPUT_DIR/$MODEL_NAME/training.log (or ls $OUTPUT_DIR)"
  exit 1
fi
