#!/usr/bin/env bash
set -euo pipefail

MODEL_DIR="$(dirname "$0")/../public/models"
mkdir -p "$MODEL_DIR"

# MODNet ONNX model (primary — portrait matting with soft hair edges)
MODNET_URL="https://huggingface.co/gradio/Modnet/resolve/main/modnet.onnx"
MODNET_FILE="$MODEL_DIR/modnet.onnx"

if [ -f "$MODNET_FILE" ]; then
  echo "MODNet model already exists: $MODNET_FILE"
else
  echo "Downloading MODNet ONNX model..."
  curl -L -o "$MODNET_FILE" "$MODNET_URL"
  echo "Downloaded to $MODNET_FILE ($(wc -c < "$MODNET_FILE") bytes)"
fi

# MediaPipe selfie segmenter landscape (optimized for 16:9 webcam feeds)
LANDSCAPE_URL="https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite"
LANDSCAPE_FILE="$MODEL_DIR/selfie_segmenter_landscape.tflite"

if [ -f "$LANDSCAPE_FILE" ]; then
  echo "Landscape model already exists: $LANDSCAPE_FILE"
else
  echo "Downloading selfie segmenter landscape model..."
  curl -L -o "$LANDSCAPE_FILE" "$LANDSCAPE_URL"
  echo "Downloaded to $LANDSCAPE_FILE ($(wc -c < "$LANDSCAPE_FILE") bytes)"
fi
