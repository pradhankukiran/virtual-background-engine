export class GPUTimer {
  private ext: any; // EXT_disjoint_timer_query_webgl2
  private queries: Map<string, WebGLQuery> = new Map();
  private results: Map<string, number> = new Map();
  private available = false;

  constructor(private gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.available = !!this.ext;
    if (!this.available) {
      console.log('[GPUTimer] EXT_disjoint_timer_query_webgl2 not available, using estimates');
    }
  }

  get isAvailable(): boolean {
    return this.available;
  }

  begin(label: string): void {
    if (!this.available) return;
    const gl = this.gl;

    // Collect previous result for this label if available
    this.collectResult(label);

    const query = gl.createQuery()!;
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.queries.set(label, query);
  }

  end(label: string): void {
    if (!this.available || !this.queries.has(label)) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
  }

  /** Get last known timing for a pass (in ms) */
  getTime(label: string): number {
    this.collectResult(label);
    return this.results.get(label) ?? 0;
  }

  /** Get all timings */
  getAllTimings(): Record<string, number> {
    const timings: Record<string, number> = {};
    for (const [label] of this.queries) {
      this.collectResult(label);
    }
    for (const [label, time] of this.results) {
      timings[label] = time;
    }
    return timings;
  }

  dispose(): void {
    for (const query of this.queries.values()) {
      this.gl.deleteQuery(query);
    }
    this.queries.clear();
    this.results.clear();
  }

  private collectResult(label: string): void {
    if (!this.available) return;
    const gl = this.gl;
    const query = this.queries.get(label);
    if (!query) return;

    const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);

    if (available && !disjoint) {
      const nanoseconds = gl.getQueryParameter(query, gl.QUERY_RESULT);
      this.results.set(label, nanoseconds / 1_000_000); // ns -> ms
      gl.deleteQuery(query);
      this.queries.delete(label);
    }
  }
}
