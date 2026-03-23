import { ref, onUnmounted, type Ref } from 'vue';
import { serializeError, useDiagnosticsLog } from './useDiagnosticsLog';

export interface UseCameraReturn {
  stream: Ref<MediaStream | null>;
  videoTrack: Ref<MediaStreamTrack | null>;
  error: Ref<string | null>;
  errorLogId: Ref<string | null>;
  isActive: Ref<boolean>;
  start: (deviceId?: string) => Promise<void>;
  stop: () => void;
  switchDevice: (deviceId: string) => Promise<void>;
}

export function useCamera(
  width = 748,
  height = 420,
  frameRate = 30,
): UseCameraReturn {
  const stream = ref<MediaStream | null>(null);
  const videoTrack = ref<MediaStreamTrack | null>(null);
  const error = ref<string | null>(null);
  const errorLogId = ref<string | null>(null);
  const isActive = ref(false);
  const { logInfo, logWarn, logError } = useDiagnosticsLog();

  async function start(deviceId?: string): Promise<void> {
    const constraints: MediaStreamConstraints = {
      video: {
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: frameRate },
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
      audio: false,
    };

    try {
      error.value = null;
      errorLogId.value = null;
      logInfo({
        source: 'camera',
        message: 'Requesting camera access',
        details: { constraints, deviceId: deviceId ?? null },
      });

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.value = mediaStream;
      videoTrack.value = mediaStream.getVideoTracks()[0] ?? null;
      isActive.value = true;

      logInfo({
        source: 'camera',
        message: 'Camera started',
        details: {
          label: videoTrack.value?.label ?? null,
          settings: videoTrack.value?.getSettings() ?? null,
        },
      });

      // Listen for track ending
      if (videoTrack.value) {
        videoTrack.value.addEventListener('ended', () => {
          logWarn({
            source: 'camera',
            code: 'TRACK_ENDED',
            message: 'Camera track ended',
            details: {
              label: videoTrack.value?.label ?? null,
            },
          });
          isActive.value = false;
          videoTrack.value = null;
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      let code = 'CAMERA_ERROR';
      if (msg.includes('NotAllowed') || msg.includes('Permission')) {
        error.value = 'Camera permission denied';
        code = 'CAMERA_DENIED';
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        error.value = 'No camera found';
        code = 'CAMERA_NOT_FOUND';
      } else {
        error.value = `Camera error: ${msg}`;
      }
      errorLogId.value = logError({
        source: 'camera',
        code,
        message: error.value,
        details: {
          constraints,
          rawError: serializeError(err),
        },
      }).id;
      isActive.value = false;
    }
  }

  function stop(): void {
    if (stream.value) {
      logInfo({
        source: 'camera',
        message: 'Stopping camera stream',
        details: {
          trackCount: stream.value.getTracks().length,
        },
      });
    }

    if (stream.value) {
      for (const track of stream.value.getTracks()) {
        track.stop();
      }
    }
    stream.value = null;
    videoTrack.value = null;
    isActive.value = false;
  }

  async function switchDevice(deviceId: string): Promise<void> {
    stop();
    await start(deviceId);
  }

  onUnmounted(() => {
    stop();
  });

  return { stream, videoTrack, error, errorLogId, isActive, start, stop, switchDevice };
}
