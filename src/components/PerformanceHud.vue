<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { PipelineMetrics } from '../pipeline/types';

const props = defineProps<{
  metrics: PipelineMetrics;
}>();

const visible = ref(false);

function handleKeydown(e: KeyboardEvent): void {
  if (e.ctrlKey && e.shiftKey && e.key === 'P') {
    e.preventDefault();
    visible.value = !visible.value;
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

function fmt(val: number, decimals = 1): string {
  return val.toFixed(decimals);
}
</script>

<template>
  <div
    v-if="visible"
    class="fixed top-4 right-4 z-50 bg-white border border-gray-300 p-4 font-mono text-xs text-gray-800 min-w-64 shadow-sm"
  >
    <div class="flex items-center justify-between mb-3">
      <span class="font-semibold text-sm">Performance</span>
      <button
        class="text-gray-400 hover:text-gray-600 text-base leading-none"
        @click="visible = false"
      >
        &times;
      </button>
    </div>

    <table class="w-full">
      <tbody>
        <tr class="border-b border-gray-100">
          <td class="py-1 text-gray-500">Seg FPS</td>
          <td class="py-1 text-right">{{ metrics.segmentationFps }}</td>
        </tr>
        <tr class="border-b border-gray-100">
          <td class="py-1 text-gray-500">Render FPS</td>
          <td class="py-1 text-right">{{ metrics.compositorFps }}</td>
        </tr>
        <tr class="border-b border-gray-100">
          <td class="py-1 text-gray-500">Seg Latency</td>
          <td class="py-1 text-right">{{ fmt(metrics.segLatencyMs) }}ms</td>
        </tr>
        <tr class="border-b border-gray-100">
          <td class="py-1 text-gray-500">Render Latency</td>
          <td class="py-1 text-right">{{ fmt(metrics.compositorLatencyMs) }}ms</td>
        </tr>
        <tr>
          <td colspan="2" class="py-2 font-semibold text-gray-600">GPU Passes</td>
        </tr>
        <tr class="border-b border-gray-100">
          <td class="py-1 text-gray-500 pl-2">Bilateral Up</td>
          <td class="py-1 text-right">{{ fmt(metrics.gpuPassTimings.bilateralUpsample) }}ms</td>
        </tr>
        <tr class="border-b border-gray-100">
          <td class="py-1 text-gray-500 pl-2">Temporal</td>
          <td class="py-1 text-right">{{ fmt(metrics.gpuPassTimings.temporalSmooth) }}ms</td>
        </tr>
        <tr class="border-b border-gray-100">
          <td class="py-1 text-gray-500 pl-2">Blur</td>
          <td class="py-1 text-right">{{ fmt(metrics.gpuPassTimings.kawaseBlur) }}ms</td>
        </tr>
        <tr class="border-b border-gray-100">
          <td class="py-1 text-gray-500 pl-2">Composite</td>
          <td class="py-1 text-right">{{ fmt(metrics.gpuPassTimings.composite) }}ms</td>
        </tr>
        <tr class="border-b border-gray-100">
          <td class="py-1 text-gray-500 pl-2">Exposure</td>
          <td class="py-1 text-right">{{ fmt(metrics.gpuPassTimings.exposureCorrect) }}ms</td>
        </tr>
        <tr class="border-b border-gray-100">
          <td class="py-1 text-gray-500 pl-2 font-semibold">Total GPU</td>
          <td class="py-1 text-right font-semibold">{{ fmt(metrics.gpuPassTimings.total) }}ms</td>
        </tr>
        <tr>
          <td class="py-1 text-gray-500">Heap</td>
          <td class="py-1 text-right">{{ fmt(metrics.heapUsedMB, 0) }} MB</td>
        </tr>
      </tbody>
    </table>

    <div class="mt-2 text-gray-400 text-center">Ctrl+Shift+P to toggle</div>
  </div>
</template>
