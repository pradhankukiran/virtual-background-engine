#!/usr/bin/env bash
set -euo pipefail

ROOT="$(dirname "$0")/.."
MODEL_DIR="$ROOT/public/models"
WASM_DIR="$ROOT/public/wasm"
mkdir -p "$MODEL_DIR" "$WASM_DIR"

# MediaPipe selfie segmenter landscape (optimized for 16:9 webcam feeds)
LANDSCAPE_URL="https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite"
LANDSCAPE_FILE="$MODEL_DIR/selfie_segmenter_landscape.tflite"

if [ -f "$LANDSCAPE_FILE" ]; then
  echo "Model already exists: $LANDSCAPE_FILE"
else
  echo "Downloading selfie segmenter landscape model..."
  curl -sL -o "$LANDSCAPE_FILE" "$LANDSCAPE_URL"
  echo "Downloaded model ($(wc -c < "$LANDSCAPE_FILE") bytes)"
fi

# MediaPipe Vision WASM files (required by @mediapipe/tasks-vision)
MEDIAPIPE_CDN="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.33/wasm"
WASM_FILES=(
  vision_wasm_internal.js
  vision_wasm_internal.wasm
  vision_wasm_module_internal.js
  vision_wasm_module_internal.wasm
  vision_wasm_module_nosimd_internal.js
  vision_wasm_module_nosimd_internal.wasm
  vision_wasm_nosimd_internal.js
  vision_wasm_nosimd_internal.wasm
)

for f in "${WASM_FILES[@]}"; do
  if [ -f "$WASM_DIR/$f" ]; then
    echo "WASM file exists: $f"
  else
    echo "Downloading $f..."
    curl -sL -o "$WASM_DIR/$f" "$MEDIAPIPE_CDN/$f"
  fi
done

echo "All assets ready."
