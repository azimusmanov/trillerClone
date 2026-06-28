import { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, SafeAreaView, PanResponder } from 'react-native';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { c, glow } from '../theme';
import type { AudioConfig } from '../App';

type Props = {
  audio: AudioConfig;
  onConfirm: (trimStartMs: number, trimEndMs: number) => void;
  onBack: () => void;
};

const TRACK_H  = 64;
const HANDLE_W = 20;   // visual width
const HIT_W    = 44;   // touch target width
const BARS     = 50;
const MIN_SEG  = 1_000;

// Stable pseudo-waveform
const WAVEFORM = Array.from({ length: BARS }, (_, i) =>
  Math.max(0.06, Math.min(1, Math.abs(Math.sin(i * 0.41)) * 0.55 + Math.abs(Math.sin(i * 1.7)) * 0.4 + 0.08)),
);

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function TrimScreen({ audio, onConfirm, onBack }: Props) {
  const { durationMs } = audio;
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd,   setTrimEnd]   = useState(durationMs);
  const [trackWidth, setTrackWidth] = useState(0);
  const [previewing, setPreviewing] = useState(false);

  const tsRef  = useRef(0);
  const teRef  = useRef(durationMs);
  const twRef  = useRef(0);
  const sBase  = useRef(0);
  const eBase  = useRef(0);
  const soundRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  tsRef.current = trimStart;
  teRef.current = trimEnd;

  useEffect(() => () => {
    timerRef.current && clearTimeout(timerRef.current);
    soundRef.current?.unloadAsync();
  }, []);

  const stopPreview = () => {
    timerRef.current && clearTimeout(timerRef.current);
    timerRef.current = null;
    soundRef.current?.stopAsync().catch(() => {});
    soundRef.current?.unloadAsync().catch(() => {});
    soundRef.current = null;
    setPreviewing(false);
  };

  const startPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: () => {
      stopPreview(); // stop audio when user grabs a handle
      sBase.current = (tsRef.current / durationMs) * twRef.current;
    },
    onPanResponderMove: (_, g) => {
      const tw   = twRef.current;
      const maxX = (teRef.current / durationMs) * tw - (MIN_SEG / durationMs) * tw;
      const newX = Math.max(0, Math.min(sBase.current + g.dx, maxX));
      tsRef.current = (newX / tw) * durationMs;
      setTrimStart(tsRef.current);
    },
  })).current;

  const endPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: () => {
      stopPreview();
      eBase.current = (teRef.current / durationMs) * twRef.current;
    },
    onPanResponderMove: (_, g) => {
      const tw   = twRef.current;
      const minX = (tsRef.current / durationMs) * tw + (MIN_SEG / durationMs) * tw;
      const newX = Math.max(minX, Math.min(eBase.current + g.dx, tw));
      teRef.current = (newX / tw) * durationMs;
      setTrimEnd(teRef.current);
    },
  })).current;

  const togglePreview = async () => {
    if (previewing) { stopPreview(); return; }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false, playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    });
    const { sound } = await Audio.Sound.createAsync({ uri: audio.uri }, { shouldPlay: false });
    soundRef.current = sound;
    await sound.setPositionAsync(tsRef.current);
    await sound.playAsync();
    setPreviewing(true);
    timerRef.current = setTimeout(stopPreview, teRef.current - tsRef.current);
  };

  const sPct  = trackWidth > 0 ? trimStart / durationMs : 0;
  const ePct  = trackWidth > 0 ? trimEnd   / durationMs : 1;
  const segMs = trimEnd - trimStart;

  // Center handles on their positions, clamped to track bounds
  const sX = Math.max(0, sPct * trackWidth - HANDLE_W / 2);
  const eX = Math.min(trackWidth - HANDLE_W, ePct * trackWidth - HANDLE_W / 2);

  // Hit areas centered on handles (wider for easy grabbing)
  const sHitX = Math.max(0, sPct * trackWidth - HIT_W / 2);
  const eHitX = Math.min(trackWidth - HIT_W, ePct * trackWidth - HIT_W / 2);

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} hitSlop={16}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Trim</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={s.body}>
        <Text style={s.songName} numberOfLines={2}>{audio.name}</Text>
        <Text style={s.totalDur}>Total: {fmt(durationMs)}</Text>

        {/* Waveform track */}
        <View
          style={s.waveOuter}
          onLayout={e => {
            const w = e.nativeEvent.layout.width;
            twRef.current = w;
            setTrackWidth(w);
          }}
        >
          {/* Bars */}
          <View style={s.barsRow} pointerEvents="none">
            {WAVEFORM.map((h, i) => {
              const bS = (i / BARS) * durationMs;
              const bE = ((i + 1) / BARS) * durationMs;
              const inside = bS >= trimStart && bE <= trimEnd;
              return (
                <View
                  key={i}
                  style={[s.bar, { height: `${Math.round(h * 100)}%` }, inside ? s.barIn : s.barOut]}
                />
              );
            })}
          </View>

          {/* Dim overlays outside selection */}
          {trackWidth > 0 && <>
            <View style={[s.dim, { left: 0, width: sPct * trackWidth }]} pointerEvents="none" />
            <View style={[s.dim, { left: ePct * trackWidth, right: 0 }]} pointerEvents="none" />
          </>}

          {/* START handle — accent/purple, left bracket */}
          {trackWidth > 0 && (
            <View
              style={[s.hitArea, { left: sHitX }]}
              {...startPan.panHandlers}
            >
              <View style={[s.handleBar, s.handleBarStart, { left: HANDLE_W / 2 - 1 }]} />
              <View style={[s.handleCap, s.handleCapTop, s.handleCapStart, { left: HANDLE_W / 2 - 8 }]} />
              <View style={[s.handleCap, s.handleCapBot, s.handleCapStart, { left: HANDLE_W / 2 - 8 }]} />
            </View>
          )}

          {/* END handle — white, right bracket */}
          {trackWidth > 0 && (
            <View
              style={[s.hitArea, { left: eHitX }]}
              {...endPan.panHandlers}
            >
              <View style={[s.handleBar, s.handleBarEnd, { left: HANDLE_W / 2 - 1 }]} />
              <View style={[s.handleCap, s.handleCapTop, s.handleCapEnd, { left: HANDLE_W / 2 - 8 }]} />
              <View style={[s.handleCap, s.handleCapBot, s.handleCapEnd, { left: HANDLE_W / 2 - 8 }]} />
            </View>
          )}
        </View>

        {/* Handle legend */}
        <View style={s.legend}>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: c.accent }]} />
            <Text style={s.legendText}>Start</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: c.text }]} />
            <Text style={s.legendText}>End</Text>
          </View>
        </View>

        {/* Times */}
        <View style={s.timeRow}>
          <View>
            <Text style={[s.timeVal, { color: c.accentGlow }]}>{fmt(trimStart)}</Text>
            <Text style={s.timeLabel}>start</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={s.timeVal}>{fmt(segMs)}</Text>
            <Text style={s.timeLabel}>selected</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.timeVal}>{fmt(trimEnd)}</Text>
            <Text style={s.timeLabel}>end</Text>
          </View>
        </View>

        {/* Buttons */}
        <View style={s.btnRow}>
          <TouchableOpacity
            style={[s.actionBtn, previewing && s.actionBtnActive]}
            onPress={togglePreview}
          >
            <Text style={[s.actionBtnText, previewing && s.actionBtnTextActive]}>
              {previewing ? '⏹  Stop' : '▶  Preview'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => Alert.alert('Not Implemented', 'Auto-trim coming soon!')}
          >
            <Text style={s.actionBtnText}>✨  Auto-trim</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={s.confirmBtn}
          onPress={() => { stopPreview(); onConfirm(trimStart, trimEnd); }}
        >
          <Text style={s.confirmBtnText}>Use segment — Record →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 24, gap: 20 },
  songName: { color: c.text, fontSize: 16, fontWeight: '600', lineHeight: 22 },
  totalDur:  { color: c.textDim, fontSize: 13, marginTop: -12 },

  waveOuter: { height: TRACK_H, position: 'relative', overflow: 'visible', marginVertical: 4 },
  barsRow: {
    flexDirection: 'row', alignItems: 'center', height: TRACK_H,
    borderRadius: 8, overflow: 'hidden',
    backgroundColor: c.surface,
  },
  bar:    { flex: 1, borderRadius: 1, minHeight: 2, marginHorizontal: 1 },
  barIn:  { backgroundColor: c.accent },
  barOut: { backgroundColor: c.surface2 },
  dim:    { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(8,6,18,0.65)', borderRadius: 8 },

  // Hit area — wide, transparent, centered on handle position
  hitArea: {
    position: 'absolute', top: -8, bottom: -8,
    width: HIT_W, zIndex: 20,
  },
  // Visual bar inside hit area
  handleBar: {
    position: 'absolute', top: 0, bottom: 0, width: 3, borderRadius: 2,
  },
  handleBarStart: { backgroundColor: c.accent, ...glow(c.accent, 8) },
  handleBarEnd:   { backgroundColor: c.text,   ...glow(c.text, 6) },
  // Top and bottom caps (circles)
  handleCap: {
    position: 'absolute', width: 14, height: 14, borderRadius: 7,
  },
  handleCapTop: { top: -8 },
  handleCapBot: { bottom: -8 },
  handleCapStart: { backgroundColor: c.accent, ...glow(c.accent, 8) },
  handleCapEnd:   { backgroundColor: c.text },

  legend: { flexDirection: 'row', gap: 16, marginTop: -8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: c.textDim, fontSize: 11 },

  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  timeVal:   { color: c.text, fontSize: 17, fontWeight: '700' },
  timeLabel: { color: c.textDim, fontSize: 10, textTransform: 'uppercase', marginTop: 2 },

  btnRow: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 50, alignItems: 'center',
    backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border,
  },
  actionBtnActive: { backgroundColor: c.text, borderColor: c.text },
  actionBtnText: { color: c.textMuted, fontSize: 14, fontWeight: '600' },
  actionBtnTextActive: { color: c.bg },

  confirmBtn: {
    backgroundColor: c.accent, paddingVertical: 16, borderRadius: 50,
    alignItems: 'center', ...glow(c.accent, 16),
  },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
