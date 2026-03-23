import { ref, type Ref } from 'vue';
import { Room, RoomEvent, Track, LocalVideoTrack } from 'livekit-client';
import type { VBGMode, VBGConfig } from '../pipeline/types';
import { DEFAULT_CONFIG } from '../pipeline/types';
import { useVirtualBackground } from './useVirtualBackground';
import { useDiagnosticsLog } from './useDiagnosticsLog';

export interface UseLiveKitRoomReturn {
  // Connection state
  connected: Ref<boolean>;
  connecting: Ref<boolean>;
  roomName: Ref<string>;
  participantCount: Ref<number>;
  error: Ref<string | null>;

  // VBG controls (proxied)
  vbgEnabled: Ref<boolean>;
  vbgMode: Ref<VBGMode>;
  vbgBlurStrength: Ref<number>;
  vbgState: Ref<string>;
  vbgMetrics: ReturnType<typeof useVirtualBackground>['metrics'];
  vbgModelProgress: Ref<number>;
  vbgModelStage: Ref<string>;
  vbgError: ReturnType<typeof useVirtualBackground>['error'];

  // Actions
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => void;
  setMode: (mode: VBGMode) => void;
  setBlurStrength: (strength: number) => void;
  setBgImage: (file: File) => Promise<void>;

  // Streams
  localStream: Ref<MediaStream | null>;
  processedStream: Ref<MediaStream | null>;
  remoteStreams: Ref<MediaStream[]>;
}

export function useLiveKitRoom(
  config: Partial<VBGConfig> = {},
): UseLiveKitRoomReturn {
  const connected = ref(false);
  const connecting = ref(false);
  const roomName = ref('');
  const participantCount = ref(0);
  const error = ref<string | null>(null);
  const localStream = ref<MediaStream | null>(null);
  const remoteStreams = ref<MediaStream[]>([]);

  const { logInfo, logError: logErr } = useDiagnosticsLog();

  let room: Room | null = null;

  // Set up the VBG pipeline
  const vbg = useVirtualBackground({ ...DEFAULT_CONFIG, ...config });

  async function connect(url: string, token: string): Promise<void> {
    if (connected.value || connecting.value) return;

    connecting.value = true;
    error.value = null;

    try {
      room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      // Track remote participants
      room.on(RoomEvent.TrackSubscribed, (_track, publication) => {
        updateRemoteStreams();
      });
      room.on(RoomEvent.TrackUnsubscribed, () => {
        updateRemoteStreams();
      });
      room.on(RoomEvent.ParticipantConnected, () => {
        participantCount.value = room!.remoteParticipants.size + 1;
      });
      room.on(RoomEvent.ParticipantDisconnected, () => {
        participantCount.value = room!.remoteParticipants.size + 1;
      });
      room.on(RoomEvent.Disconnected, () => {
        connected.value = false;
        participantCount.value = 0;
        remoteStreams.value = [];
        logInfo({ source: 'livekit', message: 'Disconnected from room' });
      });

      await room.connect(url, token);
      roomName.value = room.name ?? '';
      participantCount.value = room.remoteParticipants.size + 1;

      logInfo({
        source: 'livekit',
        message: `Connected to room: ${roomName.value}`,
        details: { participantCount: participantCount.value },
      });

      // Get camera, run VBG, publish the PROCESSED track (not the raw camera)
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 748 }, height: { ideal: 420 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      const camTrack = camStream.getVideoTracks()[0];
      localStream.value = camStream;

      // Start VBG on the raw camera track
      await vbg.start(camTrack);

      // Wait for the processed output track
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (vbg.outputTrack.value) {
            clearInterval(check);
            resolve();
          }
        }, 50);
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
      });

      // Publish the processed track to the room
      if (vbg.outputTrack.value) {
        const processedLkTrack = new LocalVideoTrack(vbg.outputTrack.value);
        await room.localParticipant.publishTrack(processedLkTrack, {
          source: Track.Source.Camera,
          simulcast: false,
        });
        logInfo({
          source: 'livekit',
          message: 'Published VBG processed track to room',
        });
      }

      connected.value = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error.value = msg;
      logErr({
        source: 'livekit',
        code: 'CONNECTION_FAILED',
        message: msg,
      });
    } finally {
      connecting.value = false;
    }
  }

  function disconnect(): void {
    vbg.stop();
    room?.disconnect();
    room = null;
    connected.value = false;
    connecting.value = false;
    roomName.value = '';
    participantCount.value = 0;
    localStream.value = null;
    remoteStreams.value = [];
  }

  function updateRemoteStreams(): void {
    if (!room) return;
    const streams: MediaStream[] = [];
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.trackPublications.values()) {
        if (pub.track?.kind === Track.Kind.Video && pub.track.mediaStreamTrack) {
          streams.push(new MediaStream([pub.track.mediaStreamTrack]));
        }
      }
    }
    remoteStreams.value = streams;
  }

  return {
    connected,
    connecting,
    roomName,
    participantCount,
    error,
    vbgEnabled: vbg.enabled,
    vbgMode: vbg.mode,
    vbgBlurStrength: vbg.blurStrength,
    vbgState: vbg.state,
    vbgMetrics: vbg.metrics,
    vbgModelProgress: vbg.modelProgress,
    vbgModelStage: vbg.modelStage,
    vbgError: vbg.error,
    connect,
    disconnect,
    setMode: vbg.setMode,
    setBlurStrength: vbg.setBlurStrength,
    setBgImage: vbg.setBgImage,
    localStream,
    processedStream: vbg.outputStream,
    remoteStreams,
  };
}
