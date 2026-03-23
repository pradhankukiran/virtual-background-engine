import { GPUCompositor } from '../compositor/GPUCompositor';
import { DoubleMaskBuffer } from '../mask-buffer/DoubleMaskBuffer';
import { MaskInterpolator } from '../mask-buffer/MaskInterpolator';
import type { CompositorWorkerInbound, CompositorWorkerOutbound, MaskChannelMessage } from './protocol';
import type { Dimensions, VBGMode, GPUPassTimings } from '../types';

let compositor: GPUCompositor | null = null;
let maskBuffer: DoubleMaskBuffer | null = null;
let maskInterpolator: MaskInterpolator | null = null;
let paused = false;
let disposed = false;
let outputDims: Dimensions = { width: 748, height: 420 };
let maskDims: Dimensions = { width: 256, height: 256 };
let canvas: OffscreenCanvas | null = null;
let maskPort: MessagePort | null = null;
let framePort: MessagePort | null = null;
let outputPort: MessagePort | null = null;
let metricsInterval: ReturnType<typeof setInterval> | null = null;

// Performance tracking
let frameCount = 0;
let totalLatency = 0;
let lastTimings: GPUPassTimings = {
  bilateralUpsample: 0,
  temporalSmooth: 0,
  kawaseBlur: 0,
  composite: 0,
  exposureCorrect: 0,
  total: 0,
};

function send(msg: CompositorWorkerOutbound): void {
  self.postMessage(msg);
}

function initialize(cvs: OffscreenCanvas, outDims: Dimensions, mDims: Dimensions): void {
  disposed = false;
  paused = false;
  canvas = cvs;
  outputDims = outDims;
  maskDims = mDims;
  frameCount = 0;
  totalLatency = 0;

  try {
    compositor = new GPUCompositor(canvas, outputDims, maskDims);
    maskBuffer = new DoubleMaskBuffer(maskDims.width, maskDims.height);
    maskInterpolator = new MaskInterpolator(maskDims.width, maskDims.height);

    // Start metrics reporting
    if (metricsInterval) {
      clearInterval(metricsInterval);
    }
    metricsInterval = setInterval(() => {
      if (frameCount > 0) {
        send({
          type: 'metrics',
          fps: frameCount,
          passTimings: lastTimings,
          latencyMs: Math.round((totalLatency / frameCount) * 10) / 10,
        });
        frameCount = 0;
        totalLatency = 0;
      }
    }, 1000);

    send({ type: 'ready' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ type: 'error', code: 'WEBGL_NOT_SUPPORTED', message, fatal: true });
  }
}

function processFrame(frame: ImageBitmap | VideoFrame, timestamp: number): void {
  if (!compositor || paused || disposed) {
    closeFrame(frame);
    send({ type: 'frame-rendered', timestamp });
    return;
  }

  const start = performance.now();
  let frameConsumed = false;

  try {
    // Upload latest mask if available
    const latestMask = maskBuffer?.read();
    if (latestMask) {
      maskInterpolator?.push(latestMask.data, latestMask.timestamp);
    }

    // Get interpolated mask for this frame's timestamp
    if (maskInterpolator) {
      const interpolated = maskInterpolator.interpolate(timestamp);
      compositor.uploadMask(interpolated);
    }

    // Run the 5-pass shader pipeline
    lastTimings = compositor.render(frame);

    // Send rendered output frame back to main thread
    if (canvas && outputPort) {
      try {
        const outputBitmap = canvas.transferToImageBitmap();
        outputPort.postMessage(
          { type: 'output-frame', frame: outputBitmap, timestamp },
          [outputBitmap],
        );
      } catch (_) {
        // transferToImageBitmap can fail if context is lost
      }
    }

    const latency = performance.now() - start;
    totalLatency += latency;
    frameCount++;
    frameConsumed = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ type: 'error', code: 'RENDER_FAILED', message, fatal: false });
    frameConsumed = true;
  } finally {
    closeFrame(frame);
    if (frameConsumed) {
      send({ type: 'frame-rendered', timestamp });
    }
  }
}

function closeFrame(frame: ImageBitmap | VideoFrame): void {
  if ('close' in frame) {
    (frame as ImageBitmap | VideoFrame).close();
  }
}

function dispose(): void {
  disposed = true;
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
  compositor?.dispose();
  compositor = null;
  maskBuffer = null;
  maskInterpolator = null;
  maskPort?.close();
  maskPort = null;
  framePort?.close();
  framePort = null;
  outputPort?.close();
  outputPort = null;
}

// ===== Main Message Handler =====
self.onmessage = (e: MessageEvent<CompositorWorkerInbound>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init':
      initialize(msg.canvas, msg.outputDims, msg.maskDims);
      break;

    case 'configure':
      compositor?.configure(msg.mode, msg.blurStrength);
      break;

    case 'set-bg-image':
      compositor?.setBgImage(msg.bitmap);
      break;

    case 'pause':
      paused = true;
      break;

    case 'resume':
      paused = false;
      break;

    case 'dispose':
      dispose();
      break;
  }
};

// Accept MessageChannel ports
self.addEventListener('message', (e: MessageEvent) => {
  if (e.data?.type === 'mask-port' && e.ports.length > 0) {
    maskPort = e.ports[0];
    maskPort.onmessage = (ev: MessageEvent<MaskChannelMessage>) => {
      if (ev.data.type === 'mask' && maskBuffer) {
        maskBuffer.write(ev.data.mask, ev.data.timestamp);
      }
    };
    console.log('[CompositorWorker] Mask port connected');
  }

  if (e.data?.type === 'frame-port' && e.ports.length > 0) {
    framePort = e.ports[0];
    framePort.onmessage = (ev: MessageEvent) => {
      if (ev.data.type === 'frame') {
        processFrame(ev.data.frame, ev.data.timestamp);
      }
    };
    console.log('[CompositorWorker] Frame port connected');
  }

  if (e.data?.type === 'output-port' && e.ports.length > 0) {
    outputPort = e.ports[0];
    console.log('[CompositorWorker] Output port connected');
  }
});
