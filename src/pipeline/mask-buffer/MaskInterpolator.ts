/**
 * Temporal interpolation between segmentation masks.
 * Smoothly blends between the previous and current mask
 * based on relative timestamps.
 */
export class MaskInterpolator {
  private prevMask: Uint8Array | null = null;
  private currentMask: Uint8Array | null = null;
  private prevTimestamp = 0;
  private currentTimestamp = 0;
  private interpolated: Uint8Array;

  constructor(private width: number, private height: number) {
    this.interpolated = new Uint8Array(width * height);
  }

  /** Push a new mask frame */
  push(data: Uint8Array, timestamp: number): void {
    this.prevMask = this.currentMask;
    this.prevTimestamp = this.currentTimestamp;
    this.currentMask = data;
    this.currentTimestamp = timestamp;
  }

  /** Interpolate mask for a given frame timestamp */
  interpolate(frameTimestamp: number): Uint8Array {
    // No masks yet — return zeros
    if (!this.currentMask) return this.interpolated;

    // Only one mask — return as-is
    if (!this.prevMask) {
      this.interpolated.set(this.currentMask);
      return this.interpolated;
    }

    // Compute interpolation factor
    const maskInterval = this.currentTimestamp - this.prevTimestamp;
    if (maskInterval <= 0) {
      this.interpolated.set(this.currentMask);
      return this.interpolated;
    }

    const t = Math.min(1, Math.max(0,
      (frameTimestamp - this.prevTimestamp) / maskInterval,
    ));

    // Lerp between previous and current mask
    const len = this.interpolated.length;
    const prev = this.prevMask;
    const curr = this.currentMask;

    for (let i = 0; i < len; i++) {
      this.interpolated[i] = prev[i] + (curr[i] - prev[i]) * t;
    }

    return this.interpolated;
  }
}
