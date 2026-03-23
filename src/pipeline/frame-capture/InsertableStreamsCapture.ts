import type { FrameCapture, Dimensions } from '../types';

/**
 * Chrome/Edge frame capture using Insertable Streams (MSTPR).
 * Resizes frames to output dimensions before transfer (fixes C3).
 * Accepts external MessagePorts — no internal channels (fixes C2).
 */
export class InsertableStreamsCapture implements FrameCapture {
  private reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  private running = false;
  private frameCount = 0;
  private segEveryN: number;
  private compositorFrameInFlight = false;

  constructor(
    private outputDims: Dimensions,
    private segFps: number = 15,
  ) {
    this.segEveryN = Math.round(30 / segFps);
  }

  start(track: MediaStreamTrack, compositorPort: MessagePort, segPort: MessagePort): void {
    if (this.running) return;
    this.running = true;
    this.frameCount = 0;
    this.compositorFrameInFlight = false;

    const processor = new MediaStreamTrackProcessor({ track });
    this.reader = processor.readable.getReader();
    this.pumpFrames(compositorPort, segPort);
  }

  private async pumpFrames(compositorPort: MessagePort, segPort: MessagePort): Promise<void> {
    if (!this.reader) return;

    try {
      while (this.running) {
        const { value: frame, done } = await this.reader.read();
        if (done || !frame) break;

        const timestamp = frame.timestamp ?? performance.now() * 1000;
        const sendToSeg = this.frameCount % this.segEveryN === 0;
        const sendToCompositor = !this.compositorFrameInFlight;

        try {
          let compositorBitmap: ImageBitmap | null = null;

          if (sendToCompositor) {
            // Keep at most one compositor frame in flight to avoid seconds of backlog.
            compositorBitmap = await createImageBitmap(frame, {
              resizeWidth: this.outputDims.width,
              resizeHeight: this.outputDims.height,
            });
          }

          if (sendToSeg) {
            const segBitmap = await createImageBitmap(frame, {
              resizeWidth: 256,
              resizeHeight: 256,
            });
            segPort.postMessage(
              { type: 'frame', frame: segBitmap, timestamp },
              [segBitmap],
            );
          }

          if (compositorBitmap) {
            compositorPort.postMessage(
              { type: 'frame', frame: compositorBitmap, timestamp },
              [compositorBitmap],
            );
            this.compositorFrameInFlight = true;
          }
        } finally {
          frame.close();
        }

        this.frameCount++;
      }
    } catch (e) {
      if (this.running) {
        console.error('[InsertableStreams] Frame pump error:', e);
      }
    }
  }

  stop(): void {
    this.running = false;
    this.compositorFrameInFlight = false;
    this.reader?.cancel().catch(() => {});
    this.reader = null;
  }

  setSegFps(segFps: number): void {
    this.segFps = segFps;
    this.segEveryN = Math.max(1, Math.round(30 / segFps));
  }

  notifyCompositorFrameRendered(): void {
    this.compositorFrameInFlight = false;
  }
}
