import { readonly, ref } from 'vue';

export type DiagnosticLevel = 'info' | 'warn' | 'error';

export interface DiagnosticEntry {
  id: string;
  sessionId: string;
  sequence: number;
  timestamp: string;
  level: DiagnosticLevel;
  source: string;
  message: string;
  code?: string;
  details?: unknown;
}

export interface DiagnosticLogInput {
  source: string;
  message: string;
  code?: string;
  details?: unknown;
}

const MAX_ENTRIES = 100;
const entries = ref<DiagnosticEntry[]>([]);
const sessionId = createSessionId();
let sequence = 0;

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `diag-${crypto.randomUUID().slice(0, 8)}`;
  }

  return `diag-${Math.random().toString(36).slice(2, 10)}`;
}

function nextEntryId(): string {
  sequence += 1;
  return `LOG-${String(sequence).padStart(4, '0')}`;
}

function normalizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[MaxDepth]';
  if (value == null) return value;

  const kind = typeof value;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') return value;
  if (kind === 'bigint') return value.toString();
  if (kind === 'function') {
    const fn = value as Function;
    return `[Function ${fn.name || 'anonymous'}]`;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: normalizeValue(value.cause, depth + 1),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => normalizeValue(item, depth + 1));
  }

  if (value instanceof Event) {
    return {
      type: value.type,
      target: value.target instanceof EventTarget ? value.target.constructor.name : null,
    };
  }

  if (kind === 'object') {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(record)) {
      output[key] = normalizeValue(entry, depth + 1);
    }

    return output;
  }

  return String(value);
}

export function serializeError(error: unknown): unknown {
  return normalizeValue(error);
}

function writeLog(level: DiagnosticLevel, input: DiagnosticLogInput): DiagnosticEntry {
  const entry: DiagnosticEntry = {
    id: nextEntryId(),
    sessionId,
    sequence,
    timestamp: new Date().toISOString(),
    level,
    source: input.source,
    message: input.message,
    code: input.code,
    details: normalizeValue(input.details),
  };

  entries.value = [entry, ...entries.value].slice(0, MAX_ENTRIES);

  const label = `[${entry.id}] ${entry.source}${entry.code ? ` (${entry.code})` : ''}: ${entry.message}`;
  if (level === 'error') {
    console.error(label, entry.details);
  } else if (level === 'warn') {
    console.warn(label, entry.details);
  } else {
    console.info(label, entry.details);
  }

  return entry;
}

export function useDiagnosticsLog() {
  function logInfo(input: DiagnosticLogInput): DiagnosticEntry {
    return writeLog('info', input);
  }

  function logWarn(input: DiagnosticLogInput): DiagnosticEntry {
    return writeLog('warn', input);
  }

  function logError(input: DiagnosticLogInput): DiagnosticEntry {
    return writeLog('error', input);
  }

  function clearLogs(): void {
    entries.value = [];
  }

  function exportLogs(): string {
    return JSON.stringify({
      sessionId,
      exportedAt: new Date().toISOString(),
      entries: [...entries.value].reverse(),
    }, null, 2);
  }

  return {
    sessionId,
    entries: readonly(entries),
    logInfo,
    logWarn,
    logError,
    clearLogs,
    exportLogs,
  };
}
