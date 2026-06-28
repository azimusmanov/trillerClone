import { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { CameraView, CameraType } from 'expo-camera';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { c, glow } from '../theme';
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
  const [facing, setFacing]       = useState<CameraType>('back');
  const [elapsedMs, setElapsedMs] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const soundRef  = useRef<Audio.Sound | null>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const segmentMs = audio ? audio.trimEndMs - audio.trimStartMs : null;

  useEffect(() => () => {
    timerRef.current && clearInterval(timerRef.current);
    soundRef.current?.unloadAsync();
  }, []);

  const startRecording = async () => {
    if (clips.length >= MAX_CLIPS) {
      Alert.alert('Clip Limit', `Max ${MAX_CLIPS} clips. Delete some to record more.`);
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
      const { sound } = await Audio.Sound.createAsync({ uri: audio.uri }, { shouldPlay: false });
      await sound.setPositionAsync(audio.trimStartMs);
      await sound.playAsync();
      soundRef.current = sound;
    }

    setElapsedMs(0);
    setRecording(true);
    timerRef.current = setInterval(() => setElapsedMs(p => p + 100), 100);

    try {
      const result = await cameraRef.current.recordAsync({
        maxDuration: segmentMs ? segmentMs / 1000 : undefined,
      });
      if (result?.uri) onClipRecorded(result.uri);
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
  const flipCamera    = () => setFacing(p => p === 'back' ? 'front' : 'back');

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const pct = segmentMs ? Math.min(elapsedMs / segmentMs, 1) : 0;

  return (
    <View style={s.container}>
      <CameraView ref={cameraRef} style={s.camera} mode="video" facing={facing} />

      {/* Vignette overlay */}
      <View style={s.vignette} pointerEvents="none" />

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={flipCamera} disabled={recording}>
          <Text style={s.iconBtnText}>⟳</Text>
        </TouchableOpacity>
        <View style={s.topRight}>
          <TouchableOpacity style={s.chip} onPress={onChangeSong} disabled={recording}>
            <Text style={s.chipText} numberOfLines={1}>
              {audio ? `♪ ${audio.name}` : '+ Add song'}
            </Text>
          </TouchableOpacity>
          {clips.length > 0 && (
            <TouchableOpacity style={s.chip} onPress={onViewClips}>
              <Text style={s.chipText}>Clips {clips.length}/{MAX_CLIPS}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Progress bar */}
      {recording && segmentMs && (
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${pct * 100}%` }]} />
        </View>
      )}

      {/* Bottom controls */}
      <View style={s.bottomControls}>
        {recording && (
          <Text style={s.timer}>
            {fmt(elapsedMs)}{segmentMs ? ` / ${fmt(segmentMs)}` : ''}
          </Text>
        )}

        <View style={s.btnRow}>
          {clips.length > 0 && !recording && (
            <TouchableOpacity style={s.stitchBtn} onPress={onStitch}>
              <Text style={s.stitchIcon}>✂</Text>
              <Text style={s.stitchLabel}>Stitch</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[s.recordRing, recording && s.recordRingActive]}
            onPress={recording ? stopRecording : startRecording}
            activeOpacity={0.85}
          >
            <View style={[s.recordDot, recording && s.recordDotStop]} />
          </TouchableOpacity>

          {clips.length > 0 && !recording && <View style={{ width: 56 }} />}
        </View>

        {!recording && (
          <Text style={s.hint}>
            {segmentMs ? `Max ${fmt(segmentMs)} per clip` : 'Tap to record'}
          </Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderWidth: 0,
    // dark edge vignette
    shadowColor: '#000',
    shadowRadius: 80,
    shadowOpacity: 1,
    shadowOffset: { width: 0, height: 0 },
  },

  topBar: {
    position: 'absolute', top: 56, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(8,6,18,0.6)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.border,
  },
  iconBtnText: { fontSize: 20, color: c.text },
  topRight: { gap: 8, alignItems: 'flex-end' },
  chip: {
    backgroundColor: 'rgba(8,6,18,0.65)',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, maxWidth: 200,
    borderWidth: 1, borderColor: c.border,
  },
  chipText: { color: c.text, fontSize: 12, fontWeight: '600' },

  progressTrack: {
    position: 'absolute', bottom: 158, left: 24, right: 24,
    height: 2, borderRadius: 2, backgroundColor: 'rgba(139,92,246,0.2)',
  },
  progressFill: { height: 2, borderRadius: 2, backgroundColor: c.accent, ...glow(c.accent, 8) },

  bottomControls: {
    position: 'absolute', bottom: 48, width: '100%', alignItems: 'center', gap: 14,
  },
  timer: { color: c.text, fontSize: 15, fontWeight: '600' },
  hint:  { color: c.textDim, fontSize: 12 },

  btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36 },

  recordRing: {
    width: 74, height: 74, borderRadius: 37, borderWidth: 3, borderColor: c.text,
    alignItems: 'center', justifyContent: 'center',
  },
  recordRingActive: { borderColor: c.record, ...glow(c.record, 20) },
  recordDot: { width: 54, height: 54, borderRadius: 27, backgroundColor: c.record, ...glow(c.record, 16) },
  recordDotStop: { width: 26, height: 26, borderRadius: 5 },

  stitchBtn: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(139,92,246,0.15)', borderWidth: 1.5, borderColor: c.accent,
    ...glow(c.accent, 10), gap: 2,
  },
  stitchIcon:  { fontSize: 18, color: c.accentGlow },
  stitchLabel: { fontSize: 9, color: c.accentGlow, fontWeight: '700' },
});
