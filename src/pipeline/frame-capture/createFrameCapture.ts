import type { FrameCapture, Dimensions } from '../types';
import { InsertableStreamsCapture } from './InsertableStreamsCapture';
import { RvfcFallbackCapture } from './RvfcFallbackCapture';

type FrameCaptureType = 'insertable-streams' | 'rvfc';

/** Detect which frame capture strategy the browser supports */
export function detectCaptureType(): FrameCaptureType {
  if (typeof MediaStreamTrackProcessor !== 'undefined') {
    return 'insertable-streams';
  }
  return 'rvfc';
}

/** Create the best available frame capture for this browser */
export function createFrameCapture(
  outputDims: Dimensions,
  segFps?: number,
): FrameCapture {
  const type = detectCaptureType();

  switch (type) {
    case 'insertable-streams':
      console.log('[VBG] Using InsertableStreams (MSTPR) frame capture');
      return new InsertableStreamsCapture(outputDims, segFps);
    case 'rvfc':
      console.log('[VBG] Using rVFC fallback frame capture');
      return new RvfcFallbackCapture(outputDims, segFps);
  }
}
