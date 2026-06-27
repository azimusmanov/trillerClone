import { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Dimensions,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Video, ResizeMode, Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import type { AVPlaybackStatusSuccess } from 'expo-av';
import type { Clip } from '../App';

type Props = {
  clips: Clip[];
  onDeleteClip: (index: number) => void;
  onBack: () => void;
};

const { width } = Dimensions.get('window');
const THUMB = (width - 48) / 3;

export function ClipsScreen({ clips, onDeleteClip, onBack }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<Video>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  const openClip = async (index: number) => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setIsPlaying(false);
    setActiveIndex(index);
  };

  const play = async () => {
    const clip = activeIndex !== null ? clips[activeIndex] : null;
    if (!clip) return;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    });

    if (clip.audioConfig?.uri) {
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync(
          { uri: clip.audioConfig.uri },
          { shouldPlay: false },
        );
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
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setIsPlaying(false);
    setActiveIndex(null);
  };

  const confirmDelete = (index: number) => {
    Alert.alert(
      'Delete Clip',
      `Delete clip #${index + 1}? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (activeIndex === index) closePlayer();
            onDeleteClip(index);
          },
        },
      ],
    );
  };

  // ── Full-screen player ────────────────────────────────────────────
  if (activeIndex !== null && clips[activeIndex]) {
    const clip = clips[activeIndex];
    return (
      <View style={styles.playerScreen}>
        <Video
          ref={videoRef}
          source={{ uri: clip.videoUri }}
          style={styles.playerVideo}
          resizeMode={ResizeMode.CONTAIN}
          isMuted
          onPlaybackStatusUpdate={(s) => {
            const status = s as AVPlaybackStatusSuccess;
            if (status.isLoaded && status.didJustFinish) {
              soundRef.current?.stopAsync();
              setIsPlaying(false);
            }
          }}
        />

        <TouchableOpacity
          style={styles.playOverlay}
          onPress={isPlaying ? pause : play}
          activeOpacity={0.7}
        >
          {!isPlaying && <Text style={styles.playIcon}>▶</Text>}
        </TouchableOpacity>

        <SafeAreaView style={styles.playerTopSafe}>
          <View style={styles.playerTopRow}>
            <TouchableOpacity style={styles.playerIconBtn} onPress={closePlayer}>
              <Text style={styles.playerIconText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.playerTitle}>Clip #{activeIndex + 1}</Text>
            <TouchableOpacity
              style={styles.playerIconBtn}
              onPress={() => confirmDelete(activeIndex)}
            >
              <Text style={styles.playerIconText}>🗑</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {clip.audioConfig && (
          <View style={styles.playerSongChip}>
            <Text style={styles.playerSongText} numberOfLines={1}>
              🎵 {clip.audioConfig.name}
            </Text>
          </View>
        )}
      </View>
    );
  }

  // ── Grid ─────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={16}>
          <Text style={styles.backText}>← Camera</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Clips ({clips.length})</Text>
        <View style={{ width: 80 }} />
      </View>

      <Text style={styles.hint}>Long-press a clip to delete</Text>

      <FlatList
        data={clips}
        keyExtractor={(_, i) => String(i)}
        numColumns={3}
        contentContainerStyle={styles.grid}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No clips yet. Go record some!</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={styles.thumb}
            onPress={() => openClip(index)}
            onLongPress={() => confirmDelete(index)}
            delayLongPress={400}
          >
            <Video
              source={{ uri: item.videoUri }}
              style={styles.thumbVideo}
              resizeMode={ResizeMode.COVER}
              isMuted
              shouldPlay={false}
            />
            <View style={styles.thumbBadge}>
              <Text style={styles.thumbBadgeText}>#{index + 1}</Text>
            </View>
            {item.audioConfig && <View style={styles.musicDot} />}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  backText: { color: '#fff', fontSize: 16, width: 80 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  hint: { color: '#555', fontSize: 12, textAlign: 'center', paddingVertical: 6 },
  grid: { padding: 8 },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyText: { color: '#666', fontSize: 15 },

  thumb: {
    width: THUMB,
    height: THUMB * 1.5,
    margin: 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#222',
  },
  thumbVideo: { width: '100%', height: '100%' },
  thumbBadge: {
    position: 'absolute',
    bottom: 5,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  thumbBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  musicDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e53e3e',
  },

  playerScreen: { flex: 1, backgroundColor: '#000' },
  playerVideo: { flex: 1 },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { fontSize: 64, color: 'rgba(255,255,255,0.85)' },
  playerTopSafe: { position: 'absolute', top: 0, left: 0, right: 0 },
  playerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  playerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerIconText: { color: '#fff', fontSize: 16 },
  playerTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  playerSongChip: {
    position: 'absolute',
    bottom: 48,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  playerSongText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
