<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import type { DiagnosticEntry } from '../composables/useDiagnosticsLog';

const props = defineProps<{
  entries: ReadonlyArray<DiagnosticEntry>;
  sessionId: string;
}>();

const emit = defineEmits<{
  copy: [];
  clear: [];
}>();

const latestError = computed(() =>
  props.entries.find((entry) => entry.level === 'error') ?? null
);

const errorCount = computed(() =>
  props.entries.filter((entry) => entry.level === 'error').length
);

function prettyDetails(details: unknown): string {
  return JSON.stringify(details, null, 2);
}

function entryTone(level: DiagnosticEntry['level']): string {
  if (level === 'error') return 'border-red-200 bg-red-50';
  if (level === 'warn') return 'border-amber-200 bg-amber-50';
  return 'border-slate-200 bg-slate-50';
}

function entryLabel(level: DiagnosticEntry['level']): string {
  return level.toUpperCase();
}
</script>

<template>
  <section class="border border-slate-200 bg-white p-5">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 class="text-base font-semibold text-slate-900">Diagnostics Log</h2>
        <p class="mt-1 text-sm text-slate-500">
          Session <span class="font-mono text-slate-700">{{ sessionId }}</span>
          · {{ entries.length }} events
          · {{ errorCount }} errors
        </p>
      </div>

      <div class="flex gap-2">
        <Button
          label="Copy Logs"
          severity="secondary"
          size="small"
          @click="emit('copy')"
        />
        <Button
          label="Clear"
          severity="contrast"
          size="small"
          outlined
          @click="emit('clear')"
        />
      </div>
    </div>

    <Message
      v-if="latestError"
      severity="error"
      class="mt-4"
      :closable="false"
    >
      <div class="space-y-1">
        <div class="font-medium">
          Latest error {{ latestError.id }}: {{ latestError.message }}
        </div>
        <div class="text-xs font-mono text-red-700">
          {{ latestError.timestamp }}
          <span v-if="latestError.code"> · {{ latestError.code }}</span>
          · {{ latestError.source }}
        </div>
      </div>
    </Message>

    <div
      v-if="entries.length === 0"
      class="mt-4 rounded border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500"
    >
      No diagnostic events yet.
    </div>

    <div v-else class="mt-4 space-y-3 max-h-[28rem] overflow-auto pr-1">
      <details
        v-for="entry in entries"
        :key="entry.id"
        class="rounded border p-3"
        :class="entryTone(entry.level)"
      >
        <summary class="cursor-pointer list-none">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded bg-white px-2 py-0.5 font-mono text-xs text-slate-700">
                {{ entry.id }}
              </span>
              <span class="rounded bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">
                {{ entryLabel(entry.level) }}
              </span>
              <span class="text-sm font-medium text-slate-800">
                {{ entry.message }}
              </span>
            </div>
            <div class="text-xs font-mono text-slate-500">
              {{ entry.timestamp }}
            </div>
          </div>
        </summary>

        <div class="mt-3 space-y-3 border-t border-white/70 pt-3">
          <div class="grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
            <div>
              <span class="font-semibold">Source:</span> {{ entry.source }}
            </div>
            <div>
              <span class="font-semibold">Code:</span> {{ entry.code || 'n/a' }}
            </div>
            <div>
              <span class="font-semibold">Session:</span> {{ entry.sessionId }}
            </div>
          </div>

          <pre
            v-if="entry.details"
            class="overflow-auto rounded bg-slate-950 px-3 py-3 font-mono text-xs text-slate-100"
          >{{ prettyDetails(entry.details) }}</pre>
        </div>
      </details>
    </div>
  </section>
</template>
