import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Video, ResizeMode, Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import type { AVPlaybackStatusSuccess } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import { stitchVideos } from '../modules/VideoStitcherModule';
import type { AudioConfig, Clip } from '../App';

type EditSegment = { clipIndex: number; durationMs: number };

type Phase = 'building' | 'stitching' | 'preview' | 'error';

type Props = {
  clips: Clip[];
  audio: AudioConfig | null;
  onBack: () => void;
};

function buildPlan(clipCount: number, totalMs: number): EditSegment[] {
  const segments: EditSegment[] = [];
  let filled = 0;
  while (filled < totalMs) {
    const remaining = totalMs - filled;
    const dur = Math.min(2000 + Math.random() * 3000, remaining);
    segments.push({ clipIndex: Math.floor(Math.random() * clipCount), durationMs: Math.round(dur) });
    filled += dur;
  }
  return segments;
}

export function StitchScreen({ clips, audio, onBack }: Props) {
  const totalMs = audio ? audio.trimEndMs - audio.trimStartMs : clips.length * 3000;
  const plan = useRef<EditSegment[]>(buildPlan(clips.length, totalMs)).current;

  const [phase, setPhase] = useState<Phase>('building');
  const [outputUri, setOutputUri] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<Video>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    runStitch();
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  const runStitch = async () => {
    setPhase('stitching');
    try {
      const segments = plan.map((seg) => ({
        uri: clips[seg.clipIndex].videoUri,
        durationMs: seg.durationMs,
      }));

      const uri = await stitchVideos(
        segments,
        audio?.uri ?? null,
        audio?.trimStartMs ?? 0,
        audio?.trimEndMs ?? 0,
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

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    });

    await videoRef.current?.setPositionAsync(0);
    await videoRef.current?.playAsync();
    setIsPlaying(true);
  };

  const pause = async () => {
    await videoRef.current?.pauseAsync();
    setIsPlaying(false);
  };

  const saveToRoll = async () => {
    if (!outputUri) return;
    setSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Camera roll access is required to save.');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(outputUri.replace('file://', ''));
      Alert.alert('Saved!', 'Stitched video saved to your Camera Roll.');
    } catch {
      Alert.alert('Error', 'Could not save the video.');
    } finally {
      setSaving(false);
    }
  };

  // ── Building plan ─────────────────────────────────────────────────
  if (phase === 'building') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#e53e3e" />
        <Text style={styles.loadingText}>Planning edit…</Text>
      </View>
    );
  }

  // ── Stitching ─────────────────────────────────────────────────────
  if (phase === 'stitching') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#e53e3e" />
        <Text style={styles.loadingText}>Stitching {clips.length} clips…</Text>
        <Text style={styles.loadingSubtext}>
          {plan.length} cuts · {Math.round(totalMs / 1000)}s
        </Text>
      </View>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>Stitch failed</Text>
        <Text style={styles.errorDetail}>{errorMsg}</Text>
        <TouchableOpacity style={styles.ghostBtn} onPress={onBack}>
          <Text style={styles.ghostBtnText}>← Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Preview player ────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Video
        ref={videoRef}
        source={{ uri: outputUri! }}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={false}
        onPlaybackStatusUpdate={(s) => {
          const st = s as AVPlaybackStatusSuccess;
          if (st.isLoaded && st.didJustFinish) setIsPlaying(false);
        }}
      />

      {/* Play / pause tap area */}
      <TouchableOpacity
        style={styles.playOverlay}
        onPress={isPlaying ? pause : play}
        activeOpacity={0.7}
      >
        {!isPlaying && <Text style={styles.playIcon}>▶</Text>}
      </TouchableOpacity>

      {/* Top bar */}
      <SafeAreaView style={styles.topSafe}>
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.iconBtn} onPress={onBack}>
            <Text style={styles.iconBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>Preview</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {/* Bottom actions */}
      <View style={styles.bottomBar}>
        <Text style={styles.doneLabel}>
          {plan.length} cuts · {Math.round(totalMs / 1000)}s
          {audio ? ` · ${audio.name}` : ''}
        </Text>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={saveToRoll}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>⬇  Save to Camera Roll</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={styles.retryBtn} onPress={runStitch}>
          <Text style={styles.retryBtnText}>↺  Re-stitch with new random cuts</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
    gap: 12,
    padding: 32,
  },
  loadingText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  loadingSubtext: { color: '#666', fontSize: 14 },
  errorText: { color: '#e53e3e', fontSize: 22, fontWeight: '800' },
  errorDetail: { color: '#888', fontSize: 13, textAlign: 'center' },
  ghostBtn: { marginTop: 16, paddingVertical: 10 },
  ghostBtnText: { color: '#888', fontSize: 15 },

  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { fontSize: 72, color: 'rgba(255,255,255,0.85)' },

  topSafe: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnText: { color: '#fff', fontSize: 16 },
  topTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },

  bottomBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 12,
  },
  doneLabel: { color: '#aaa', fontSize: 13 },
  saveBtn: {
    backgroundColor: '#e53e3e',
    paddingVertical: 14,
    borderRadius: 50,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  retryBtn: { alignItems: 'center', paddingVertical: 6 },
  retryBtnText: { color: '#666', fontSize: 13 },
});
