/**
 * Lock-free double buffer for segmentation masks.
 * Two pre-allocated buffers swap on new mask arrival.
 * Reader always gets the latest complete mask without blocking.
 */
export class DoubleMaskBuffer {
  private bufferA: Uint8Array;
  private bufferB: Uint8Array;
  private readBuffer: Uint8Array;
  private writeBuffer: Uint8Array;
  private timestampA = 0;
  private timestampB = 0;
  private readTimestamp = 0;
  private hasData = false;

  constructor(private width: number, private height: number) {
    const size = width * height;
    this.bufferA = new Uint8Array(size);
    this.bufferB = new Uint8Array(size);
    this.readBuffer = this.bufferA;
    this.writeBuffer = this.bufferB;
  }

  /** Write a new mask. Called by the mask receiver. */
  write(data: Uint8Array, timestamp: number): void {
    // Copy into write buffer
    this.writeBuffer.set(data);

    // Swap: write buffer becomes read buffer
    const temp = this.readBuffer;
    this.readBuffer = this.writeBuffer;
    this.writeBuffer = temp;
    this.readTimestamp = timestamp;
    this.hasData = true;
  }

  /** Read the latest mask. Always returns immediately (never blocks). */
  read(): { data: Uint8Array; timestamp: number } | null {
    if (!this.hasData) return null;
    return { data: this.readBuffer, timestamp: this.readTimestamp };
  }

  /** Check if there is mask data available */
  get available(): boolean {
    return this.hasData;
  }

  /** Get the timestamp of the last written mask */
  get lastTimestamp(): number {
    return this.readTimestamp;
  }
}
