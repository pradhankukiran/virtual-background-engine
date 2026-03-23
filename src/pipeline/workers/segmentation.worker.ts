import type { SegWorkerInbound, SegWorkerOutbound, MaskChannelMessage } from './protocol';

// MediaPipe WASM bundle expects self.import and self.custom_dbg
const importModule = new Function('url', 'return import(url);') as (url: string) => Promise<any>;
const workerGlobal = self as typeof self & {
  import?: (url: string) => Promise<void>;
  ModuleFactory?: unknown;
  custom_dbg?: (...args: unknown[]) => void;
};
if (typeof workerGlobal.import !== 'function') {
  workerGlobal.import = async (url: string): Promise<void> => {
    const module = await importModule(url);
    workerGlobal.ModuleFactory = module.default ?? module.ModuleFactory;
  };
}
if (typeof workerGlobal.custom_dbg !== 'function') {
  workerGlobal.custom_dbg = (...args: unknown[]): void => {
    console.warn('[SegWorker][MediaPipe]', ...args);
  };
}

let segmenter: any = null;
let maskPort: MessagePort | null = null;
let targetSegFps = 15;
let lastSegTime = 0;
let frameCount = 0;
let totalLatency = 0;
let totalMaskCoverage = 0;
let metricsInterval: ReturnType<typeof setInterval> | null = null;
let firstFrameTimestamp: number | null = null;

const MEDIAPIPE_BUNDLE_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.33/vision_bundle.mjs';
const SEGMENTATION_DELEGATE = 'GPU';

function send(msg: SegWorkerOutbound): void {
  self.postMessage(msg);
}

async function initialize(modelUrl: string, maskWidth: number, maskHeight: number): Promise<void> {
  try {
    send({ type: 'model-progress', progress: 0.1, stage: 'Loading MediaPipe...' });

    const { ImageSegmenter, FilesetResolver } = await import(
      /* @vite-ignore */ MEDIAPIPE_BUNDLE_URL
    );

    const vision = await FilesetResolver.forVisionTasks('/wasm', true);
    send({ type: 'model-progress', progress: 0.3, stage: 'Loading model...' });

    segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelUrl,
        delegate: SEGMENTATION_DELEGATE,
      },
      runningMode: 'VIDEO',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });

    send({ type: 'model-progress', progress: 0.8, stage: 'Warmup...' });

    const warmupCanvas = new OffscreenCanvas(maskWidth, maskHeight);
    const warmupCtx = warmupCanvas.getContext('2d')!;
    warmupCtx.fillStyle = '#808080';
    warmupCtx.fillRect(0, 0, maskWidth, maskHeight);
    const warmupBitmap = warmupCanvas.transferToImageBitmap();
    segmenter.segmentForVideo(warmupBitmap, 0);
    warmupBitmap.close();

    send({ type: 'model-progress', progress: 1.0 });
    console.log(`[SegWorker] Ready (MediaPipe ${SEGMENTATION_DELEGATE})`);

    metricsInterval = setInterval(() => {
      send({
        type: 'metrics',
        segFps: frameCount,
        latencyMs: frameCount > 0 ? Math.round((totalLatency / frameCount) * 10) / 10 : 0,
        maskCoverage: frameCount > 0 ? Math.round((totalMaskCoverage / frameCount) * 1000) / 1000 : 0,
      });
      frameCount = 0;
      totalLatency = 0;
      totalMaskCoverage = 0;
    }, 1000);

    send({ type: 'ready' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ type: 'error', code: 'MODEL_LOAD_FAILED', message, fatal: true });
  }
}

function processFrame(frame: ImageBitmap | VideoFrame, timestamp: number): void {
  if (!segmenter) {
    closeFrame(frame);
    return;
  }

  const now = performance.now();
  if (now - lastSegTime < (1000 / targetSegFps) * 0.8) {
    closeFrame(frame);
    return;
  }

  const start = performance.now();

  try {
    if (firstFrameTimestamp === null) firstFrameTimestamp = timestamp;
    const normalizedTimestampMs = Math.max(1, ((timestamp - firstFrameTimestamp) / 1000) + 1);

    const result = segmenter.segmentForVideo(frame, normalizedTimestampMs);
    try {
      if (result.confidenceMasks && result.confidenceMasks.length > 0) {
        const maskIdx = result.confidenceMasks.length - 1;
        const personMask = result.confidenceMasks[maskIdx];
        const maskData = personMask.getAsFloat32Array();
        const width = personMask.width;
        const height = personMask.height;

        const quantized = new Uint8Array(maskData.length);
        let foregroundPixels = 0;
        for (let i = 0; i < maskData.length; i++) {
          const value = Math.round(maskData[i] * 255);
          quantized[i] = value;
          if (value >= 128) foregroundPixels++;
        }

        if (maskPort) {
          maskPort.postMessage(
            { type: 'mask', mask: quantized, width, height, timestamp } as MaskChannelMessage,
            [quantized.buffer],
          );
        }

        totalLatency += performance.now() - start;
        frameCount++;
        totalMaskCoverage += foregroundPixels / maskData.length;
        lastSegTime = now;
      }
    } finally {
      result.close();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ type: 'error', code: 'INFERENCE_FAILED', message, fatal: false });
  } finally {
    closeFrame(frame);
  }
}

function closeFrame(frame: ImageBitmap | VideoFrame): void {
  if ('close' in frame) frame.close();
}

function dispose(): void {
  if (metricsInterval) { clearInterval(metricsInterval); metricsInterval = null; }
  segmenter?.close();
  segmenter = null;
  firstFrameTimestamp = null;
  maskPort?.close();
  maskPort = null;
}

self.onmessage = (e: MessageEvent<SegWorkerInbound>) => {
  switch (e.data.type) {
    case 'init':
      initialize(e.data.modelUrl, e.data.maskDims.width, e.data.maskDims.height);
      break;
    case 'configure':
      targetSegFps = e.data.segFps;
      break;
    case 'dispose':
      dispose();
      break;
  }
};

self.addEventListener('message', (e: MessageEvent) => {
  if (e.data?.type === 'mask-port' && e.ports.length > 0) {
    maskPort = e.ports[0];
  }
  if (e.data?.type === 'frame-port' && e.ports.length > 0) {
    e.ports[0].onmessage = (ev: MessageEvent) => {
      if (ev.data.type === 'frame') processFrame(ev.data.frame, ev.data.timestamp);
    };
  }
});
