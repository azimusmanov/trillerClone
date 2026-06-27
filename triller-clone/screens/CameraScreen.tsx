import { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CameraView, CameraType } from 'expo-camera';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import type { AudioConfig, Clip } from '../App';

type Props = {
  audio: AudioConfig | null;
  clips: Clip[];
  onClipRecorded: (videoUri: string) => void;
  onChangeSong: () => void;
  onViewClips: () => void;
};

export function CameraScreen({ audio, clips, onClipRecorded, onChangeSong, onViewClips }: Props) {
  const [recording, setRecording] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [elapsedMs, setElapsedMs] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const segmentMs = audio ? audio.trimEndMs - audio.trimStartMs : null;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timerRef.current && clearInterval(timerRef.current);
      soundRef.current?.unloadAsync();
    };
  }, []);

  const startRecording = async () => {
    if (!cameraRef.current) return;

    // iOS: PlayAndRecord allows music to play while camera records
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    });

    // Play music from trim start
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

    timerRef.current = setInterval(() => {
      setElapsedMs((p) => p + 100);
    }, 100);

    const maxDuration = segmentMs ? segmentMs / 1000 : undefined;

    try {
      const result = await cameraRef.current.recordAsync({ maxDuration });
      if (result?.uri) {
        console.log('Recorded:', result.uri);
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

  const stopRecording = () => {
    cameraRef.current?.stopRecording();
  };

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
          {audio && (
            <TouchableOpacity style={styles.chip} onPress={onChangeSong} disabled={recording}>
              <Text style={styles.chipText} numberOfLines={1}>🎵 {audio.name}</Text>
            </TouchableOpacity>
          )}
          {!audio && (
            <TouchableOpacity style={styles.chip} onPress={onChangeSong} disabled={recording}>
              <Text style={styles.chipText}>+ Add song</Text>
            </TouchableOpacity>
          )}
          {clips.length > 0 && (
            <TouchableOpacity style={styles.chip} onPress={onViewClips}>
              <Text style={styles.chipText}>Clips ({clips.length})</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Progress bar (only when recording with audio) */}
      {recording && segmentMs && (
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${progressPct * 100}%` }]} />
        </View>
      )}

      {/* Bottom controls */}
      <View style={styles.bottomControls}>
        {recording && (
          <Text style={styles.timerText}>
            {fmt(elapsedMs)}{segmentMs ? ` / ${fmt(segmentMs)}` : ''}
          </Text>
        )}
        <TouchableOpacity
          style={[styles.recordRing, recording && styles.recordRingActive]}
          onPress={recording ? stopRecording : startRecording}
          activeOpacity={0.8}
        >
          <View style={[styles.recordDot, recording && styles.recordDotStop]} />
        </TouchableOpacity>
        {!recording && (
          <Text style={styles.hint}>
            {segmentMs ? `Max ${fmt(segmentMs)}` : 'Tap to record'}
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

  progressBarTrack: {
    position: 'absolute',
    bottom: 155,
    left: 24,
    right: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  progressBarFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#e53e3e',
  },

  bottomControls: {
    position: 'absolute',
    bottom: 60,
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  timerText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  hint: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },

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
  recordDot: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e53e3e',
  },
  recordDotStop: {
    width: 26,
    height: 26,
    borderRadius: 5,
  },
});
