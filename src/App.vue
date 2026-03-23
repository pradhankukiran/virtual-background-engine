<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useCamera } from './composables/useCamera';
import { useVirtualBackground } from './composables/useVirtualBackground';
import { serializeError, useDiagnosticsLog } from './composables/useDiagnosticsLog';
import VirtualBackgroundControls from './components/VirtualBackgroundControls.vue';
import VideoPreview from './components/VideoPreview.vue';
import PerformanceHud from './components/PerformanceHud.vue';
import DiagnosticsPanel from './components/DiagnosticsPanel.vue';
import Message from 'primevue/message';
import { detectCapabilities } from './utils/feature-detect';


const {
  stream: cameraStream,
  videoTrack,
  error: cameraError,
  errorLogId: cameraErrorLogId,
  isActive,
  start: startCameraFn,
} = useCamera();

const {
  state, error: vbgError, errorLogId: vbgErrorLogId, metrics, modelProgress, modelStage, mode, blurStrength,
  enabled, start: startVbg, stop: stopVbg, setMode, setBlurStrength,
  setBgImage, outputStream,
} = useVirtualBackground();
const { sessionId, entries, logInfo, logError, clearLogs, exportLogs } = useDiagnosticsLog();

async function startCamera(): Promise<void> {
  await startCameraFn();
}

async function toggleVbg(on: boolean): Promise<void> {
  if (on && videoTrack.value) {
    await startVbg(videoTrack.value);
  } else {
    stopVbg();
  }
}

function onWindowError(event: ErrorEvent): void {
  logError({
    source: 'window',
    code: 'UNHANDLED_ERROR',
    message: event.message || 'Unhandled window error',
    details: {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: serializeError(event.error),
    },
  });
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  logError({
    source: 'window',
    code: 'UNHANDLED_REJECTION',
    message: 'Unhandled promise rejection',
    details: {
      reason: serializeError(event.reason),
    },
  });
}

async function copyLogs(): Promise<void> {
  try {
    await navigator.clipboard.writeText(exportLogs());
    logInfo({
      source: 'ui',
      message: 'Copied diagnostics log to clipboard',
      details: {
        entryCount: entries.value.length,
      },
    });
  } catch (err) {
    logError({
      source: 'ui',
      code: 'COPY_LOGS_FAILED',
      message: 'Failed to copy diagnostics log',
      details: {
        rawError: serializeError(err),
      },
    });
  }
}

onMounted(async () => {
  logInfo({
    source: 'app',
    message: 'Application mounted',
    details: {
      url: window.location.href,
      crossOriginIsolated,
      capabilities: detectCapabilities(),
    },
  });
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  // Auto-start camera and VBG pipeline
  await startCameraFn();
  if (videoTrack.value) {
    await startVbg(videoTrack.value);
  }
});

onUnmounted(() => {
  window.removeEventListener('error', onWindowError);
  window.removeEventListener('unhandledrejection', onUnhandledRejection);
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 p-8">
    <div class="max-w-5xl mx-auto">
      <h1 class="text-2xl font-semibold text-gray-900 mb-6">
        Virtual Background Engine
      </h1>

      <Message
        v-if="cameraError"
        severity="error"
        class="mb-4"
        :closable="false"
      >
        <div class="space-y-1">
          <div class="font-medium">{{ cameraError }}</div>
          <div class="text-xs font-mono text-red-700">
            <span v-if="cameraErrorLogId">Ref {{ cameraErrorLogId }} · </span>
            Session {{ sessionId }}
          </div>
        </div>
      </Message>

      <div class="space-y-6">
        <VideoPreview
          :originalStream="cameraStream"
          :processedStream="outputStream"
          :enabled="enabled"
        />

        <VirtualBackgroundControls
          :enabled="enabled"
          :mode="mode"
          :blurStrength="blurStrength"
          :state="state"
          :error="vbgError"
          :errorLogId="vbgErrorLogId"
          :modelProgress="modelProgress"
          :modelStage="modelStage"
          :metrics="metrics"
          @update:enabled="toggleVbg"
          @update:mode="setMode"
          @update:blurStrength="setBlurStrength"
          @upload-image="setBgImage"
        />
      </div>

      <DiagnosticsPanel
        class="mt-6"
        :entries="entries"
        :sessionId="sessionId"
        @copy="copyLogs"
        @clear="clearLogs"
      />

      <PerformanceHud :metrics="metrics" />
    </div>
  </div>
</template>

<style>
@import "tailwindcss";
@import "tailwindcss-primeui";
</style>
