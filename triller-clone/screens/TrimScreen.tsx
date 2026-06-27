import { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  PanResponder,
} from 'react-native';
import type { AudioConfig } from '../App';

type Props = {
  audio: AudioConfig;
  onConfirm: (trimStartMs: number, trimEndMs: number) => void;
  onBack: () => void;
};

const HANDLE_W = 22;
const TRACK_H = 56;
const MIN_SEG_MS = 1_000;

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function TrimScreen({ audio, onConfirm, onBack }: Props) {
  const { durationMs } = audio;

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(durationMs);
  const [trackWidth, setTrackWidth] = useState(0);

  // Refs so PanResponder closures always read current values
  const trimStartRef = useRef(0);
  const trimEndRef = useRef(durationMs);
  const trackWidthRef = useRef(0);
  const startDragBase = useRef(0);
  const endDragBase = useRef(0);

  trimStartRef.current = trimStart;
  trimEndRef.current = trimEnd;

  const startPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startDragBase.current =
          (trimStartRef.current / durationMs) * trackWidthRef.current;
      },
      onPanResponderMove: (_, g) => {
        const tw = trackWidthRef.current;
        const maxX =
          (trimEndRef.current / durationMs) * tw -
          (MIN_SEG_MS / durationMs) * tw;
        const newX = Math.max(0, Math.min(startDragBase.current + g.dx, maxX));
        const newMs = (newX / tw) * durationMs;
        trimStartRef.current = newMs;
        setTrimStart(newMs);
      },
    }),
  ).current;

  const endPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        endDragBase.current =
          (trimEndRef.current / durationMs) * trackWidthRef.current;
      },
      onPanResponderMove: (_, g) => {
        const tw = trackWidthRef.current;
        const minX =
          (trimStartRef.current / durationMs) * tw +
          (MIN_SEG_MS / durationMs) * tw;
        const newX = Math.max(minX, Math.min(endDragBase.current + g.dx, tw));
        const newMs = (newX / tw) * durationMs;
        trimEndRef.current = newMs;
        setTrimEnd(newMs);
      },
    }),
  ).current;

  const segDuration = trimEnd - trimStart;
  const startPct = trackWidth > 0 ? trimStart / durationMs : 0;
  const endPct = trackWidth > 0 ? trimEnd / durationMs : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={16}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trim</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.songName} numberOfLines={1}>{audio.name}</Text>
        <Text style={styles.totalDuration}>Total: {fmt(durationMs)}</Text>

        {/* Time labels */}
        <View style={styles.timeRow}>
          <Text style={styles.timeLabel}>{fmt(trimStart)}</Text>
          <Text style={styles.segmentDuration}>{fmt(segDuration)} selected</Text>
          <Text style={styles.timeLabel}>{fmt(trimEnd)}</Text>
        </View>

        {/* Track */}
        <View
          style={styles.trackContainer}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            trackWidthRef.current = w;
            setTrackWidth(w);
          }}
        >
          {/* Gray background strip */}
          <View style={styles.strip} />

          {trackWidth > 0 && (
            <>
              {/* Highlighted selected region */}
              <View
                style={[
                  styles.selectedRegion,
                  {
                    left: startPct * trackWidth,
                    width: (endPct - startPct) * trackWidth,
                  },
                ]}
              />

              {/* Start handle */}
              <View
                style={[styles.handle, { left: startPct * trackWidth }]}
                {...startPan.panHandlers}
              >
                <View style={styles.handleBar} />
              </View>

              {/* End handle */}
              <View
                style={[styles.handle, { left: endPct * trackWidth - HANDLE_W }]}
                {...endPan.panHandlers}
              >
                <View style={styles.handleBar} />
              </View>
            </>
          )}
        </View>

        {/* Auto-trim button */}
        <TouchableOpacity
          style={styles.autoTrimButton}
          onPress={() =>
            Alert.alert(
              'Not Implemented',
              'Auto-trim will detect the best segment automatically. Coming soon!',
              [{ text: 'OK' }],
            )
          }
        >
          <Text style={styles.autoTrimText}>✨ Auto-trim</Text>
        </TouchableOpacity>

        {/* Confirm */}
        <TouchableOpacity
          style={styles.confirmButton}
          onPress={() => onConfirm(trimStart, trimEnd)}
        >
          <Text style={styles.confirmButtonText}>Use segment — Record →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  backText: { color: '#fff', fontSize: 16, width: 60 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 32, gap: 16 },
  songName: { color: '#fff', fontSize: 17, fontWeight: '600' },
  totalDuration: { color: '#888', fontSize: 13 },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeLabel: { color: '#fff', fontSize: 13, fontWeight: '600', width: 48 },
  segmentDuration: { color: '#aaa', fontSize: 13 },

  // Track
  trackContainer: {
    height: TRACK_H,
    marginVertical: 8,
    position: 'relative',
    justifyContent: 'center',
  },
  strip: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#444',
    top: (TRACK_H - 6) / 2,
  },
  selectedRegion: {
    position: 'absolute',
    height: 6,
    top: (TRACK_H - 6) / 2,
    backgroundColor: '#e53e3e',
    borderRadius: 3,
  },
  handle: {
    position: 'absolute',
    width: HANDLE_W,
    height: TRACK_H,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleBar: {
    width: HANDLE_W,
    height: TRACK_H,
    borderRadius: 4,
    backgroundColor: '#fff',
    opacity: 0.95,
  },

  // Buttons
  autoTrimButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#555',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  autoTrimText: { color: '#aaa', fontSize: 14 },
  confirmButton: {
    backgroundColor: '#e53e3e',
    paddingVertical: 16,
    borderRadius: 50,
    alignItems: 'center',
    marginTop: 8,
  },
  confirmButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
