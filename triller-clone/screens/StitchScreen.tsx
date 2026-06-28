import { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, SafeAreaView, Settings, Switch,
} from 'react-native';
import { Video, ResizeMode, Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import type { AVPlaybackStatusSuccess } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import { stitchVideos } from '../modules/VideoStitcherModule';
import { c, glow } from '../theme';
import type { AudioConfig, Clip } from '../App';

const SETTINGS_KEY  = 'defaultAvgClipLength';
const DEFAULT_AVG_S = 2.5;
const MIN_S = 1;
const MAX_S = 5;

type EditSegment = { clipIndex: number; startMs: number; durationMs: number };
type Phase = 'settings' | 'stitching' | 'preview' | 'error';

type Props = { clips: Clip[]; audio: AudioConfig | null; onBack: () => void };

// Chronological plan: each segment plays from the correct position in the song
function buildPlan(clipCount: number, totalMs: number, avgMs: number): EditSegment[] {
  const segments: EditSegment[] = [];
  let currentMs = 0;
  while (currentMs < totalMs) {
    const remaining = totalMs - currentMs;
    const lo  = avgMs * 0.6;
    const hi  = avgMs * 1.4;
    const dur = Math.min(lo + Math.random() * (hi - lo), remaining);
    segments.push({
      clipIndex: Math.floor(Math.random() * clipCount),
      startMs:   Math.round(currentMs),   // chronological position in the song
      durationMs: Math.round(dur),
    });
    currentMs += dur;
  }
  return segments;
}

export function StitchScreen({ clips, audio, onBack }: Props) {
  const totalMs = audio ? audio.trimEndMs - audio.trimStartMs : clips.length * 3000;

  const [avgS, setAvgS] = useState<number>(() => {
    const v = Settings.get(SETTINGS_KEY);
    return typeof v === 'number' && v > 0 ? v : DEFAULT_AVG_S;
  });
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [phase,      setPhase]      = useState<Phase>('settings');
  const [outputUri,  setOutputUri]  = useState<string | null>(null);
  const [errorMsg,   setErrorMsg]   = useState('');
  const [saving,     setSaving]     = useState(false);
  const [isPlaying,  setIsPlaying]  = useState(false);
  const videoRef = useRef<Video>(null);

  const safeAvgS = typeof avgS === 'number' && avgS > 0 ? avgS : DEFAULT_AVG_S;

  const proceedToStitch = () => {
    if (saveAsDefault) Settings.set({ [SETTINGS_KEY]: safeAvgS });
    runStitch(safeAvgS);
  };

  const runStitch = async (avgSeconds: number) => {
    setPhase('stitching');
    setOutputUri(null);
    setIsPlaying(false);
    try {
      const plan = buildPlan(clips.length, totalMs, avgSeconds * 1000);
      const uri  = await stitchVideos(
        plan.map(seg => ({ uri: clips[seg.clipIndex].videoUri, startMs: seg.startMs, durationMs: seg.durationMs })),
        audio?.uri ?? null,
        audio?.trimStartMs ?? 0,
        audio?.trimEndMs   ?? 0,
      );
      setOutputUri(uri);
      setPhase('preview');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Unknown error');
      setPhase('error');
    }
  };

  const play = async () => {
    if (!outputUri) return;
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, interruptionModeIOS: InterruptionModeIOS.DuckOthers, interruptionModeAndroid: InterruptionModeAndroid.DuckOthers });
    await videoRef.current?.setPositionAsync(0);
    await videoRef.current?.playAsync();
    setIsPlaying(true);
  };

  const pause = async () => { await videoRef.current?.pauseAsync(); setIsPlaying(false); };

  const saveToRoll = async () => {
    if (!outputUri) return;
    setSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission denied', 'Camera roll access required.'); return; }
      await MediaLibrary.saveToLibraryAsync(outputUri.startsWith('file://') ? outputUri.slice(7) : outputUri);
      Alert.alert('Saved!', 'Stitched video saved to Camera Roll.');
    } catch { Alert.alert('Error', 'Could not save.'); }
    finally { setSaving(false); }
  };

  // ── Settings ──────────────────────────────────────────────────────
  if (phase === 'settings') {
    const savedVal = Settings.get(SETTINGS_KEY);
    const hasSaved = typeof savedVal === 'number' && savedVal > 0;

    return (
      <SafeAreaView style={s.screen}>
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} hitSlop={16}>
            <Text style={s.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Cut Length</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={s.body}>
          <Text style={s.label}>Average seconds per clip</Text>
          <Text style={s.sub}>Each cut varies ±40% around this</Text>

          <View style={s.stepper}>
            <TouchableOpacity
              style={[s.stepBtn, safeAvgS <= MIN_S && s.stepBtnDim]}
              onPress={() => setAvgS(v => Math.max(MIN_S, Math.round(((typeof v === 'number' ? v : DEFAULT_AVG_S) - 0.5) * 10) / 10))}
              disabled={safeAvgS <= MIN_S}
            >
              <Text style={s.stepBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={s.stepVal}>{safeAvgS.toFixed(1)}s</Text>
            <TouchableOpacity
              style={[s.stepBtn, safeAvgS >= MAX_S && s.stepBtnDim]}
              onPress={() => setAvgS(v => Math.min(MAX_S, Math.round(((typeof v === 'number' ? v : DEFAULT_AVG_S) + 0.5) * 10) / 10))}
              disabled={safeAvgS >= MAX_S}
            >
              <Text style={s.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          <View style={s.presets}>
            {[1, 2, 2.5, 3, 5].map(n => (
              <TouchableOpacity
                key={n}
                style={[s.preset, safeAvgS === n && s.presetActive]}
                onPress={() => setAvgS(n)}
              >
                <Text style={[s.presetText, safeAvgS === n && s.presetTextActive]}>{n}s</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.defaultRow}>
            <View>
              <Text style={s.defaultLabel}>Save as default</Text>
              <Text style={s.defaultSub}>Skip this menu next time</Text>
            </View>
            <Switch value={saveAsDefault} onValueChange={setSaveAsDefault} trackColor={{ true: c.accent }} thumbColor={saveAsDefault ? c.accentGlow : c.textMuted} />
          </View>

          {hasSaved && (
            <Text style={s.savedNote}>Saved default: {(savedVal as number).toFixed(1)}s</Text>
          )}

          <TouchableOpacity style={s.stitchBtn} onPress={proceedToStitch}>
            <Text style={s.stitchBtnText}>✂  Stitch Now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Stitching ─────────────────────────────────────────────────────
  if (phase === 'stitching') {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={c.accent} />
        <Text style={s.loadingText}>Stitching {clips.length} clips…</Text>
        <Text style={s.loadingSub}>~{safeAvgS}s cuts · {Math.round(totalMs / 1000)}s total</Text>
      </View>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <SafeAreaView style={s.center}>
        <Text style={s.errText}>Stitch failed</Text>
        <Text style={s.errDetail}>{errorMsg}</Text>
        <TouchableOpacity style={{ marginTop: 16 }} onPress={() => setPhase('settings')}>
          <Text style={s.back}>← Try again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Preview ───────────────────────────────────────────────────────
  return (
    <View style={s.playerScreen}>
      <Video
        ref={videoRef}
        source={{ uri: outputUri! }}
        style={s.playerVideo}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={false}
        onPlaybackStatusUpdate={st => {
          if ((st as AVPlaybackStatusSuccess).isLoaded && (st as AVPlaybackStatusSuccess).didJustFinish) setIsPlaying(false);
        }}
      />
      <TouchableOpacity style={s.playOverlay} onPress={isPlaying ? pause : play} activeOpacity={0.7}>
        {!isPlaying && <Text style={s.playIcon}>▶</Text>}
      </TouchableOpacity>

      <SafeAreaView style={s.playerTopSafe}>
        <View style={s.playerTopRow}>
          <TouchableOpacity style={s.iconBtn} onPress={onBack}>
            <Text style={s.iconBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={s.playerTitle}>Preview</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <View style={s.bottomBar}>
        <TouchableOpacity onPress={() => setPhase('settings')}>
          <Text style={s.changeText}>✂ {safeAvgS}s cuts · change</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.saveBtn, saving && s.saveBtnDim]}
          onPress={saveToRoll}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>⬇  Save to Camera Roll</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => runStitch(safeAvgS)} style={{ alignItems: 'center' }}>
          <Text style={s.retryText}>↺  Re-stitch</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border,
  },
  back: { color: c.textMuted, fontSize: 15, width: 60 },
  headerTitle: { color: c.text, fontSize: 17, fontWeight: '700' },
  body: { flex: 1, padding: 24, gap: 22 },
  label: { color: c.text, fontSize: 20, fontWeight: '700' },
  sub:   { color: c.textDim, fontSize: 13, marginTop: -14 },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 28 },
  stepBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnDim: { opacity: 0.3 },
  stepBtnText: { color: c.text, fontSize: 26, fontWeight: '300' },
  stepVal: { color: c.text, fontSize: 38, fontWeight: '800', minWidth: 90, textAlign: 'center', ...glow(c.accentGlow, 12) },

  presets: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  preset: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border,
  },
  presetActive: { backgroundColor: c.accentLo, borderColor: c.accent, ...glow(c.accent, 10) },
  presetText: { color: c.textMuted, fontSize: 14 },
  presetTextActive: { color: c.text, fontWeight: '700' },

  defaultRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: c.surface2, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: c.border,
  },
  defaultLabel: { color: c.text, fontSize: 15, fontWeight: '600' },
  defaultSub:   { color: c.textDim, fontSize: 12, marginTop: 2 },
  savedNote:    { color: c.textDim, fontSize: 12 },

  stitchBtn: {
    backgroundColor: c.accent, paddingVertical: 16, borderRadius: 50, alignItems: 'center',
    ...glow(c.accent, 18),
  },
  stitchBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, gap: 12, padding: 32 },
  loadingText: { color: c.text, fontSize: 18, fontWeight: '700' },
  loadingSub:  { color: c.textDim, fontSize: 14 },
  errText:     { color: c.record, fontSize: 22, fontWeight: '800' },
  errDetail:   { color: c.textMuted, fontSize: 13, textAlign: 'center' },

  playerScreen: { flex: 1, backgroundColor: '#000' },
  playerVideo: { flex: 1 },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playIcon: { fontSize: 72, color: 'rgba(240,235,255,0.85)' },
  playerTopSafe: { position: 'absolute', top: 0, left: 0, right: 0 },
  playerTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(8,6,18,0.65)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.border,
  },
  iconBtnText: { color: c.text, fontSize: 15 },
  playerTitle: { color: c.text, fontSize: 16, fontWeight: '700' },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(8,6,18,0.85)', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 42, gap: 14,
    borderTopWidth: 1, borderTopColor: c.border,
  },
  changeText: { color: c.textMuted, fontSize: 13 },
  saveBtn: {
    backgroundColor: c.accent, paddingVertical: 15, borderRadius: 50,
    alignItems: 'center', minHeight: 50, justifyContent: 'center', ...glow(c.accent, 16),
  },
  saveBtnDim: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  retryText: { color: c.textDim, fontSize: 13 },
});
