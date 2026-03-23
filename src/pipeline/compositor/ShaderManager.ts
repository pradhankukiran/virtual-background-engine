import type { ShaderProgram } from '../types';

interface ProgramEntry {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
}

export class ShaderManager {
  private programs = new Map<ShaderProgram, ProgramEntry>();

  constructor(private gl: WebGL2RenderingContext) {}

  compile(id: ShaderProgram, vertSrc: string, fragSrc: string): void {
    const gl = this.gl;

    const vs = this.createShader(gl.VERTEX_SHADER, vertSrc);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fragSrc);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      throw new Error(`[ShaderManager] Link failed for ${id}: ${log}`);
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    // Pre-query all active uniforms
    const uniforms = new Map<string, WebGLUniformLocation>();
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info) {
        const loc = gl.getUniformLocation(program, info.name);
        if (loc) uniforms.set(info.name, loc);
      }
    }

    this.programs.set(id, { program, uniforms });
  }

  use(id: ShaderProgram): ProgramEntry {
    const entry = this.programs.get(id);
    if (!entry) throw new Error(`[ShaderManager] Program ${id} not compiled`);
    this.gl.useProgram(entry.program);
    return entry;
  }

  getUniform(id: ShaderProgram, name: string): WebGLUniformLocation | null {
    return this.programs.get(id)?.uniforms.get(name) ?? null;
  }

  dispose(): void {
    for (const { program } of this.programs.values()) {
      this.gl.deleteProgram(program);
    }
    this.programs.clear();
  }

  private createShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`[ShaderManager] Compile failed: ${log}`);
    }

    return shader;
  }
}
