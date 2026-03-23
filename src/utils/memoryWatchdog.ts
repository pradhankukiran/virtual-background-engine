export type MemoryLevel = 'ok' | 'warning' | 'critical';

export interface MemoryStatus {
  level: MemoryLevel;
  heapUsedMB: number;
  heapLimitMB: number;
  percentUsed: number;
}

export interface MemoryWatchdogOptions {
  warningThresholdMB?: number;   // default 300
  criticalThresholdMB?: number;  // default 500
  intervalMs?: number;           // default 5000
  onWarning?: (status: MemoryStatus) => void;
  onCritical?: (status: MemoryStatus) => void;
}

/**
 * Monitors JS heap usage for long sessions.
 * Uses performance.memory (Chrome only) with graceful degradation.
 */
export class MemoryWatchdog {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private warningThreshold: number;
  private criticalThreshold: number;
  private intervalMs: number;
  private onWarning: ((status: MemoryStatus) => void) | null;
  private onCritical: ((status: MemoryStatus) => void) | null;
  private lastLevel: MemoryLevel = 'ok';

  constructor(options: MemoryWatchdogOptions = {}) {
    this.warningThreshold = options.warningThresholdMB ?? 300;
    this.criticalThreshold = options.criticalThresholdMB ?? 500;
    this.intervalMs = options.intervalMs ?? 5000;
    this.onWarning = options.onWarning ?? null;
    this.onCritical = options.onCritical ?? null;
  }

  start(): void {
    if (this.intervalId) return;
    if (!performance.memory) {
      console.log('[MemoryWatchdog] performance.memory not available (non-Chrome browser)');
      return;
    }

    this.intervalId = setInterval(() => {
      const status = this.check();
      if (!status) return;

      if (status.level === 'critical' && this.lastLevel !== 'critical') {
        this.onCritical?.(status);
        console.error(`[MemoryWatchdog] CRITICAL: ${status.heapUsedMB.toFixed(0)} MB used`);
      } else if (status.level === 'warning' && this.lastLevel === 'ok') {
        this.onWarning?.(status);
        console.warn(`[MemoryWatchdog] WARNING: ${status.heapUsedMB.toFixed(0)} MB used`);
      }

      this.lastLevel = status.level;
    }, this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  check(): MemoryStatus | null {
    if (!performance.memory) return null;

    const heapUsedMB = performance.memory.usedJSHeapSize / (1024 * 1024);
    const heapLimitMB = performance.memory.jsHeapSizeLimit / (1024 * 1024);
    const percentUsed = (heapUsedMB / heapLimitMB) * 100;

    let level: MemoryLevel = 'ok';
    if (heapUsedMB >= this.criticalThreshold) {
      level = 'critical';
    } else if (heapUsedMB >= this.warningThreshold) {
      level = 'warning';
    }

    return { level, heapUsedMB, heapLimitMB, percentUsed };
  }
}
