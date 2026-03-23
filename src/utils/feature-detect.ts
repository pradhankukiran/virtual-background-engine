export interface BrowserCapabilities {
  insertableStreams: boolean;
  offscreenCanvas: boolean;
  webgl2: boolean;
  videoFrameCallbacks: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  webCodecs: boolean;
}

/** Detect browser capabilities for the virtual background pipeline */
export function detectCapabilities(): BrowserCapabilities {
  return {
    insertableStreams: typeof MediaStreamTrackProcessor !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    webgl2: checkWebGL2(),
    videoFrameCallbacks: 'requestVideoFrameCallback' in HTMLVideoElement.prototype,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    crossOriginIsolated: self.crossOriginIsolated,
    webCodecs: typeof VideoFrame !== 'undefined',
  };
}

function checkWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    // Check for required extension
    const ext = gl.getExtension('EXT_color_buffer_float');
    canvas.remove();
    return true;
  } catch {
    return false;
  }
}

/** Minimum requirements for the pipeline to run */
export function checkMinimumRequirements(): { ok: boolean; missing: string[] } {
  const caps = detectCapabilities();
  const missing: string[] = [];

  if (!caps.offscreenCanvas) missing.push('OffscreenCanvas');
  if (!caps.webgl2) missing.push('WebGL 2');
  if (!caps.videoFrameCallbacks && !caps.insertableStreams) {
    missing.push('requestVideoFrameCallback or MediaStreamTrackProcessor');
  }

  return { ok: missing.length === 0, missing };
}

/** Check if we can use the optimal zero-copy path */
export function canUseZeroCopyPath(): boolean {
  const caps = detectCapabilities();
  return caps.insertableStreams && caps.webCodecs;
}

/** Detect WebGPU availability (async — requires adapter request) */
export async function detectWebGPU(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu!.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}
