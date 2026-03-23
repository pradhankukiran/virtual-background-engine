import type { TextureSlot, Dimensions } from '../types';

interface TextureEntry {
  texture: WebGLTexture;
  width: number;
  height: number;
  format: number; // gl.RGBA or gl.RED
  fbo: WebGLFramebuffer | null;
}

export class TexturePool {
  private textures = new Map<TextureSlot, TextureEntry>();

  constructor(private gl: WebGL2RenderingContext) {}

  /** Pre-allocate all textures needed for the pipeline */
  allocate(outputDims: Dimensions, maskDims: Dimensions): void {
    const gl = this.gl;
    const { width: ow, height: oh } = outputDims;
    const { width: mw, height: mh } = maskDims;

    // RGBA8 textures at output resolution
    this.createTexture('camera', ow, oh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    this.createTexture('blurA', ow, oh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    this.createTexture('blurB', ow, oh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    this.createTexture('compositeOut', ow, oh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);

    // R8 mask textures at output resolution
    this.createTexture('maskHigh', ow, oh, gl.R8, gl.RED, gl.UNSIGNED_BYTE);
    this.createTexture('maskPing', ow, oh, gl.R8, gl.RED, gl.UNSIGNED_BYTE);
    this.createTexture('maskPong', ow, oh, gl.R8, gl.RED, gl.UNSIGNED_BYTE);

    // R8 mask at segmentation resolution (256x256)
    this.createTexture('maskLow', mw, mh, gl.R8, gl.RED, gl.UNSIGNED_BYTE);
  }

  /** Allocate a background image texture (called when user uploads image) */
  allocateBgImage(width: number, height: number): void {
    const gl = this.gl;
    // Delete existing if present
    const existing = this.textures.get('bgImage');
    if (existing) {
      gl.deleteTexture(existing.texture);
      if (existing.fbo) gl.deleteFramebuffer(existing.fbo);
    }
    this.createTexture('bgImage', width, height, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
  }

  get(slot: TextureSlot): TextureEntry {
    const entry = this.textures.get(slot);
    if (!entry) throw new Error(`[TexturePool] Slot ${slot} not allocated`);
    return entry;
  }

  /** Bind texture to a texture unit */
  bind(slot: TextureSlot, unit: number): void {
    const gl = this.gl;
    const entry = this.get(slot);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
  }

  /** Bind framebuffer for render-to-texture */
  bindFbo(slot: TextureSlot): void {
    const gl = this.gl;
    const entry = this.get(slot);
    if (!entry.fbo) {
      entry.fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, entry.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, entry.texture, 0);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, entry.fbo);
    }
    gl.viewport(0, 0, entry.width, entry.height);
  }

  /** Bind default framebuffer (canvas) */
  bindCanvas(width: number, height: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
  }

  /** Upload pixel data to a texture */
  upload(slot: TextureSlot, data: Uint8Array | ImageBitmap | VideoFrame): void {
    const gl = this.gl;
    const entry = this.get(slot);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);

    if (data instanceof Uint8Array) {
      // Mask data (R8)
      gl.texSubImage2D(
        gl.TEXTURE_2D, 0, 0, 0,
        entry.width, entry.height,
        gl.RED, gl.UNSIGNED_BYTE, data,
      );
    } else {
      // ImageBitmap or VideoFrame
      gl.texSubImage2D(
        gl.TEXTURE_2D, 0, 0, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, data as ImageBitmap,
      );
    }
  }

  dispose(): void {
    const gl = this.gl;
    for (const entry of this.textures.values()) {
      gl.deleteTexture(entry.texture);
      if (entry.fbo) gl.deleteFramebuffer(entry.fbo);
    }
    this.textures.clear();
  }

  private createTexture(
    slot: TextureSlot,
    width: number,
    height: number,
    internalFormat: number,
    format: number,
    type: number,
  ): void {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.textures.set(slot, { texture, width, height, format, fbo: null });
  }
}
