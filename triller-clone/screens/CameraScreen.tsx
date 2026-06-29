import { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { CameraView, CameraType } from 'expo-camera';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { c, glow } from '../theme';
import { stitchVideos } from '../modules/VideoStitcherModule';
import type { AudioConfig, Clip } from '../App';

const MAX_CLIPS = 10;
const COUNTDOWN_S = 3;

type RecordState = 'idle' | 'countdown' | 'recording' | 'processing';

type Props = {
  audio: AudioConfig | null;
  clips: Clip[];
  onClipRecorded: (videoUri: string, previewUri: string | null) => void;
  onChangeSong: () => void;
  onViewClips: () => void;
  onStitch: () => void;
};

export function CameraScreen({ audio, clips, onClipRecorded, onChangeSong, onViewClips, onStitch }: Props) {
  const [recordState, setRecordState] = useState<RecordState>('idle');
  const [countdown,   setCountdown]   = useState(COUNTDOWN_S);
  const [facing,      setFacing]      = useState<CameraType>('front');
  const [elapsedMs,   setElapsedMs]   = useState(0);
  const cameraRef  = useRef<CameraView>(null);
  const soundRef   = useRef<Audio.Sound | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelRef  = useRef(false);

  const segmentMs = audio ? audio.trimEndMs - audio.trimStartMs : null;

  useEffect(() => () => {
    timerRef.current && clearInterval(timerRef.current);
    soundRef.current?.unloadAsync();
  }, []);

  const cleanupSound = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
  };

  const beginCountdownAndRecord = async () => {
    if (clips.length >= MAX_CLIPS) {
      Alert.alert('Clip Limit', `Max ${MAX_CLIPS} clips. Delete some to record more.`);
      return;
    }
    if (!cameraRef.current) return;

    cancelRef.current = false;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    });

    // Start audio COUNTDOWN_S seconds before trimStart so audio is at
    // trimStart exactly when recording fires — guaranteed sync every clip
    if (audio?.uri) {
      const { sound } = await Audio.Sound.createAsync({ uri: audio.uri }, { shouldPlay: false });
      await sound.setPositionAsync(Math.max(0, audio.trimStartMs - COUNTDOWN_S * 1000));
      soundRef.current = sound;
      await sound.playAsync();
    }

    setCountdown(COUNTDOWN_S);
    setRecordState('countdown');

    for (let i = COUNTDOWN_S - 1; i >= 0; i--) {
      await new Promise<void>(r => setTimeout(r, 1000));
      if (cancelRef.current) return;
      setCountdown(i);
    }
    if (cancelRef.current) return;

    // GO — camera is warm, audio is at trimStart
    setElapsedMs(0);
    setRecordState('recording');
    timerRef.current = setInterval(() => setElapsedMs(p => p + 100), 100);

    let videoUri: string | null = null;
    try {
      const result = await cameraRef.current.recordAsync({
        maxDuration: segmentMs ? segmentMs / 1000 : undefined,
      });
      videoUri = result?.uri ?? null;
    } finally {
      timerRef.current && clearInterval(timerRef.current);
      timerRef.current = null;
      await cleanupSound();
      setElapsedMs(0);
    }

    if (!videoUri) { setRecordState('idle'); return; }

    setRecordState('processing');
    let previewUri: string | null = null;
    if (audio?.uri) {
      try {
        // Reuse stitch with one segment to bake audio into clip — avoids JS sync issues on playback
        previewUri = await stitchVideos(
          [{ uri: videoUri, startMs: 0, durationMs: 999_000 }],
          audio.uri,
          audio.trimStartMs,
          audio.trimEndMs,
        );
      } catch (e) {
        console.warn('clip preview failed:', e);
      }
    }

    onClipRecorded(videoUri, previewUri);
    setRecordState('idle');
  };

  const cancelCountdown = async () => {
    cancelRef.current = true;
    await cleanupSound();
    setRecordState('idle');
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

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={flipCamera} disabled={recordState !== 'idle'}>
          <Text style={s.iconBtnText}>⟳</Text>
        </TouchableOpacity>
        <View style={s.topRight}>
          <TouchableOpacity style={s.chip} onPress={onChangeSong} disabled={recordState !== 'idle'}>
            <Text style={s.chipText} numberOfLines={1}>
              {audio ? `♪ ${audio.name}` : '+ Add song'}
            </Text>
          </TouchableOpacity>
          {clips.length > 0 && (
            <TouchableOpacity style={s.chip} onPress={onViewClips} disabled={recordState !== 'idle'}>
              <Text style={s.chipText}>Clips {clips.length}/{MAX_CLIPS}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Progress bar */}
      {recordState === 'recording' && segmentMs && (
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${pct * 100}%` }]} />
        </View>
      )}

      {/* Countdown overlay */}
      {recordState === 'countdown' && (
        <View style={s.countdownOverlay} pointerEvents="box-none">
          <Text style={s.countdownNumber}>{countdown === 0 ? 'GO' : countdown}</Text>
          <Text style={s.countdownSub}>{audio ? 'Feel the beat' : 'Get ready'}</Text>
        </View>
      )}

      {/* Processing overlay */}
      {recordState === 'processing' && (
        <View style={s.processingOverlay}>
          <ActivityIndicator size="large" color={c.accent} />
          <Text style={s.processingText}>Syncing audio…</Text>
        </View>
      )}

      {/* Bottom controls */}
      <View style={s.bottomControls}>
        {recordState === 'recording' && (
          <Text style={s.timer}>
            {fmt(elapsedMs)}{segmentMs ? ` / ${fmt(segmentMs)}` : ''}
          </Text>
        )}

        <View style={s.btnRow}>
          {clips.length > 0 && recordState === 'idle' && (
            <TouchableOpacity style={s.stitchBtn} onPress={onStitch}>
              <Text style={s.stitchIcon}>✂</Text>
              <Text style={s.stitchLabel}>Stitch</Text>
            </TouchableOpacity>
          )}

          {recordState === 'idle' && (
            <TouchableOpacity style={s.recordRing} onPress={beginCountdownAndRecord} activeOpacity={0.85}>
              <View style={s.recordDot} />
            </TouchableOpacity>
          )}
          {recordState === 'countdown' && (
            <TouchableOpacity style={s.cancelBtn} onPress={cancelCountdown}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
          {recordState === 'recording' && (
            <TouchableOpacity style={[s.recordRing, s.recordRingActive]} onPress={stopRecording} activeOpacity={0.85}>
              <View style={[s.recordDot, s.recordDotStop]} />
            </TouchableOpacity>
          )}

          {clips.length > 0 && recordState === 'idle' && <View style={{ width: 56 }} />}
        </View>

        {recordState === 'idle' && (
          <Text style={s.hint}>
            {segmentMs ? `${COUNTDOWN_S}s countdown · max ${fmt(segmentMs)}` : `${COUNTDOWN_S}s countdown`}
          </Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
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
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(8,6,18,0.45)',
  },
  countdownNumber: { fontSize: 120, fontWeight: '900', color: c.text, ...glow(c.text, 30) },
  countdownSub: { color: c.textMuted, fontSize: 16, marginTop: -8 },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(8,6,18,0.75)', gap: 14,
  },
  processingText: { color: c.text, fontSize: 16, fontWeight: '600' },
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
  cancelBtn: {
    paddingHorizontal: 32, paddingVertical: 18, borderRadius: 50,
    borderWidth: 1.5, borderColor: c.textMuted, backgroundColor: 'rgba(8,6,18,0.6)',
  },
  cancelText: { color: c.textMuted, fontSize: 15, fontWeight: '600' },
  stitchBtn: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(139,92,246,0.15)', borderWidth: 1.5, borderColor: c.accent,
    ...glow(c.accent, 10), gap: 2,
  },
  stitchIcon:  { fontSize: 18, color: c.accentGlow },
  stitchLabel: { fontSize: 9, color: c.accentGlow, fontWeight: '700' },
});
