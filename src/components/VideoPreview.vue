<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';

const props = defineProps<{
  originalStream: MediaStream | null;
  processedStream: MediaStream | null;
  enabled: boolean;
}>();

const originalVideo = ref<HTMLVideoElement | null>(null);
const processedVideo = ref<HTMLVideoElement | null>(null);

function attachStream(video: HTMLVideoElement | null, stream: MediaStream | null): void {
  if (!video) return;
  if (stream) {
    video.srcObject = stream;
    video.play().catch(() => {});
  } else {
    video.srcObject = null;
  }
}

watch(
  () => [props.originalStream, originalVideo.value],
  () => attachStream(originalVideo.value, props.originalStream),
  { immediate: true },
);

watch(
  () => [props.processedStream, processedVideo.value],
  () => attachStream(processedVideo.value, props.processedStream),
  { immediate: true },
);

onUnmounted(() => {
  if (originalVideo.value) originalVideo.value.srcObject = null;
  if (processedVideo.value) processedVideo.value.srcObject = null;
});
</script>

<template>
  <div class="grid gap-4" :class="enabled ? 'grid-cols-2' : 'grid-cols-1'">
    <div class="border border-gray-200 bg-white">
      <div class="px-3 py-2 border-b border-gray-200">
        <span class="text-sm font-medium text-gray-700">Original</span>
      </div>
      <div class="aspect-video bg-gray-50 relative">
        <video
          ref="originalVideo"
          autoplay
          muted
          playsinline
          class="w-full h-full object-cover"
        />
        <div
          v-if="!originalStream"
          class="absolute inset-0 flex items-center justify-center text-gray-400 text-sm"
        >
          No camera feed
        </div>
      </div>
    </div>

    <div v-if="enabled" class="border border-gray-200 bg-white">
      <div class="px-3 py-2 border-b border-gray-200">
        <span class="text-sm font-medium text-gray-700">Processed</span>
      </div>
      <div class="aspect-video bg-gray-50 relative">
        <video
          ref="processedVideo"
          autoplay
          muted
          playsinline
          class="w-full h-full object-cover"
        />
        <div
          v-if="!processedStream"
          class="absolute inset-0 flex items-center justify-center text-gray-400 text-sm"
        >
          Processing...
        </div>
      </div>
    </div>
  </div>
</template>
