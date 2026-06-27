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
import type { AudioConfig, Clip } from '../App';

type EditSegment = {
  clipIndex: number;
  durationMs: number;
};

type Phase = 'loading' | 'ready' | 'playing' | 'done';

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
    segments.push({
      clipIndex: Math.floor(Math.random() * clipCount),
      durationMs: Math.round(dur),
    });
    filled += dur;
  }
  return segments;
}

export function StitchScreen({ clips, audio, onBack }: Props) {
  const totalMs = audio
    ? audio.trimEndMs - audio.trimStartMs
    : clips.length * 3000;

  const [plan] = useState<EditSegment[]>(() => buildPlan(clips.length, totalMs));
  const [phase, setPhase] = useState<Phase>('loading');
  const [segIdx, setSegIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  const videoRef = useRef<Video>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const segTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Loading phase: fake 1.5s processing delay
  useEffect(() => {
    const t = setTimeout(() => setPhase('ready'), 1500);
    return () => clearTimeout(t);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      segTimerRef.current && clearTimeout(segTimerRef.current);
      soundRef.current?.unloadAsync();
    };
  }, []);

  // Advance segment when segIdx changes and we are playing
  useEffect(() => {
    if (phase !== 'playing') return;

    if (segIdx >= plan.length) {
      finishPlayback();
      return;
    }

    const seg = plan[segIdx];
    const clip = clips[seg.clipIndex];
    let cancelled = false;

    (async () => {
      const video = videoRef.current;
      if (!video) return;
      await video.unloadAsync();
      await video.loadAsync({ uri: clip.videoUri }, { shouldPlay: true });
      if (cancelled) return;

      segTimerRef.current = setTimeout(() => {
        if (!cancelled) setSegIdx((p) => p + 1);
      }, seg.durationMs);
    })();

    return () => {
      cancelled = true;
      segTimerRef.current && clearTimeout(segTimerRef.current);
    };
  }, [segIdx, phase]);

  // Update progress bar from audio position
  useEffect(() => {
    if (phase !== 'playing' || !soundRef.current) return;
    const sound = soundRef.current;
    sound.setOnPlaybackStatusUpdate((s) => {
      const st = s as AVPlaybackStatusSuccess;
      if (!st.isLoaded) return;
      const elapsed = st.positionMillis - (audio?.trimStartMs ?? 0);
      setProgress(Math.min(elapsed / totalMs, 1));
      if (st.didJustFinish) finishPlayback();
    });
    return () => { sound.setOnPlaybackStatusUpdate(null); };
  }, [phase]);

  const startPlayback = async () => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
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
      soundRef.current = sound;
      await sound.playAsync();
    }

    setSegIdx(0);
    setPhase('playing');
  };

  const finishPlayback = async () => {
    segTimerRef.current && clearTimeout(segTimerRef.current);
    await videoRef.current?.pauseAsync();
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      soundRef.current.setOnPlaybackStatusUpdate(null);
    }
    setPhase('done');
  };

  const replay = async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setProgress(0);
    setSegIdx(0);
    setPhase('ready');
  };

  const saveClips = async () => {
    setSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Camera roll access is required to save.');
        return;
      }
      for (const clip of clips) {
        await MediaLibrary.saveToLibraryAsync(clip.videoUri);
      }
      Alert.alert(
        'Saved!',
        `${clips.length} clip${clips.length !== 1 ? 's' : ''} saved to your Camera Roll.\n\nFull merged export coming with cloud processing.`,
      );
    } catch {
      Alert.alert('Error', 'Could not save to camera roll.');
    } finally {
      setSaving(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#e53e3e" />
        <Text style={styles.loadingText}>Assembling your video…</Text>
        <Text style={styles.loadingSubtext}>
          {clips.length} clips · {plan.length} cuts planned
        </Text>
      </View>
    );
  }

  // ── Ready (show play button before starting) ──────────────────────
  if (phase === 'ready') {
    return (
      <SafeAreaView style={styles.center}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.readyEmoji}>🎬</Text>
        <Text style={styles.readyTitle}>Ready to preview</Text>
        <Text style={styles.readySubtext}>
          {plan.length} cuts · {Math.round(totalMs / 1000)}s
          {audio ? ` · ${audio.name}` : ''}
        </Text>

        <TouchableOpacity style={styles.playBtn} onPress={startPlayback}>
          <Text style={styles.playBtnText}>▶  Play Preview</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Playing / Done — full-screen video ───────────────────────────
  const currentClip = phase === 'playing' && segIdx < plan.length
    ? clips[plan[segIdx].clipIndex]
    : null;

  return (
    <View style={styles.container}>
      {/* Video — we keep it mounted and swap source via loadAsync */}
      <Video
        ref={videoRef}
        source={currentClip ? { uri: currentClip.videoUri } : undefined}
        style={styles.video}
        resizeMode={ResizeMode.COVER}
        isMuted
        shouldPlay={false}
      />

      {/* Done overlay */}
      {phase === 'done' && (
        <View style={styles.doneOverlay}>
          <Text style={styles.doneTitle}>Done!</Text>
          <Text style={styles.doneSubtext}>Your stitched preview is ready.</Text>

          <TouchableOpacity style={styles.replayBtn} onPress={replay}>
            <Text style={styles.replayBtnText}>↺  Replay</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={saveClips}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>⬇  Save Clips to Camera Roll</Text>
            }
          </TouchableOpacity>

          <Text style={styles.saveMeta}>
            Merged single-file export coming with cloud processing
          </Text>
        </View>
      )}

      {/* Progress bar (playing only) */}
      {phase === 'playing' && (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.progressLabel}>
            {Math.round(progress * totalMs / 1000)}s / {Math.round(totalMs / 1000)}s
          </Text>
        </View>
      )}

      {/* Close button */}
      <SafeAreaView style={styles.topSafe}>
        <TouchableOpacity style={styles.closeBtn} onPress={onBack}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
    gap: 12,
    padding: 32,
  },
  video: { flex: 1 },

  // Loading
  loadingText: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 16 },
  loadingSubtext: { color: '#666', fontSize: 14 },

  // Ready
  backBtn: { position: 'absolute', top: 16, left: 16 },
  backText: { color: '#888', fontSize: 15 },
  readyEmoji: { fontSize: 64, marginBottom: 4 },
  readyTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  readySubtext: { color: '#888', fontSize: 14, textAlign: 'center' },
  playBtn: {
    marginTop: 16,
    backgroundColor: '#e53e3e',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 50,
  },
  playBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  // Progress
  progressWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 40,
    paddingHorizontal: 24,
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingTop: 12,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: '#e53e3e' },
  progressLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },

  // Done overlay
  doneOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  doneTitle: { color: '#fff', fontSize: 32, fontWeight: '900' },
  doneSubtext: { color: '#aaa', fontSize: 15, marginBottom: 8 },
  replayBtn: {
    borderWidth: 2,
    borderColor: '#fff',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 50,
    width: '100%',
    alignItems: 'center',
  },
  replayBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  saveBtn: {
    backgroundColor: '#e53e3e',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 50,
    width: '100%',
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  saveMeta: { color: '#555', fontSize: 12, textAlign: 'center' },

  // Close
  topSafe: { position: 'absolute', top: 0, right: 0 },
  closeBtn: {
    margin: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 16 },
});
