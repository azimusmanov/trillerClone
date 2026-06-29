import { useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, Dimensions, SafeAreaView, Alert,
} from 'react-native';
import { Video, ResizeMode, Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import type { AVPlaybackStatusSuccess } from 'expo-av';
import { c, glow } from '../theme';
import type { Clip } from '../App';

type Props = { clips: Clip[]; onDeleteClip: (i: number) => void; onBack: () => void };

const { width, height: SCREEN_H } = Dimensions.get('window');
const THUMB = (width - 48) / 3;

export function ClipsScreen({ clips, onDeleteClip, onBack }: Props) {
  const [playerOpen, setPlayerOpen] = useState(false);
  const [activeIdx,  setActiveIdx]  = useState(0);
  const [isPlaying,  setIsPlaying]  = useState(false);
  const playerListRef  = useRef<FlatList>(null);
  const videoRefs      = useRef<Record<number, Video | null>>({});
  const activeIdxRef   = useRef(0);
  const viewConfig     = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const syncActiveIdx = (i: number) => {
    activeIdxRef.current = i;
    setActiveIdx(i);
  };

  const openClip = (i: number) => {
    syncActiveIdx(i);
    setIsPlaying(false);
    setPlayerOpen(true);
    setTimeout(() => playerListRef.current?.scrollToIndex({ index: i, animated: false }), 50);
  };

  const closePlayer = async () => {
    await videoRefs.current[activeIdxRef.current]?.stopAsync().catch(() => {});
    setIsPlaying(false);
    setPlayerOpen(false);
  };

  const play = async (idx: number) => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    });
    await videoRefs.current[idx]?.setPositionAsync(0);
    await videoRefs.current[idx]?.playAsync();
    setIsPlaying(true);
  };

  const pause = async (idx = activeIdxRef.current) => {
    await videoRefs.current[idx]?.pauseAsync();
    setIsPlaying(false);
  };

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (!viewableItems.length) return;
    const newIdx = viewableItems[0].index ?? 0;
    if (newIdx !== activeIdxRef.current) {
      videoRefs.current[activeIdxRef.current]?.stopAsync().catch(() => {});
      setIsPlaying(false);
      syncActiveIdx(newIdx);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmDelete = (i: number) => Alert.alert('Delete Clip', `Delete clip #${i + 1}?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => {
      if (playerOpen && activeIdxRef.current === i) closePlayer();
      onDeleteClip(i);
    }},
  ]);

  // ── Player ─────────────────────────────────────────────────────────
  if (playerOpen && clips.length > 0) {
    const cur = clips[activeIdx];
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
          viewabilityConfig={viewConfig}
          renderItem={({ item, index }) => (
            <View style={{ width, height: SCREEN_H }}>
              <Video
                ref={ref => { videoRefs.current[index] = ref; }}
                source={{ uri: item.previewUri ?? item.videoUri }}
                style={s.playerVideo}
                resizeMode={ResizeMode.CONTAIN}
                isMuted={!item.previewUri}
                onPlaybackStatusUpdate={st => {
                  const status = st as AVPlaybackStatusSuccess;
                  if (status.isLoaded && status.didJustFinish && index === activeIdxRef.current) {
                    setIsPlaying(false);
                  }
                }}
              />
            </View>
          )}
        />

        <TouchableOpacity
          style={s.playOverlay}
          onPress={() => isPlaying ? pause(activeIdxRef.current) : play(activeIdxRef.current)}
          activeOpacity={0.7}
        >
          {!isPlaying && <Text style={s.playIcon}>▶</Text>}
        </TouchableOpacity>

        <SafeAreaView style={s.playerTopSafe}>
          <View style={s.playerTopRow}>
            <TouchableOpacity style={s.iconBtn} onPress={closePlayer}>
              <Text style={s.iconBtnText}>✕</Text>
            </TouchableOpacity>
            <Text style={s.playerTitle}>Clip #{activeIdx + 1} of {clips.length}</Text>
            <TouchableOpacity style={s.iconBtn} onPress={() => confirmDelete(activeIdx)}>
              <Text style={s.iconBtnText}>🗑</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {clips.length > 1 && (
          <View style={s.dots}>
            {clips.map((_, i) => (
              <View key={i} style={[s.dot, i === activeIdx && s.dotActive]} />
            ))}
          </View>
        )}

        {cur?.audioConfig && (
          <View style={s.songChip}>
            <Text style={s.songChipText} numberOfLines={1}>
              ♪ {cur.audioConfig.name}
              {!cur.previewUri && ' · audio pending'}
            </Text>
          </View>
        )}
      </View>
    );
  }

  // ── Grid ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} hitSlop={16}>
          <Text style={s.back}>← Camera</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Clips ({clips.length})</Text>
        <View style={{ width: 80 }} />
      </View>
      <Text style={s.hint}>Tap to play · Swipe between clips · Long-press to delete</Text>
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
              source={{ uri: item.previewUri ?? item.videoUri }}
              style={s.thumbVideo}
              resizeMode={ResizeMode.COVER}
              isMuted
              shouldPlay={false}
            />
            <View style={s.badge}><Text style={s.badgeText}>#{index + 1}</Text></View>
            {item.audioConfig && (
              <View style={[s.musicDot, !item.previewUri && s.musicDotDim]} />
            )}
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
    overflow: 'hidden', backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border,
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
  musicDotDim: { backgroundColor: c.textDim },

  playerScreen:  { flex: 1, backgroundColor: '#000' },
  playerVideo:   { flex: 1 },
  playOverlay:   { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playIcon:      { fontSize: 64, color: 'rgba(240,235,255,0.85)' },
  playerTopSafe: { position: 'absolute', top: 0, left: 0, right: 0 },
  playerTopRow:  {
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
  songChip: {
    position: 'absolute', bottom: 48, left: 16, right: 16,
    backgroundColor: 'rgba(8,6,18,0.8)', paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1, borderColor: c.border,
  },
  songChipText: { color: c.text, fontSize: 13, fontWeight: '600' },
});
