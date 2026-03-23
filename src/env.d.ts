/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

// VideoFrame augmentations for transferring between workers
interface VideoFrame {
  close(): void;
}

interface MediaStreamTrack extends EventTarget {}

// MediaStreamTrackProcessor (Chrome/Edge)
interface MediaStreamTrackProcessor {
  readonly readable: ReadableStream<VideoFrame>;
}

declare var MediaStreamTrackProcessor: {
  prototype: MediaStreamTrackProcessor;
  new (init: { track: MediaStreamTrack }): MediaStreamTrackProcessor;
};

// MediaStreamTrackGenerator (Chrome/Edge)
interface MediaStreamTrackGenerator extends MediaStreamTrack {
  readonly writable: WritableStream<VideoFrame>;
}

declare var MediaStreamTrackGenerator: {
  prototype: MediaStreamTrackGenerator;
  new (init: { kind: 'video' | 'audio' }): MediaStreamTrackGenerator;
};

// OffscreenCanvas augmentations
interface OffscreenCanvas {
  getContext(contextId: 'webgl2', options?: WebGLContextAttributes): WebGL2RenderingContext | null;
}

// HTMLVideoElement.requestVideoFrameCallback
interface VideoFrameCallbackMetadata {
  presentationTime: DOMHighResTimeStamp;
  expectedDisplayTime: DOMHighResTimeStamp;
  width: number;
  height: number;
  mediaTime: number;
  presentedFrames: number;
  processingDuration?: number;
}

interface HTMLVideoElement {
  requestVideoFrameCallback(callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void): number;
  cancelVideoFrameCallback(handle: number): void;
}

// Performance.memory (Chrome)
interface PerformanceMemory {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

interface Performance {
  memory?: PerformanceMemory;
}

declare module 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.33/vision_bundle.mjs' {
  export const ImageSegmenter: any;
  export const FilesetResolver: any;
}

// WebGPU type stubs (navigator.gpu)
interface GPU {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
}

interface GPURequestAdapterOptions {
  powerPreference?: 'low-power' | 'high-performance';
}

interface GPUAdapter {
  readonly name: string;
}

interface Navigator {
  readonly gpu?: GPU;
}
