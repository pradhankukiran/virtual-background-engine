import type { TrackProcessor, Track, VideoProcessorOptions } from 'livekit-client';
import { useVirtualBackground, type UseVirtualBackgroundReturn } from '../composables/useVirtualBackground';
import type { VBGConfig, VBGMode } from '../pipeline/types';

/**
 * LiveKit TrackProcessor adapter for the virtual background engine.
 * Wraps the composable for use with LiveKit's track processing API.
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
    // Create the VBG pipeline (note: composable usage outside Vue setup context)
    // This works because we're managing lifecycle manually
    const vbg = useVirtualBackground(this.config);

    await vbg.start(opts.track);

    if (vbg.error.value?.fatal) {
      throw new Error(`VBG init failed: ${vbg.error.value.message}`);
    }

    // Wait for output track to be available
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

  // Convenience methods
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
