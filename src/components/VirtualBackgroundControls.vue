<script setup lang="ts">
import { ref, computed } from 'vue';
import ToggleSwitch from 'primevue/toggleswitch';
import SelectButton from 'primevue/selectbutton';
import Slider from 'primevue/slider';
import Button from 'primevue/button';
import Message from 'primevue/message';
import ProgressBar from 'primevue/progressbar';
import type { VBGMode, PipelineState, PipelineError, PipelineMetrics } from '../pipeline/types';

const props = defineProps<{
  enabled: boolean;
  mode: VBGMode;
  blurStrength: number;
  state: PipelineState;
  error: PipelineError | null;
  errorLogId: string | null;
  modelProgress: number;
  modelStage: string;
  metrics: PipelineMetrics;
}>();

const emit = defineEmits<{
  'update:enabled': [value: boolean];
  'update:mode': [value: VBGMode];
  'update:blurStrength': [value: number];
  'upload-image': [file: File];
}>();

const modeOptions = [
  { label: 'Blur', value: 'blur' },
  { label: 'Image', value: 'image' },
  { label: 'None', value: 'none' },
];

const fileInput = ref<HTMLInputElement | null>(null);

const isLoading = computed(() =>
  props.state === 'loading-model' || props.state === 'warmup'
);

const statusText = computed(() => {
  switch (props.state) {
    case 'idle': return 'Idle';
    case 'loading-model': return 'Loading model...';
    case 'warmup': return 'Warming up...';
    case 'running': return 'Active';
    case 'paused': return 'Paused (tab hidden)';
    case 'error': return 'Error';
    case 'destroyed': return 'Stopped';
    default: return '';
  }
});

function handleFileUpload(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    emit('upload-image', file);
    input.value = '';
  }
}

function triggerUpload(): void {
  fileInput.value?.click();
}

function onEnabledChange(value: boolean): void {
  emit('update:enabled', value);
}

function onModeChange(value: VBGMode): void {
  emit('update:mode', value);
}

function onBlurStrengthChange(value: number | number[]): void {
  const v = Array.isArray(value) ? value[0] : value;
  emit('update:blurStrength', v);
}
</script>

<template>
  <div class="border border-gray-200 bg-white p-5">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-base font-semibold text-gray-900">Virtual Background</h2>
      <div class="flex items-center gap-3">
        <span class="text-sm text-gray-500">{{ statusText }}</span>
        <ToggleSwitch
          :modelValue="enabled"
          @update:modelValue="onEnabledChange"
          :disabled="isLoading"
        />
      </div>
    </div>

    <div v-if="isLoading" class="mb-4 space-y-1">
      <ProgressBar
        :value="Math.round(modelProgress * 100)"
        :showValue="false"
        style="height: 6px"
      />
      <div v-if="modelStage" class="text-xs text-gray-500">
        {{ modelStage }}
      </div>
    </div>

    <Message
      v-if="error"
      severity="error"
      class="mb-4"
      :closable="false"
    >
      <div class="space-y-1">
        <div class="font-medium">{{ error.message }}</div>
        <div class="text-xs font-mono text-red-700">
          {{ error.code }}
          <span v-if="errorLogId"> · Ref {{ errorLogId }}</span>
          <span v-if="!error.fatal"> · recoverable</span>
        </div>
      </div>
    </Message>

    <div v-if="enabled && state === 'running'" class="space-y-4">
      <div class="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-700">
        Seg {{ metrics.segmentationFps }} fps · Render {{ metrics.compositorFps }} fps · Mask {{ Math.round(metrics.maskCoverage * 100) }}%
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">Mode</label>
        <SelectButton
          :modelValue="mode"
          @update:modelValue="onModeChange"
          :options="modeOptions"
          optionLabel="label"
          optionValue="value"
        />
      </div>

      <div v-if="mode === 'blur'">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          Blur Strength: {{ Math.round(blurStrength * 100) }}%
        </label>
        <Slider
          :modelValue="blurStrength"
          @update:modelValue="onBlurStrengthChange"
          :min="0"
          :max="1"
          :step="0.05"
        />
      </div>

      <div v-if="mode === 'image'">
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="handleFileUpload"
        />
        <Button
          label="Upload Background Image"
          severity="secondary"
          @click="triggerUpload"
          class="w-full"
        />
      </div>
    </div>
  </div>
</template>
