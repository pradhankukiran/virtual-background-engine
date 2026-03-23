import type { FrameCapture, Dimensions } from '../types';

/**
 * Firefox/Safari fallback using requestVideoFrameCallback + createImageBitmap.
 * Accepts external MessagePorts — no internal channels (fixes C2).
 * Fixes M6: ImageBitmap leak on error.
 */
export class RvfcFallbackCapture implements FrameCapture {
  private video: HTMLVideoElement | null = null;
  private callbackHandle: number | null = null;
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

    this.video = document.createElement('video');
    this.video.srcObject = new MediaStream([track]);
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.style.display = 'none';
    document.body.appendChild(this.video);
    this.video.play();

    this.scheduleFrame(compositorPort, segPort);
  }

  private scheduleFrame(compositorPort: MessagePort, segPort: MessagePort): void {
    if (!this.video || !this.running) return;

    this.callbackHandle = this.video.requestVideoFrameCallback(
      async (_now, metadata) => {
        if (!this.running || !this.video) return;

        const timestamp = metadata.mediaTime * 1_000_000;
        let compositorBitmap: ImageBitmap | null = null;
        let segBitmap: ImageBitmap | null = null;

        try {
          const sendToSeg = this.frameCount % this.segEveryN === 0;
          const sendToCompositor = !this.compositorFrameInFlight;

          if (sendToCompositor) {
            compositorBitmap = await createImageBitmap(this.video!, {
              resizeWidth: this.outputDims.width,
              resizeHeight: this.outputDims.height,
            });
          }

          if (sendToSeg) {
            segBitmap = await createImageBitmap(this.video!, {
              resizeWidth: 256,
              resizeHeight: 256,
            });
            segPort.postMessage(
              { type: 'frame', frame: segBitmap, timestamp },
              [segBitmap],
            );
            segBitmap = null; // transferred
          }

          if (compositorBitmap) {
            compositorPort.postMessage(
              { type: 'frame', frame: compositorBitmap, timestamp },
              [compositorBitmap],
            );
            compositorBitmap = null; // transferred
            this.compositorFrameInFlight = true;
          }

          this.frameCount++;
        } catch (e) {
          console.error('[RvfcFallback] Frame capture error:', e);
          compositorBitmap?.close();
          segBitmap?.close();
        }

        this.scheduleFrame(compositorPort, segPort);
      },
    );
  }

  stop(): void {
    this.running = false;
    this.compositorFrameInFlight = false;
    if (this.callbackHandle !== null && this.video) {
      this.video.cancelVideoFrameCallback(this.callbackHandle);
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }
  }

  setSegFps(segFps: number): void {
    this.segFps = segFps;
    this.segEveryN = Math.max(1, Math.round(30 / segFps));
  }

  notifyCompositorFrameRendered(): void {
    this.compositorFrameInFlight = false;
  }
}
