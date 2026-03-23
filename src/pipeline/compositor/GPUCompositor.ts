import type { Dimensions, VBGMode, GPUPassTimings, TextureSlot } from '../types';
import { ShaderManager } from './ShaderManager';
import { TexturePool } from './TexturePool';
import { GPUTimer } from './GPUTimer';
import { computeForegroundLuminance } from './luminance';

// Import shader sources
import fullscreenVert from './shaders/fullscreen.vert.glsl?raw';
import bilateralUpsampleFrag from './shaders/bilateral-upsample.frag.glsl?raw';
import temporalSmoothFrag from './shaders/temporal-smooth.frag.glsl?raw';
import kawaseBlurFrag from './shaders/kawase-blur.frag.glsl?raw';
import bgImageFrag from './shaders/bg-image.frag.glsl?raw';
import compositeFrag from './shaders/composite.frag.glsl?raw';
import exposureCorrectFrag from './shaders/exposure-correct.frag.glsl?raw';

export class GPUCompositor {
  private gl: WebGL2RenderingContext;
  private shaders: ShaderManager;
  private textures: TexturePool;
  private timer: GPUTimer;
  private vao: WebGLVertexArrayObject;

  private mode: VBGMode = 'blur';
  private blurStrength = 0.6;
  private maskPingPong = false; // flip between maskPing/maskPong for temporal smoothing
  private hasBgImage = false;
  private lastLuminance = 0.5;
  private contextLost = false;
  private frameIndex = 0;

  constructor(
    private canvas: OffscreenCanvas,
    private outputDims: Dimensions,
    private maskDims: Dimensions,
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });

    if (!gl) throw new Error('WebGL 2 not available');
    this.gl = gl;

    // Handle context loss/restore
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      self.postMessage({ type: 'context-lost' });
    });

    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.initGL();
      self.postMessage({ type: 'context-restored' });
    });

    // Empty VAO for fullscreen triangle (positions generated from gl_VertexID)
    this.vao = gl.createVertexArray()!;

    this.shaders = new ShaderManager(gl);
    this.textures = new TexturePool(gl);
    this.timer = new GPUTimer(gl);

    this.initGL();
  }

  private initGL(): void {
    const gl = this.gl;

    this.vao = gl.createVertexArray()!;
    this.frameIndex = 0;

    // Compile all shader programs
    this.shaders.compile('bilateralUpsample', fullscreenVert, bilateralUpsampleFrag);
    this.shaders.compile('temporalSmooth', fullscreenVert, temporalSmoothFrag);
    this.shaders.compile('kawaseBlur', fullscreenVert, kawaseBlurFrag);
    this.shaders.compile('bgImage', fullscreenVert, bgImageFrag);
    this.shaders.compile('composite', fullscreenVert, compositeFrag);
    this.shaders.compile('exposureCorrect', fullscreenVert, exposureCorrectFrag);

    // Pre-allocate all textures
    this.textures.allocate(this.outputDims, this.maskDims);

    // Set pixel unpack alignment for R8 textures
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }

  /** Configure rendering mode */
  configure(mode: VBGMode, blurStrength: number): void {
    this.mode = mode;
    this.blurStrength = blurStrength;
  }

  /** Upload a background image */
  setBgImage(bitmap: ImageBitmap): void {
    this.textures.allocateBgImage(bitmap.width, bitmap.height);
    this.textures.upload('bgImage', bitmap);
    this.hasBgImage = true;
    bitmap.close();
  }

  /** Upload a new segmentation mask (256x256 R8) */
  uploadMask(data: Uint8Array): void {
    this.textures.upload('maskLow', data);
  }

  /** Run the full 5-pass pipeline and render to canvas */
  render(frame: ImageBitmap | VideoFrame): GPUPassTimings {
    if (this.contextLost) {
      return this.zeroTimings();
    }

    const gl = this.gl;
    gl.bindVertexArray(this.vao);

    // Upload camera frame
    this.textures.upload('camera', frame);

    // Pass 1: Bilateral upsample mask 256->output resolution
    this.timer.begin('bilateralUpsample');
    this.passBilateralUpsample();
    this.timer.end('bilateralUpsample');

    // Pass 2: Temporal smooth
    this.timer.begin('temporalSmooth');
    this.passTemporalSmooth();
    this.timer.end('temporalSmooth');

    // Pass 3: Background (blur or image)
    this.timer.begin('kawaseBlur');
    if (this.mode === 'blur') {
      this.passKawaseBlur();
    } else if (this.mode === 'image' && this.hasBgImage) {
      this.passBgImage();
    }
    this.timer.end('kawaseBlur');

    // Pass 4: Composite
    this.timer.begin('composite');
    this.passComposite();
    this.timer.end('composite');

    // Pass 5: Exposure correction
    this.timer.begin('exposureCorrect');
    this.passExposureCorrect();
    this.timer.end('exposureCorrect');

    this.frameIndex++;

    return {
      bilateralUpsample: this.timer.getTime('bilateralUpsample'),
      temporalSmooth: this.timer.getTime('temporalSmooth'),
      kawaseBlur: this.timer.getTime('kawaseBlur'),
      composite: this.timer.getTime('composite'),
      exposureCorrect: this.timer.getTime('exposureCorrect'),
      total:
        this.timer.getTime('bilateralUpsample') +
        this.timer.getTime('temporalSmooth') +
        this.timer.getTime('kawaseBlur') +
        this.timer.getTime('composite') +
        this.timer.getTime('exposureCorrect'),
    };
  }

  dispose(): void {
    this.shaders.dispose();
    this.textures.dispose();
    this.timer.dispose();
    this.gl.deleteVertexArray(this.vao);
  }

  // ===== Render Passes =====

  private passBilateralUpsample(): void {
    const gl = this.gl;
    const prog = this.shaders.use('bilateralUpsample');

    this.textures.bindFbo('maskHigh');
    this.textures.bind('maskLow', 0);
    this.textures.bind('camera', 1);

    gl.uniform1i(prog.uniforms.get('u_mask')!, 0);
    gl.uniform1i(prog.uniforms.get('u_guide')!, 1);
    gl.uniform2f(
      prog.uniforms.get('u_maskTexelSize')!,
      1 / this.maskDims.width,
      1 / this.maskDims.height,
    );

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private passTemporalSmooth(): void {
    const gl = this.gl;
    const prog = this.shaders.use('temporalSmooth');

    // Write to current pong, read from previous ping
    const writeTo: TextureSlot = this.maskPingPong ? 'maskPing' : 'maskPong';
    const readPrev: TextureSlot = this.maskPingPong ? 'maskPong' : 'maskPing';

    this.textures.bindFbo(writeTo);
    this.textures.bind('maskHigh', 0);
    this.textures.bind(readPrev, 1);

    gl.uniform1i(prog.uniforms.get('u_currentMask')!, 0);
    gl.uniform1i(prog.uniforms.get('u_prevMask')!, 1);
    const alpha = this.frameIndex === 0 ? 1.0 : 0.85;
    gl.uniform1f(prog.uniforms.get('u_alpha')!, alpha);    // EMA blend factor (higher = more responsive to movement)
    gl.uniform1f(prog.uniforms.get('u_snapThreshold')!, 0.92);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.maskPingPong = !this.maskPingPong;
  }

  private passKawaseBlur(): void {
    const gl = this.gl;
    const iterations = Math.max(1, Math.round(this.blurStrength * 7));

    // Ping-pong between blurA and blurB
    // First iteration reads from camera
    for (let i = 0; i < iterations; i++) {
      const prog = this.shaders.use('kawaseBlur');
      const readFrom: TextureSlot = i === 0 ? 'camera' : (i % 2 === 0 ? 'blurB' : 'blurA');
      const writeTo: TextureSlot = i % 2 === 0 ? 'blurA' : 'blurB';

      this.textures.bindFbo(writeTo);
      this.textures.bind(readFrom, 0);

      gl.uniform1i(prog.uniforms.get('u_texture')!, 0);
      gl.uniform2f(
        prog.uniforms.get('u_texelSize')!,
        1 / this.outputDims.width,
        1 / this.outputDims.height,
      );
      gl.uniform1f(prog.uniforms.get('u_offset')!, i + 0.5);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  private passBgImage(): void {
    const gl = this.gl;
    const prog = this.shaders.use('bgImage');

    // Render bg image into blurA (reuse as bg slot)
    this.textures.bindFbo('blurA');
    this.textures.bind('bgImage', 0);

    gl.uniform1i(prog.uniforms.get('u_bgImage')!, 0);

    const bgEntry = this.textures.get('bgImage');
    gl.uniform2f(prog.uniforms.get('u_bgSize')!, bgEntry.width, bgEntry.height);
    gl.uniform2f(
      prog.uniforms.get('u_outputSize')!,
      this.outputDims.width,
      this.outputDims.height,
    );

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private passComposite(): void {
    const gl = this.gl;
    const prog = this.shaders.use('composite');

    const maskSlot: TextureSlot = this.maskPingPong ? 'maskPong' : 'maskPing';
    const blurIterations = Math.max(1, Math.round(this.blurStrength * 7));
    const bgSlot: TextureSlot =
      this.mode === 'image'
        ? 'blurA'
        : blurIterations % 2 === 0
          ? 'blurB'
          : 'blurA';

    this.textures.bindFbo('compositeOut');
    this.textures.bind('camera', 0);
    this.textures.bind(this.mode !== 'none' ? bgSlot : 'camera', 1);
    this.textures.bind(maskSlot, 2);

    gl.uniform1i(prog.uniforms.get('u_foreground')!, 0);
    gl.uniform1i(prog.uniforms.get('u_background')!, 1);
    gl.uniform1i(prog.uniforms.get('u_mask')!, 2);
    gl.uniform1f(prog.uniforms.get('u_maskThreshold')!, 0.40);
    gl.uniform1f(prog.uniforms.get('u_feather')!, 0.12);
    gl.uniform1f(prog.uniforms.get('u_lightWrap')!, 0.10);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private passExposureCorrect(): void {
    const gl = this.gl;
    const prog = this.shaders.use('exposureCorrect');

    const maskSlot: TextureSlot = this.maskPingPong ? 'maskPong' : 'maskPing';

    // Render to canvas
    this.textures.bindCanvas(this.outputDims.width, this.outputDims.height);
    this.textures.bind('compositeOut', 0);
    this.textures.bind(maskSlot, 1);

    gl.uniform1i(prog.uniforms.get('u_composite')!, 0);
    gl.uniform1i(prog.uniforms.get('u_mask')!, 1);
    gl.uniform1f(prog.uniforms.get('u_fgLuminance')!, this.lastLuminance);
    gl.uniform1f(prog.uniforms.get('u_targetLuminance')!, 0.45);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Update foreground luminance from CPU-side computation */
  setForegroundLuminance(lum: number): void {
    this.lastLuminance = lum;
  }

  private zeroTimings(): GPUPassTimings {
    return {
      bilateralUpsample: 0,
      temporalSmooth: 0,
      kawaseBlur: 0,
      composite: 0,
      exposureCorrect: 0,
      total: 0,
    };
  }
}
