/**
 * Compute average foreground luminance from masked region.
 * Runs on CPU in compositor worker. Uses subsampled reads for speed.
 */
export function computeForegroundLuminance(
  frameData: Uint8ClampedArray,
  maskData: Uint8Array,
  width: number,
  height: number,
  stride: number = 4,
): number {
  let totalLum = 0;
  let totalWeight = 0;
  const step = 4; // Subsample every 4th pixel in each dimension

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const maskIdx = y * width + x;
      const weight = maskData[maskIdx] / 255;

      if (weight > 0.5) {
        const pixIdx = (y * width + x) * stride;
        const r = frameData[pixIdx];
        const g = frameData[pixIdx + 1];
        const b = frameData[pixIdx + 2];
        // BT.709 luminance
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        totalLum += lum * weight;
        totalWeight += weight;
      }
    }
  }

  return totalWeight > 0 ? totalLum / totalWeight : 0.5;
}
