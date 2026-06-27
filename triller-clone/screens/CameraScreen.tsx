import { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { CameraView, CameraType } from 'expo-camera';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import type { AudioConfig, Clip } from '../App';

const MAX_CLIPS = 10;

type Props = {
  audio: AudioConfig | null;
  clips: Clip[];
  onClipRecorded: (videoUri: string) => void;
  onChangeSong: () => void;
  onViewClips: () => void;
  onStitch: () => void;
};

export function CameraScreen({ audio, clips, onClipRecorded, onChangeSong, onViewClips, onStitch }: Props) {
  const [recording, setRecording] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [elapsedMs, setElapsedMs] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const segmentMs = audio ? audio.trimEndMs - audio.trimStartMs : null;

  useEffect(() => {
    return () => {
      timerRef.current && clearInterval(timerRef.current);
      soundRef.current?.unloadAsync();
    };
  }, []);

  const startRecording = async () => {
    if (clips.length >= MAX_CLIPS) {
      Alert.alert(
        'Clip Limit Reached',
        `Only ${MAX_CLIPS} clips are allowed. Delete some clips to record more.`,
      );
      return;
    }
    if (!cameraRef.current) return;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    });

    if (audio?.uri) {
      const { sound } = await Audio.Sound.createAsync(
        { uri: audio.uri },
        { shouldPlay: false },
      );
      await sound.setPositionAsync(audio.trimStartMs);
      await sound.playAsync();
      soundRef.current = sound;
    }

    setElapsedMs(0);
    setRecording(true);
    timerRef.current = setInterval(() => setElapsedMs((p) => p + 100), 100);

    const maxDuration = segmentMs ? segmentMs / 1000 : undefined;

    try {
      const result = await cameraRef.current.recordAsync({ maxDuration });
      if (result?.uri) {
        onClipRecorded(result.uri);
      }
    } finally {
      timerRef.current && clearInterval(timerRef.current);
      timerRef.current = null;
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      setRecording(false);
      setElapsedMs(0);
    }
  };

  const stopRecording = () => cameraRef.current?.stopRecording();
  const flipCamera = () => setFacing((p) => (p === 'back' ? 'front' : 'back'));

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const progressPct = segmentMs ? Math.min(elapsedMs / segmentMs, 1) : 0;

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} mode="video" facing={facing} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={flipCamera} disabled={recording}>
          <Text style={styles.iconText}>⟳</Text>
        </TouchableOpacity>

        <View style={styles.topRight}>
          <TouchableOpacity style={styles.chip} onPress={onChangeSong} disabled={recording}>
            <Text style={styles.chipText} numberOfLines={1}>
              {audio ? `🎵 ${audio.name}` : '+ Add song'}
            </Text>
          </TouchableOpacity>
          {clips.length > 0 && (
            <TouchableOpacity style={styles.chip} onPress={onViewClips}>
              <Text style={styles.chipText}>Clips ({clips.length}/{MAX_CLIPS})</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Progress bar */}
      {recording && segmentMs && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
        </View>
      )}

      {/* Bottom controls */}
      <View style={styles.bottomControls}>
        {recording && (
          <Text style={styles.timerText}>
            {fmt(elapsedMs)}{segmentMs ? ` / ${fmt(segmentMs)}` : ''}
          </Text>
        )}

        <View style={styles.buttonRow}>
          {/* Stitch button */}
          {clips.length > 0 && !recording && (
            <TouchableOpacity style={styles.stitchButton} onPress={onStitch}>
              <Text style={styles.stitchIcon}>✂</Text>
              <Text style={styles.stitchLabel}>Stitch</Text>
            </TouchableOpacity>
          )}

          {/* Record button */}
          <TouchableOpacity
            style={[styles.recordRing, recording && styles.recordRingActive]}
            onPress={recording ? stopRecording : startRecording}
            activeOpacity={0.8}
          >
            <View style={[styles.recordDot, recording && styles.recordDotStop]} />
          </TouchableOpacity>

          {/* Spacer to balance layout when stitch button is visible */}
          {clips.length > 0 && !recording && <View style={styles.stitchSpacer} />}
        </View>

        {!recording && (
          <Text style={styles.hint}>
            {segmentMs ? `Max ${fmt(segmentMs)} per clip` : 'Tap to record'}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },

  topBar: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 22, color: '#fff' },
  topRight: { gap: 8, alignItems: 'flex-end' },
  chip: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    maxWidth: 200,
  },
  chipText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  progressTrack: {
    position: 'absolute',
    bottom: 160,
    left: 24,
    right: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: '#e53e3e' },

  bottomControls: {
    position: 'absolute',
    bottom: 48,
    width: '100%',
    alignItems: 'center',
    gap: 14,
  },
  timerText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  hint: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },

  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },

  recordRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordRingActive: { borderColor: '#e53e3e' },
  recordDot: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#e53e3e' },
  recordDotStop: { width: 26, height: 26, borderRadius: 5 },

  stitchButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    gap: 2,
  },
  stitchIcon: { fontSize: 20, color: '#fff' },
  stitchLabel: { fontSize: 10, color: '#fff', fontWeight: '600' },
  stitchSpacer: { width: 56 },
});
