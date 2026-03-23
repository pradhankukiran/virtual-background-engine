import type { Track } from 'livekit-client';

interface VideoProcessorOptions {
  kind: Track.Kind;
  track: MediaStreamTrack;
  element?: HTMLMediaElement;
}

interface TrackProcessor<T extends Track.Kind, U = VideoProcessorOptions> {
  name: string;
  init: (opts: U) => Promise<void>;
  restart: (opts: U) => Promise<void>;
  destroy: () => Promise<void>;
  processedTrack?: MediaStreamTrack;
}
import { useVirtualBackground, type UseVirtualBackgroundReturn } from '../composables/useVirtualBackground';
import type { VBGConfig, VBGMode } from '../pipeline/types';

/**
 * LiveKit TrackProcessor adapter for the virtual background engine.
 * Wraps the composable for use with LiveKit's track processing API.
 *
 * Usage:
 *   const processor = new VirtualBackgroundProcessor({ mode: 'blur' });
 *   await localVideoTrack.setProcessor(processor);
 */
export class VirtualBackgroundProcessor implements TrackProcessor<Track.Kind.Video, VideoProcessorOptions> {
  name = 'virtual-background';
  processedTrack?: MediaStreamTrack;

  private vbg: UseVirtualBackgroundReturn | null = null;
  private config: Partial<VBGConfig>;

  constructor(config: Partial<VBGConfig> = {}) {
    this.config = config;
  }

  async init(opts: VideoProcessorOptions): Promise<void> {
    const vbg = useVirtualBackground(this.config);
    await vbg.start(opts.track);

    if (vbg.error.value?.fatal) {
      throw new Error(`VBG init failed: ${vbg.error.value.message}`);
    }

    if (vbg.outputTrack.value) {
      this.processedTrack = vbg.outputTrack.value;
    }

    this.vbg = vbg;
  }

  async restart(opts: VideoProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    this.vbg?.stop();
    this.vbg = null;
    this.processedTrack = undefined;
  }

  setMode(mode: VBGMode): void {
    this.vbg?.setMode(mode);
  }

  setBlurStrength(strength: number): void {
    this.vbg?.setBlurStrength(strength);
  }

  async setBgImage(file: File): Promise<void> {
    await this.vbg?.setBgImage(file);
  }
}
