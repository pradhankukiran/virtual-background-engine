import { ref, watch, onUnmounted, type Ref } from 'vue';
import type {
  VBGMode,
  VBGConfig,
  PipelineState,
  PipelineMetrics,
  PipelineError,
  FrameCapture,
} from '../pipeline/types';
import { DEFAULT_CONFIG } from '../pipeline/types';
import type {
  SegWorkerOutbound,
  CompositorWorkerOutbound,
} from '../pipeline/workers/protocol';
import { createFrameCapture } from '../pipeline/frame-capture/createFrameCapture';
import { checkMinimumRequirements } from '../utils/feature-detect';
import type { SegBackend } from '../pipeline/types';
import { serializeError, useDiagnosticsLog } from './useDiagnosticsLog';

export interface UseVirtualBackgroundReturn {
  // State
  state: Ref<PipelineState>;
  error: Ref<PipelineError | null>;
  errorLogId: Ref<string | null>;
  metrics: Ref<PipelineMetrics>;
  modelProgress: Ref<number>;
  modelStage: Ref<string>;

  // Config
  mode: Ref<VBGMode>;
  blurStrength: Ref<number>;
  enabled: Ref<boolean>;

  // Actions
  start: (inputTrack: MediaStreamTrack) => Promise<void>;
  stop: () => void;
  setMode: (mode: VBGMode) => void;
  setBlurStrength: (strength: number) => void;
  setBgImage: (file: File) => Promise<void>;

  // Output
  outputStream: Ref<MediaStream | null>;
  outputTrack: Ref<MediaStreamTrack | null>;
}

export function useVirtualBackground(
  config: Partial<VBGConfig> = {},
): UseVirtualBackgroundReturn {
  const fullConfig: VBGConfig = { ...DEFAULT_CONFIG, ...config };

  // Reactive state
  const state = ref<PipelineState>('idle');
  const error = ref<PipelineError | null>(null);
  const errorLogId = ref<string | null>(null);
  const modelProgress = ref(0);
  const modelStage = ref('');
  const mode = ref<VBGMode>(fullConfig.mode);
  const blurStrength = ref(fullConfig.blurStrength);
  const enabled = ref(false);
  const outputStream = ref<MediaStream | null>(null);
  const outputTrack = ref<MediaStreamTrack | null>(null);

  const metrics = ref<PipelineMetrics>({
    captureFps: 0,
    segmentationFps: 0,
    compositorFps: 0,
    segLatencyMs: 0,
    compositorLatencyMs: 0,
    maskCoverage: 0,
    gpuPassTimings: {
      bilateralUpsample: 0,
      temporalSmooth: 0,
      kawaseBlur: 0,
      composite: 0,
      exposureCorrect: 0,
      total: 0,
    },
    heapUsedMB: 0,
    droppedFrames: 0,
  });

  // Internal refs
  let segWorker: Worker | null = null;
  let compositorWorker: Worker | null = null;
  let frameCapture: FrameCapture | null = null;
  let outputCanvas: OffscreenCanvas | null = null;
  let visibilityHandler: (() => void) | null = null;

  // Output path refs
  let outputGenerator: MediaStreamTrackGenerator | null = null;
  let outputWriter: WritableStreamDefaultWriter<VideoFrame> | null = null;
  let outputCanvasEl: HTMLCanvasElement | null = null;
  let outputCtx: CanvasRenderingContext2D | null = null;
  let suspiciousMaskCoverageCount = 0;
  const { logInfo, logWarn, logError } = useDiagnosticsLog();

  function clearPipelineError(): void {
    error.value = null;
    errorLogId.value = null;
  }

  function setPipelineError(
    source: string,
    nextError: PipelineError,
    details?: unknown,
  ): void {
    error.value = nextError;
    errorLogId.value = (nextError.fatal ? logError : logWarn)({
      source,
      code: nextError.code,
      message: nextError.message,
      details: {
        fatal: nextError.fatal,
        state: state.value,
        ...((details as Record<string, unknown> | undefined) ?? {}),
      },
    }).id;
  }

  function sendCompositorConfig(): void {
    compositorWorker?.postMessage({
      type: 'configure',
      mode: mode.value,
      blurStrength: blurStrength.value,
    });
  }

  async function start(inputTrack: MediaStreamTrack): Promise<void> {
    if (state.value !== 'idle') {
      console.warn('[VBG] Pipeline already started, ignoring');
      logWarn({
        source: 'pipeline',
        code: 'PIPELINE_ALREADY_STARTED',
        message: 'Start requested while pipeline was not idle',
        details: {
          state: state.value,
        },
      });
      return;
    }

    // Check browser requirements
    const { ok, missing } = checkMinimumRequirements();
    if (!ok) {
      setPipelineError('pipeline', {
        code: 'WEBGL_NOT_SUPPORTED',
        message: `Missing: ${missing.join(', ')}`,
        fatal: true,
      }, { missing });
      state.value = 'error';
      return;
    }

    try {
      clearPipelineError();
      state.value = 'loading-model';
      logInfo({
        source: 'pipeline',
        message: 'Starting virtual background pipeline',
        details: {
          config: fullConfig,
          inputTrackSettings: inputTrack.getSettings(),
        },
      });

      // Create workers (both ES modules — Vite dev requires it)
      segWorker = new Worker(
        new URL('../pipeline/workers/segmentation.worker.ts', import.meta.url),
        { type: 'module' },
      );
      compositorWorker = new Worker(
        new URL('../pipeline/workers/compositor.worker.ts', import.meta.url),
        { type: 'module' },
      );

      segWorker.onerror = (e: ErrorEvent) => {
        e.preventDefault();
        setPipelineError('segmentation-worker', {
          code: 'WORKER_CRASHED',
          message: `Segmentation worker error: ${e.message}`,
          fatal: true,
        }, {
          filename: e.filename,
          lineno: e.lineno,
          colno: e.colno,
          eventError: serializeError(e.error),
        });
        state.value = 'error';
      };
      compositorWorker.onerror = (e: ErrorEvent) => {
        e.preventDefault();
        setPipelineError('compositor-worker', {
          code: 'WORKER_CRASHED',
          message: `Compositor worker error: ${e.message}`,
          fatal: true,
        }, {
          filename: e.filename,
          lineno: e.lineno,
          colno: e.colno,
          eventError: serializeError(e.error),
        });
        state.value = 'error';
      };

      // Set up worker-to-worker MessageChannel for mask delivery
      const maskChannel = new MessageChannel();
      segWorker.postMessage({ type: 'mask-port' }, [maskChannel.port1]);
      compositorWorker.postMessage({ type: 'mask-port' }, [maskChannel.port2]);

      // Set up compositor output canvas
      outputCanvas = new OffscreenCanvas(
        fullConfig.outputDims.width,
        fullConfig.outputDims.height,
      );

      // Initialize compositor worker
      const compositorReady = new Promise<void>((resolve, reject) => {
        const handler = (e: MessageEvent<CompositorWorkerOutbound>) => {
          if (e.data.type === 'ready') {
            compositorWorker!.removeEventListener('message', handler);
            resolve();
          } else if (e.data.type === 'error' && e.data.fatal) {
            compositorWorker!.removeEventListener('message', handler);
            reject(new Error(e.data.message));
          }
        };
        compositorWorker!.addEventListener('message', handler);
      });

      compositorWorker.postMessage(
        {
          type: 'init',
          canvas: outputCanvas,
          outputDims: fullConfig.outputDims,
          maskDims: fullConfig.maskDims,
        },
        [outputCanvas],
      );

      await compositorReady;

      // Configure compositor
      sendCompositorConfig();

      // Initialize segmentation worker
      const segReady = new Promise<void>((resolve, reject) => {
        const handler = (e: MessageEvent<SegWorkerOutbound>) => {
          if (e.data.type === 'ready') {
            segWorker!.removeEventListener('message', handler);
            resolve();
          } else if (e.data.type === 'error' && e.data.fatal) {
            segWorker!.removeEventListener('message', handler);
            reject(new Error(e.data.message));
          } else if (e.data.type === 'model-progress') {
            modelProgress.value = e.data.progress;
            if (e.data.stage) modelStage.value = e.data.stage;
          }
        };
        segWorker!.addEventListener('message', handler);
      });

      // Use WebGL-accelerated ONNX Runtime (works everywhere WebGL2 is available)
      const segBackend: SegBackend = fullConfig.segBackend;
      logInfo({
        source: 'pipeline',
        message: `Segmentation backend: ${segBackend}`,
      });

      segWorker.postMessage({
        type: 'init',
        backend: segBackend,
        modelUrl: fullConfig.modelUrl,
        maskDims: fullConfig.maskDims,
      });

      state.value = 'warmup';
      await segReady;

      // Set up ongoing message handlers
      setupWorkerHandlers();
      segWorker.postMessage({
        type: 'configure',
        segFps: fullConfig.segFps,
      });

      // Create frame delivery channels (capture -> workers, direct, no relay)
      const compFrameChannel = new MessageChannel();
      const segFrameChannel = new MessageChannel();

      // Send receive-end ports to workers
      compositorWorker.postMessage({ type: 'frame-port' }, [compFrameChannel.port2]);
      segWorker.postMessage({ type: 'frame-port' }, [segFrameChannel.port2]);

      // Create output channel (compositor worker -> main thread)
      const outputChannel = new MessageChannel();
      compositorWorker.postMessage({ type: 'output-port' }, [outputChannel.port2]);

      // Set up output path: MSTG (Chrome zero-copy) or canvas fallback
      if (typeof MediaStreamTrackGenerator !== 'undefined') {
        // Chrome: zero-copy path via MediaStreamTrackGenerator
        outputGenerator = new MediaStreamTrackGenerator({ kind: 'video' });
        outputWriter = outputGenerator.writable.getWriter();
        outputStream.value = new MediaStream([outputGenerator]);
        outputTrack.value = outputGenerator;
        logInfo({
          source: 'pipeline',
          message: 'Using MediaStreamTrackGenerator output path',
        });
      } else {
        // Fallback: draw to canvas + captureStream
        outputCanvasEl = document.createElement('canvas');
        outputCanvasEl.width = fullConfig.outputDims.width;
        outputCanvasEl.height = fullConfig.outputDims.height;
        outputCanvasEl.style.display = 'none';
        document.body.appendChild(outputCanvasEl);
        outputCtx = outputCanvasEl.getContext('2d');
        const outStream = outputCanvasEl.captureStream(30);
        outputStream.value = outStream;
        outputTrack.value = outStream.getVideoTracks()[0] ?? null;
        logWarn({
          source: 'pipeline',
          code: 'OUTPUT_FALLBACK',
          message: 'Using canvas captureStream fallback output path',
        });
      }

      // Listen for rendered frames from compositor worker
      outputChannel.port1.onmessage = async (e: MessageEvent) => {
        if (e.data.type === 'output-frame') {
          const bitmap = e.data.frame as ImageBitmap;
          try {
            if (outputWriter) {
              // Chrome: create VideoFrame and write to generator
              const vf = new VideoFrame(bitmap, { timestamp: e.data.timestamp });
              bitmap.close();
              await outputWriter.write(vf);
              vf.close();
            } else if (outputCtx) {
              // Fallback: draw to canvas
              outputCtx.drawImage(bitmap, 0, 0);
              bitmap.close();
            } else {
              bitmap.close();
            }
          } catch {
            bitmap.close();
          }
        }
      };

      // Start frame capture with worker-bound ports (no relay!)
      frameCapture = createFrameCapture(fullConfig.outputDims, fullConfig.segFps);
      frameCapture.start(inputTrack, compFrameChannel.port1, segFrameChannel.port1);

      // Tab visibility handling
      visibilityHandler = () => {
        if (document.hidden) {
          compositorWorker?.postMessage({ type: 'pause' });
          state.value = 'paused';
          logInfo({
            source: 'pipeline',
            message: 'Pipeline paused because the tab is hidden',
          });
        } else {
          compositorWorker?.postMessage({ type: 'resume' });
          state.value = 'running';
          logInfo({
            source: 'pipeline',
            message: 'Pipeline resumed after tab became visible',
          });
        }
      };
      document.addEventListener('visibilitychange', visibilityHandler);

      state.value = 'running';
      enabled.value = true;
      modelProgress.value = 1;
      logInfo({
        source: 'pipeline',
        message: 'Virtual background pipeline is running',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPipelineError('pipeline', {
        code: 'UNKNOWN',
        message: msg,
        fatal: true,
      }, {
        rawError: serializeError(err),
      });
      state.value = 'error';
      stop();
    }
  }

  function setupWorkerHandlers(): void {
    if (segWorker) {
      segWorker.onmessage = (e: MessageEvent<SegWorkerOutbound>) => {
        switch (e.data.type) {
          case 'metrics':
            metrics.value = {
              ...metrics.value,
              segmentationFps: e.data.segFps,
              segLatencyMs: e.data.latencyMs,
              maskCoverage: e.data.maskCoverage,
            };
            if (e.data.maskCoverage >= 0.98 || e.data.maskCoverage <= 0.02) {
              suspiciousMaskCoverageCount += 1;
              if (suspiciousMaskCoverageCount === 2) {
                logWarn({
                  source: 'segmentation-worker',
                  code: 'MASK_COVERAGE_SUSPICIOUS',
                  message: 'Segmentation mask coverage is pinned near an extreme',
                  details: {
                    maskCoverage: e.data.maskCoverage,
                    segFps: e.data.segFps,
                    segLatencyMs: e.data.latencyMs,
                  },
                });
              }
            } else {
              suspiciousMaskCoverageCount = 0;
            }
            break;
          case 'error':
            if (e.data.fatal) {
              setPipelineError('segmentation-worker', {
                code: e.data.code as PipelineError['code'],
                message: e.data.message,
                fatal: true,
              });
              state.value = 'error';
            } else {
              logWarn({
                source: 'segmentation-worker',
                code: e.data.code,
                message: e.data.message,
              });
            }
            break;
        }
      };
    }

    if (compositorWorker) {
      compositorWorker.onmessage = (e: MessageEvent<CompositorWorkerOutbound>) => {
        switch (e.data.type) {
          case 'metrics':
            metrics.value = {
              ...metrics.value,
              compositorFps: e.data.fps,
              compositorLatencyMs: e.data.latencyMs,
              gpuPassTimings: e.data.passTimings,
            };
            break;
          case 'frame-rendered':
            frameCapture?.notifyCompositorFrameRendered?.();
            break;
          case 'context-lost':
            setPipelineError('compositor-worker', {
              code: 'CONTEXT_LOST',
              message: 'WebGL context lost',
              fatal: false,
            });
            break;
          case 'context-restored':
            clearPipelineError();
            logInfo({
              source: 'compositor-worker',
              message: 'WebGL context restored',
            });
            break;
          case 'error':
            if (e.data.fatal) {
              setPipelineError('compositor-worker', {
                code: e.data.code as PipelineError['code'],
                message: e.data.message,
                fatal: true,
              });
              state.value = 'error';
            } else {
              logWarn({
                source: 'compositor-worker',
                code: e.data.code,
                message: e.data.message,
              });
            }
            break;
        }
      };
    }
  }

  function stop(): void {
    const preserveError = state.value === 'error' && error.value !== null;

    if (state.value !== 'idle' || enabled.value) {
      logInfo({
        source: 'pipeline',
        message: 'Stopping virtual background pipeline',
        details: {
          state: state.value,
          enabled: enabled.value,
        },
      });
    }

    frameCapture?.stop();
    frameCapture = null;

    segWorker?.postMessage({ type: 'dispose' });
    segWorker?.terminate();
    segWorker = null;

    compositorWorker?.postMessage({ type: 'dispose' });
    compositorWorker?.terminate();
    compositorWorker = null;

    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }

    // Clean up output path
    outputWriter?.close().catch(() => {});
    outputWriter = null;
    outputGenerator = null;
    if (outputCanvasEl) {
      outputCanvasEl.remove();
      outputCanvasEl = null;
    }
    outputCtx = null;
    outputCanvas = null;

    outputStream.value = null;
    outputTrack.value = null;
    enabled.value = false;
    state.value = 'idle';
    suspiciousMaskCoverageCount = 0;
    if (!preserveError) {
      clearPipelineError();
    }
    modelProgress.value = 0;
  }

  function setMode(newMode: VBGMode): void {
    const previousMode = mode.value;
    mode.value = newMode;
    if (previousMode !== newMode) {
      logInfo({
        source: 'pipeline',
        message: 'Virtual background mode changed',
        details: {
          previousMode,
          nextMode: newMode,
        },
      });
    }
  }

  function setBlurStrength(strength: number): void {
    const previousStrength = blurStrength.value;
    blurStrength.value = strength;
    if (previousStrength !== strength) {
      logInfo({
        source: 'pipeline',
        message: 'Blur strength changed',
        details: {
          previousStrength,
          nextStrength: strength,
        },
      });
    }
  }

  async function setBgImage(file: File): Promise<void> {
    try {
      const bitmap = await createImageBitmap(file);
      const imageDetails = {
        name: file.name,
        size: file.size,
        type: file.type,
        width: bitmap.width,
        height: bitmap.height,
      };
      compositorWorker?.postMessage(
        { type: 'set-bg-image', bitmap },
        [bitmap],
      );
      logInfo({
        source: 'pipeline',
        message: 'Background image uploaded',
        details: imageDetails,
      });
      setMode('image');
    } catch (err) {
      setPipelineError('pipeline', {
        code: 'UNKNOWN',
        message: 'Failed to load background image',
        fatal: false,
      }, {
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
        },
        rawError: serializeError(err),
      });
    }
  }

  // Watch for mode/blur changes from external ref mutations
  watch(mode, () => {
    sendCompositorConfig();
  });

  watch(blurStrength, () => {
    sendCompositorConfig();
  });

  onUnmounted(() => {
    stop();
  });

  return {
    state,
    error,
    errorLogId,
    metrics,
    modelProgress,
    modelStage,
    mode,
    blurStrength,
    enabled,
    start,
    stop,
    setMode,
    setBlurStrength,
    setBgImage,
    outputStream,
    outputTrack,
  };
}
