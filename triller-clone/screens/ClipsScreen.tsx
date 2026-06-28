import { useRef, useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, Dimensions, SafeAreaView, Alert,
} from 'react-native';
import { Video, ResizeMode, Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import type { AVPlaybackStatusSuccess } from 'expo-av';
import { c, glow } from '../theme';
import type { Clip } from '../App';

type Props = { clips: Clip[]; onDeleteClip: (i: number) => void; onBack: () => void; };

const { width } = Dimensions.get('window');
const THUMB = (width - 48) / 3;

export function ClipsScreen({ clips, onDeleteClip, onBack }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<Video>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => () => { soundRef.current?.unloadAsync(); }, []);

  const openClip = async (i: number) => {
    if (soundRef.current) { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); soundRef.current = null; }
    setIsPlaying(false);
    setActiveIdx(i);
  };

  const play = async () => {
    const clip = activeIdx !== null ? clips[activeIdx] : null;
    if (!clip) return;
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, interruptionModeIOS: InterruptionModeIOS.DuckOthers, interruptionModeAndroid: InterruptionModeAndroid.DuckOthers });
    if (clip.audioConfig?.uri) {
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync({ uri: clip.audioConfig.uri }, { shouldPlay: false });
        soundRef.current = sound;
      }
      await soundRef.current.setPositionAsync(clip.audioConfig.trimStartMs);
    }
    await videoRef.current?.setPositionAsync(0);
    await videoRef.current?.playAsync();
    await soundRef.current?.playAsync();
    setIsPlaying(true);
  };

  const pause = async () => {
    await videoRef.current?.pauseAsync();
    await soundRef.current?.pauseAsync();
    setIsPlaying(false);
  };

  const closePlayer = async () => {
    await videoRef.current?.stopAsync();
    if (soundRef.current) { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); soundRef.current = null; }
    setIsPlaying(false);
    setActiveIdx(null);
  };

  const confirmDelete = (i: number) => Alert.alert('Delete Clip', `Delete clip #${i + 1}?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { if (activeIdx === i) closePlayer(); onDeleteClip(i); } },
  ]);

  // ── Player ────────────────────────────────────────────────────────
  if (activeIdx !== null && clips[activeIdx]) {
    const clip = clips[activeIdx];
    return (
      <View style={s.playerScreen}>
        <Video
          ref={videoRef}
          source={{ uri: clip.videoUri }}
          style={s.playerVideo}
          resizeMode={ResizeMode.CONTAIN}
          isMuted
          onPlaybackStatusUpdate={st => {
            const status = st as AVPlaybackStatusSuccess;
            if (status.isLoaded && status.didJustFinish) { soundRef.current?.stopAsync(); setIsPlaying(false); }
          }}
        />
        <TouchableOpacity style={s.playOverlay} onPress={isPlaying ? pause : play} activeOpacity={0.7}>
          {!isPlaying && <Text style={s.playIcon}>▶</Text>}
        </TouchableOpacity>
        <SafeAreaView style={s.playerTopSafe}>
          <View style={s.playerTopRow}>
            <TouchableOpacity style={s.playerIconBtn} onPress={closePlayer}>
              <Text style={s.playerIconText}>✕</Text>
            </TouchableOpacity>
            <Text style={s.playerTitle}>Clip #{activeIdx + 1}</Text>
            <TouchableOpacity style={s.playerIconBtn} onPress={() => confirmDelete(activeIdx)}>
              <Text style={s.playerIconText}>🗑</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
        {clip.audioConfig && (
          <View style={s.songChip}>
            <Text style={s.songChipText} numberOfLines={1}>♪ {clip.audioConfig.name}</Text>
          </View>
        )}
      </View>
    );
  }

  // ── Grid ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} hitSlop={16}>
          <Text style={s.back}>← Camera</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Clips ({clips.length})</Text>
        <View style={{ width: 80 }} />
      </View>
      <Text style={s.hint}>Long-press to delete</Text>
      <FlatList
        data={clips}
        keyExtractor={(_, i) => String(i)}
        numColumns={3}
        contentContainerStyle={s.grid}
        ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>No clips yet</Text></View>}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={s.thumb}
            onPress={() => openClip(index)}
            onLongPress={() => confirmDelete(index)}
            delayLongPress={400}
          >
            <Video source={{ uri: item.videoUri }} style={s.thumbVideo} resizeMode={ResizeMode.COVER} isMuted shouldPlay={false} />
            <View style={s.badge}><Text style={s.badgeText}>#{index + 1}</Text></View>
            {item.audioConfig && <View style={s.musicDot} />}
          </TouchableOpacity>
        )}
      />
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
  back: { color: c.textMuted, fontSize: 15, width: 80 },
  headerTitle: { color: c.text, fontSize: 17, fontWeight: '700' },
  hint: { color: c.textDim, fontSize: 11, textAlign: 'center', paddingVertical: 5 },
  grid: { padding: 8 },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyText: { color: c.textDim, fontSize: 15 },
  thumb: {
    width: THUMB, height: THUMB * 1.5, margin: 4, borderRadius: 10,
    overflow: 'hidden', backgroundColor: c.surface2,
    borderWidth: 1, borderColor: c.border,
  },
  thumbVideo: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute', bottom: 5, left: 6,
    backgroundColor: 'rgba(8,6,18,0.75)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  badgeText: { color: c.text, fontSize: 11, fontWeight: '600' },
  musicDot: {
    position: 'absolute', top: 6, right: 6,
    width: 7, height: 7, borderRadius: 4, backgroundColor: c.accent,
    ...glow(c.accent, 6),
  },
  playerScreen: { flex: 1, backgroundColor: '#000' },
  playerVideo: { flex: 1 },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playIcon: { fontSize: 64, color: 'rgba(240,235,255,0.85)' },
  playerTopSafe: { position: 'absolute', top: 0, left: 0, right: 0 },
  playerTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  playerIconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(8,6,18,0.65)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.border,
  },
  playerIconText: { color: c.text, fontSize: 15 },
  playerTitle: { color: c.text, fontSize: 15, fontWeight: '600' },
  songChip: {
    position: 'absolute', bottom: 48, left: 16, right: 16,
    backgroundColor: 'rgba(8,6,18,0.75)', paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1, borderColor: c.border,
  },
  songChipText: { color: c.text, fontSize: 13, fontWeight: '600' },
});
