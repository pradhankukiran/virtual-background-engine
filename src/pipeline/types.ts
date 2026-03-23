// ===== Dimensions =====
export interface Dimensions {
  width: number;
  height: number;
}

// ===== Virtual Background Modes =====
export type VBGMode = 'blur' | 'image' | 'none';

// ===== Segmentation Backend =====
export type SegBackend = 'onnx-webgpu' | 'onnx-wasm' | 'mediapipe';

// ===== Virtual Background Config =====
export interface VBGConfig {
  mode: VBGMode;
  blurStrength: number;       // 0-1, maps to Kawase iterations
  bgImageBitmap: ImageBitmap | null;
  segFps: number;             // target segmentation FPS (10-20)
  outputDims: Dimensions;     // default 748x420
  maskDims: Dimensions;       // default 256x256
  segBackend: SegBackend;     // default 'onnx-webgpu'
  modelUrl: string;           // default '/models/modnet.onnx'
}

export const DEFAULT_CONFIG: Readonly<VBGConfig> = {
  mode: 'blur',
  blurStrength: 0.6,
  bgImageBitmap: null,
  segFps: 20,
  outputDims: { width: 748, height: 420 },
  maskDims: { width: 256, height: 256 },
  segBackend: 'mediapipe',
  modelUrl: '/models/selfie_segmenter_landscape.tflite',
};

// ===== Frame Capture Interface =====
export interface FrameCapture {
  start(track: MediaStreamTrack, compositorPort: MessagePort, segmentationPort: MessagePort): void;
  stop(): void;
  setSegFps?(segFps: number): void;
  notifyCompositorFrameRendered?(): void;
}

// ===== Performance Metrics =====
export interface PipelineMetrics {
  captureFps: number;
  segmentationFps: number;
  compositorFps: number;
  segLatencyMs: number;
  compositorLatencyMs: number;
  maskCoverage: number;
  gpuPassTimings: GPUPassTimings;
  heapUsedMB: number;
  droppedFrames: number;
}

export interface GPUPassTimings {
  bilateralUpsample: number;
  temporalSmooth: number;
  kawaseBlur: number;
  composite: number;
  exposureCorrect: number;
  total: number;
}

// ===== Pipeline State =====
export type PipelineState =
  | 'idle'
  | 'loading-model'
  | 'warmup'
  | 'running'
  | 'paused'
  | 'error'
  | 'destroyed';

// ===== Error Types =====
export interface PipelineError {
  code: PipelineErrorCode;
  message: string;
  fatal: boolean;
}

export type PipelineErrorCode =
  | 'CAMERA_DENIED'
  | 'CAMERA_NOT_FOUND'
  | 'MODEL_LOAD_FAILED'
  | 'INFERENCE_FAILED'
  | 'RENDER_FAILED'
  | 'WEBGL_NOT_SUPPORTED'
  | 'WEBGPU_NOT_SUPPORTED'
  | 'ONNX_SESSION_FAILED'
  | 'CONTEXT_LOST'
  | 'WORKER_CRASHED'
  | 'MEMORY_CRITICAL'
  | 'UNKNOWN';

// ===== Texture Slot IDs =====
export type TextureSlot =
  | 'camera'
  | 'maskLow'
  | 'maskHigh'
  | 'maskPing'
  | 'maskPong'
  | 'blurA'
  | 'blurB'
  | 'bgImage'
  | 'compositeOut';

// ===== Shader Program IDs =====
export type ShaderProgram =
  | 'bilateralUpsample'
  | 'temporalSmooth'
  | 'kawaseBlur'
  | 'bgImage'
  | 'composite'
  | 'exposureCorrect';
