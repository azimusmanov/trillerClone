import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, Dimensions, SafeAreaView, Alert,
} from 'react-native';
import { Video, ResizeMode, Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import type { AVPlaybackStatusSuccess } from 'expo-av';
import { c, glow } from '../theme';
import type { Clip } from '../App';

type Props = { clips: Clip[]; onDeleteClip: (i: number) => void; onBack: () => void };

const { width, height } = Dimensions.get('window');
const THUMB = (width - 48) / 3;

export function ClipsScreen({ clips, onDeleteClip, onBack }: Props) {
  const [playerOpen,    setPlayerOpen]    = useState(false);
  const [activeIdx,     setActiveIdx]     = useState(0);
  const [isPlaying,     setIsPlaying]     = useState(false);
  // How many ms after video.playAsync() to start audio. Tune with +/- buttons.
  // Positive = audio starts later (fixes audio ahead of video).
  // Negative = audio starts earlier (fixes video ahead of audio).
  const [syncOffsetMs,  setSyncOffsetMs]  = useState(100);
  const playerListRef = useRef<FlatList>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  // Map of video refs per index
  const videoRefs = useRef<Record<number, Video | null>>({});

  useEffect(() => () => { soundRef.current?.unloadAsync(); }, []);

  const stopSound = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
  };

  const loadSoundForClip = async (i: number) => {
    await stopSound();
    const clip = clips[i];
    if (!clip?.audioConfig?.uri) return;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false, playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    });
    const { sound } = await Audio.Sound.createAsync({ uri: clip.audioConfig.uri }, { shouldPlay: false });
    await sound.setPositionAsync(clip.audioConfig.trimStartMs);
    soundRef.current = sound;
  };

  const openClip = async (i: number) => {
    setIsPlaying(false);
    setActiveIdx(i);           // set BEFORE playerOpen so onViewableItemsChanged
    await loadSoundForClip(i); // sees newIdx === activeIdx and skips stopSound
    setPlayerOpen(true);
    setTimeout(() => playerListRef.current?.scrollToIndex({ index: i, animated: false }), 50);
  };

  const closePlayer = async () => {
    await stopSound();
    await videoRefs.current[activeIdx]?.stopAsync().catch(() => {});
    setIsPlaying(false);
    setPlayerOpen(false);
  };

  const play = async (idx: number, audioDelayMs = syncOffsetMs) => {
    await soundRef.current?.setPositionAsync(clips[idx].audioConfig?.trimStartMs ?? 0);
    await videoRefs.current[idx]?.setPositionAsync(0);
    await videoRefs.current[idx]?.playAsync();
    // Delay audio by audioDelayMs to match video's first-frame render latency.
    // Tune syncOffsetMs with +/- buttons if video and audio are still off.
    setTimeout(() => { soundRef.current?.playAsync(); }, Math.max(0, audioDelayMs));
    setIsPlaying(true);
  };

  const pause = async (idx = activeIdx) => {
    await videoRefs.current[idx]?.pauseAsync();
    await soundRef.current?.pauseAsync();
    setIsPlaying(false);
  };

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (!viewableItems.length) return;
    const newIdx = viewableItems[0].index ?? 0;
    if (newIdx !== activeIdx) {
      videoRefs.current[activeIdx]?.stopAsync().catch(() => {});
      setIsPlaying(false);
      setActiveIdx(newIdx);
      loadSoundForClip(newIdx); // pre-load audio for the newly visible clip
    }
  }, [activeIdx]);

  const confirmDelete = (i: number) => Alert.alert(
    'Delete Clip', `Delete clip #${i + 1}?`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        if (playerOpen && activeIdx === i) await closePlayer();
        onDeleteClip(i);
      }},
    ],
  );

  // ── Full-screen swipeable player ───────────────────────────────────
  if (playerOpen && clips.length > 0) {
    return (
      <View style={s.playerScreen}>
        <FlatList
          ref={playerListRef}
          data={clips}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          renderItem={({ item, index }) => (
            <View style={{ width, height: '100%' }}>
              <Video
                ref={ref => { videoRefs.current[index] = ref; }}
                source={{ uri: item.videoUri }}
                style={s.playerVideo}
                resizeMode={ResizeMode.CONTAIN}
                isMuted
                onPlaybackStatusUpdate={st => {
                  const status = st as AVPlaybackStatusSuccess;
                  if (status.isLoaded && status.didJustFinish && index === activeIdx) {
                    soundRef.current?.stopAsync();
                    setIsPlaying(false);
                  }
                }}
              />
            </View>
          )}
        />

        {/* Play/pause tap */}
        <TouchableOpacity
          style={s.playOverlay}
          onPress={() => isPlaying ? pause(activeIdx) : play(activeIdx)}
          activeOpacity={0.7}
        >
          {!isPlaying && <Text style={s.playIcon}>▶</Text>}
        </TouchableOpacity>

        {/* Top bar */}
        <SafeAreaView style={s.playerTopSafe}>
          <View style={s.playerTopRow}>
            <TouchableOpacity style={s.iconBtn} onPress={closePlayer}>
              <Text style={s.iconBtnText}>✕</Text>
            </TouchableOpacity>
            <Text style={s.playerTitle}>
              Clip #{activeIdx + 1} of {clips.length}
            </Text>
            <TouchableOpacity style={s.iconBtn} onPress={() => confirmDelete(activeIdx)}>
              <Text style={s.iconBtnText}>🗑</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Swipe hint / dots */}
        {clips.length > 1 && (
          <View style={s.dots}>
            {clips.map((_, i) => (
              <View key={i} style={[s.dot, i === activeIdx && s.dotActive]} />
            ))}
          </View>
        )}

        {/* Sync adjustment — tap +/- to shift audio relative to video */}
        <View style={s.syncBar}>
          <TouchableOpacity
            style={s.syncBtn}
            onPress={() => { setSyncOffsetMs(v => v - 50); if (isPlaying) { pause(activeIdx); } }}
          >
            <Text style={s.syncBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={s.syncLabel}>A/V sync {syncOffsetMs > 0 ? '+' : ''}{syncOffsetMs}ms</Text>
          <TouchableOpacity
            style={s.syncBtn}
            onPress={() => { setSyncOffsetMs(v => v + 50); if (isPlaying) { pause(activeIdx); } }}
          >
            <Text style={s.syncBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Song chip */}
        {clips[activeIdx]?.audioConfig && (
          <View style={s.songChip}>
            <Text style={s.songChipText} numberOfLines={1}>
              ♪ {clips[activeIdx].audioConfig!.name}
            </Text>
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
      <Text style={s.hint}>Tap to play · Long-press to delete · Swipe in player</Text>
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
            <Video
              source={{ uri: item.videoUri }}
              style={s.thumbVideo}
              resizeMode={ResizeMode.COVER}
              isMuted
              shouldPlay={false}
            />
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
    backgroundColor: 'rgba(8,6,18,0.8)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  badgeText: { color: c.text, fontSize: 11, fontWeight: '600' },
  musicDot: {
    position: 'absolute', top: 6, right: 6,
    width: 7, height: 7, borderRadius: 4, backgroundColor: c.accent, ...glow(c.accent, 6),
  },

  // Player
  playerScreen: { flex: 1, backgroundColor: '#000' },
  playerVideo:  { flex: 1, width },
  playOverlay:  { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playIcon:     { fontSize: 64, color: 'rgba(240,235,255,0.85)' },
  playerTopSafe: { position: 'absolute', top: 0, left: 0, right: 0 },
  playerTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(8,6,18,0.65)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.border,
  },
  iconBtnText: { color: c.text, fontSize: 15 },
  playerTitle: { color: c.text, fontSize: 15, fontWeight: '600' },
  dots: {
    position: 'absolute', bottom: 100, width: '100%',
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(240,235,255,0.3)' },
  dotActive: { backgroundColor: c.text, width: 18, ...glow(c.text, 4) },
  syncBar: {
    position: 'absolute', bottom: 100, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  syncBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(8,6,18,0.7)', borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },
  syncBtnText: { color: c.text, fontSize: 18, fontWeight: '300' },
  syncLabel: { color: c.textMuted, fontSize: 12, minWidth: 100, textAlign: 'center' },
  songChip: {
    position: 'absolute', bottom: 48, left: 16, right: 16,
    backgroundColor: 'rgba(8,6,18,0.8)', paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1, borderColor: c.border,
  },
  songChipText: { color: c.text, fontSize: 13, fontWeight: '600' },
});
