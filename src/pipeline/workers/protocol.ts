import type { VBGMode, Dimensions, SegBackend, GPUPassTimings } from '../types';

// ===== Segmentation Worker Messages =====

/** Messages sent TO the segmentation worker */
export type SegWorkerInbound =
  | { type: 'init'; backend: SegBackend; modelUrl: string; maskDims: Dimensions }
  | { type: 'configure'; segFps: number }
  | { type: 'frame'; frame: VideoFrame; timestamp: number }
  | { type: 'dispose' };

/** Messages sent FROM the segmentation worker */
export type SegWorkerOutbound =
  | { type: 'ready' }
  | { type: 'model-progress'; progress: number; stage?: string }
  | { type: 'mask'; mask: Float32Array; width: number; height: number; timestamp: number }
  | { type: 'error'; code: string; message: string; fatal: boolean }
  | { type: 'metrics'; segFps: number; latencyMs: number; maskCoverage: number };

// ===== Compositor Worker Messages =====

/** Messages sent TO the compositor worker */
export type CompositorWorkerInbound =
  | { type: 'init'; canvas: OffscreenCanvas; outputDims: Dimensions; maskDims: Dimensions }
  | { type: 'configure'; mode: VBGMode; blurStrength: number }
  | { type: 'set-bg-image'; bitmap: ImageBitmap }
  | { type: 'frame'; frame: VideoFrame | ImageBitmap; timestamp: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'dispose' };

/** Messages sent FROM the compositor worker */
export type CompositorWorkerOutbound =
  | { type: 'ready' }
  | { type: 'frame-rendered'; timestamp: number }
  | { type: 'error'; code: string; message: string; fatal: boolean }
  | { type: 'metrics'; fps: number; passTimings: GPUPassTimings; latencyMs: number }
  | { type: 'context-lost' }
  | { type: 'context-restored' };

// ===== Port Setup Messages =====

/** Port setup messages (not part of normal message flow) */
export type PortSetupMessage =
  | { type: 'mask-port' }
  | { type: 'frame-port' }
  | { type: 'output-port' };

// ===== Mask Channel Messages (worker-to-worker) =====

/** Messages sent from seg worker to compositor worker via MessageChannel */
export type MaskChannelMessage =
  | { type: 'mask'; mask: Uint8Array; width: number; height: number; timestamp: number };
