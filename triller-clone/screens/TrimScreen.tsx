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

const TRACK_H  = 72;
const HANDLE_W = 24;
const BARS     = 52;
const MIN_SEG  = 1_000;

const WAVEFORM = Array.from({ length: BARS }, (_, i) =>
  Math.max(0.08, Math.min(1, Math.sin(i * 0.38) * 0.28 + 0.52 + Math.sin(i * 1.9) * 0.22)),
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
  const sDragBase = useRef(0);
  const eDragBase = useRef(0);
  const soundRef  = useRef<Audio.Sound | null>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  tsRef.current = trimStart;
  teRef.current = trimEnd;

  useEffect(() => () => {
    timerRef.current && clearTimeout(timerRef.current);
    soundRef.current?.unloadAsync();
  }, []);

  const startPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: () => {
      sDragBase.current = (tsRef.current / durationMs) * twRef.current;
    },
    onPanResponderMove: (_, g) => {
      const tw   = twRef.current;
      const maxX = (teRef.current / durationMs) * tw - (MIN_SEG / durationMs) * tw;
      const newX = Math.max(0, Math.min(sDragBase.current + g.dx, maxX));
      tsRef.current = (newX / tw) * durationMs;
      setTrimStart(tsRef.current);
    },
  })).current;

  const endPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: () => {
      eDragBase.current = (teRef.current / durationMs) * twRef.current;
    },
    onPanResponderMove: (_, g) => {
      const tw   = twRef.current;
      const minX = (tsRef.current / durationMs) * tw + (MIN_SEG / durationMs) * tw;
      const newX = Math.max(minX, Math.min(eDragBase.current + g.dx, tw));
      teRef.current = (newX / tw) * durationMs;
      setTrimEnd(teRef.current);
    },
  })).current;

  const stopPreview = async () => {
    timerRef.current && clearTimeout(timerRef.current);
    timerRef.current = null;
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    setPreviewing(false);
  };

  const togglePreview = async () => {
    if (previewing) { await stopPreview(); return; }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
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

  const sPct   = trackWidth > 0 ? trimStart / durationMs : 0;
  const ePct   = trackWidth > 0 ? trimEnd   / durationMs : 1;
  const segMs  = trimEnd - trimStart;

  // Center each handle on its position
  const sHandleX = Math.max(0, sPct * trackWidth - HANDLE_W / 2);
  const eHandleX = Math.min(trackWidth - HANDLE_W, ePct * trackWidth - HANDLE_W / 2);

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

        {/* Waveform */}
        <View
          style={s.waveOuter}
          onLayout={e => {
            const w = e.nativeEvent.layout.width;
            twRef.current = w;
            setTrackWidth(w);
          }}
        >
          {/* Bars */}
          <View style={s.barsRow}>
            {WAVEFORM.map((h, i) => {
              const barS = (i / BARS) * durationMs;
              const barE = ((i + 1) / BARS) * durationMs;
              const inside = barS >= trimStart && barE <= trimEnd;
              return (
                <View
                  key={i}
                  style={[s.bar, { height: `${Math.round(h * 100)}%` },
                    inside ? s.barIn : s.barOut]}
                />
              );
            })}
          </View>

          {/* Dim overlays */}
          {trackWidth > 0 && <>
            <View style={[s.dim, { left: 0, width: sPct * trackWidth }]} />
            <View style={[s.dim, { left: ePct * trackWidth, right: 0 }]} />
          </>}

          {/* Handles */}
          {trackWidth > 0 && <>
            <View style={[s.handle, { left: sHandleX }]} {...startPan.panHandlers}>
              <View style={s.handleLine} />
              <View style={[s.knob, { top: -7 }]} />
              <View style={[s.knob, { bottom: -7 }]} />
            </View>
            <View style={[s.handle, { left: eHandleX }]} {...endPan.panHandlers}>
              <View style={s.handleLine} />
              <View style={[s.knob, { top: -7 }]} />
              <View style={[s.knob, { bottom: -7 }]} />
            </View>
          </>}
        </View>

        {/* Times */}
        <View style={s.timeRow}>
          <View>
            <Text style={s.timeVal}>{fmt(trimStart)}</Text>
            <Text style={s.timeLabel}>start</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={[s.timeVal, { color: c.accentGlow }]}>{fmt(segMs)}</Text>
            <Text style={s.timeLabel}>selected</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.timeVal}>{fmt(trimEnd)}</Text>
            <Text style={s.timeLabel}>end</Text>
          </View>
        </View>

        {/* Buttons row */}
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
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 24, gap: 22 },
  songName: { color: c.text, fontSize: 16, fontWeight: '600', lineHeight: 22 },
  totalDur:  { color: c.textDim, fontSize: 13, marginTop: -14 },

  waveOuter: { height: TRACK_H, position: 'relative', overflow: 'visible' },
  barsRow: {
    flexDirection: 'row', alignItems: 'center', height: TRACK_H,
    gap: 2, borderRadius: 8, overflow: 'hidden',
  },
  bar: { flex: 1, borderRadius: 2, minHeight: 3 },
  barIn:  { backgroundColor: c.accent },
  barOut: { backgroundColor: c.surface2 },
  dim: {
    position: 'absolute', top: 0, bottom: 0,
    backgroundColor: 'rgba(8,6,18,0.6)', borderRadius: 8,
  },
  handle: {
    position: 'absolute', top: -8, bottom: -8,
    width: HANDLE_W, alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  handleLine: {
    width: 2, height: TRACK_H + 16, backgroundColor: c.text, borderRadius: 2,
    ...glow(c.text, 6),
  },
  knob: {
    position: 'absolute', width: 12, height: 12, borderRadius: 6,
    backgroundColor: c.text, ...glow(c.text, 8),
  },

  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timeVal:   { color: c.text, fontSize: 16, fontWeight: '700' },
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
    backgroundColor: c.accent, paddingVertical: 16,
    borderRadius: 50, alignItems: 'center', ...glow(c.accent, 16),
  },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
