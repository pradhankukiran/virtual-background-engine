<script setup lang="ts">
import { ref } from 'vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import Message from 'primevue/message';

const props = defineProps<{
  connected: boolean;
  connecting: boolean;
  roomName: string;
  participantCount: number;
  error: string | null;
  remoteStreams: MediaStream[];
}>();

const emit = defineEmits<{
  connect: [url: string, token: string];
  disconnect: [];
}>();

const serverUrl = ref('wss://your-livekit-server.livekit.cloud');
const token = ref('');

function handleConnect(): void {
  if (serverUrl.value && token.value) {
    emit('connect', serverUrl.value, token.value);
  }
}
</script>

<template>
  <div class="border border-gray-200 bg-white p-5">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-base font-semibold text-gray-900">LiveKit Room</h2>
      <div class="flex items-center gap-2">
        <span
          class="inline-block w-2 h-2 rounded-full"
          :class="connected ? 'bg-green-500' : 'bg-gray-300'"
        />
        <span class="text-sm text-gray-500">
          {{ connected ? `${roomName} (${participantCount})` : 'Disconnected' }}
        </span>
      </div>
    </div>

    <Message v-if="error" severity="error" class="mb-4" :closable="false">
      {{ error }}
    </Message>

    <div v-if="!connected" class="space-y-3">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Server URL</label>
        <InputText
          v-model="serverUrl"
          class="w-full"
          placeholder="wss://your-server.livekit.cloud"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
        <InputText
          v-model="token"
          class="w-full"
          placeholder="Paste your LiveKit token"
        />
      </div>
      <div class="text-xs text-gray-400">
        Generate a token at <a href="https://docs.livekit.io/home/cli/cli-setup/" target="_blank" class="underline">livekit-cli</a>
        or your LiveKit Cloud dashboard.
      </div>
      <Button
        :label="connecting ? 'Connecting...' : 'Join Room'"
        :disabled="connecting || !token"
        :loading="connecting"
        severity="primary"
        class="w-full"
        @click="handleConnect"
      />
    </div>

    <div v-else class="space-y-3">
      <div class="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-700">
        {{ participantCount }} participant{{ participantCount !== 1 ? 's' : '' }} in room
      </div>

      <div v-if="remoteStreams.length > 0" class="grid grid-cols-2 gap-2">
        <div
          v-for="(stream, i) in remoteStreams"
          :key="i"
          class="aspect-video bg-gray-900 rounded overflow-hidden"
        >
          <video
            autoplay
            muted
            playsinline
            class="w-full h-full object-cover"
            :ref="(el: any) => { if (el) el.srcObject = stream; }"
          />
        </div>
      </div>
      <div v-else class="text-sm text-gray-400 text-center py-4">
        Waiting for other participants...
      </div>

      <Button
        label="Leave Room"
        severity="danger"
        outlined
        class="w-full"
        @click="$emit('disconnect')"
      />
    </div>
  </div>
</template>
