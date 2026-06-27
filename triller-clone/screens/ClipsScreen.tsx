import { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { Video, ResizeMode, Audio, InterruptionModeIOS, InterruptionModeAndroid, AVPlaybackStatusSuccess } from 'expo-av';
import type { Clip } from '../App';

type Props = {
  clips: Clip[];
  onBack: () => void;
};

const { width } = Dimensions.get('window');
const THUMB = (width - 48) / 3;

export function ClipsScreen({ clips, onBack }: Props) {
  const [activeClip, setActiveClip] = useState<Clip | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<Video>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Tear down sound when screen unmounts or clip changes
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  const openClip = async (clip: Clip) => {
    // Clean up any previous sound
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setIsPlaying(false);
    setActiveClip(clip);
  };

  const play = async () => {
    if (!activeClip) return;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    });

    // Load music if this clip has audio
    if (activeClip.audioConfig?.uri) {
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync(
          { uri: activeClip.audioConfig.uri },
          { shouldPlay: false },
        );
        soundRef.current = sound;
      }
      await soundRef.current.setPositionAsync(activeClip.audioConfig.trimStartMs);
    }

    // Reset video to start and play both together
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
    setActiveClip(null);
  };

  const onVideoStatusUpdate = async (status: AVPlaybackStatusSuccess) => {
    if (status.didJustFinish) {
      await soundRef.current?.stopAsync();
      setIsPlaying(false);
    }
  };

  // ── Full-screen player ────────────────────────────────────────────
  if (activeClip) {
    return (
      <View style={styles.playerScreen}>
        <Video
          ref={videoRef}
          source={{ uri: activeClip.videoUri }}
          style={styles.playerVideo}
          resizeMode={ResizeMode.CONTAIN}
          isMuted // recorded audio is ambient noise; music comes from Audio.Sound
          onPlaybackStatusUpdate={(s) => {
            if ((s as AVPlaybackStatusSuccess).isLoaded) {
              onVideoStatusUpdate(s as AVPlaybackStatusSuccess);
            }
          }}
        />

        {/* Play / Pause overlay */}
        <TouchableOpacity
          style={styles.playOverlay}
          onPress={isPlaying ? pause : play}
          activeOpacity={0.7}
        >
          {!isPlaying && <Text style={styles.playIcon}>▶</Text>}
        </TouchableOpacity>

        {/* Close button */}
        <SafeAreaView style={styles.playerTopSafe}>
          <TouchableOpacity style={styles.closeButton} onPress={closePlayer}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </SafeAreaView>

        {activeClip.audioConfig && (
          <View style={styles.playerSongChip}>
            <Text style={styles.playerSongText} numberOfLines={1}>
              🎵 {activeClip.audioConfig.name}
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
          <TouchableOpacity style={styles.thumb} onPress={() => openClip(item)}>
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
            {item.audioConfig && (
              <View style={styles.thumbMusicDot} />
            )}
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
  grid: { padding: 8 },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyText: { color: '#666', fontSize: 15 },

  // Thumbnail
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
  thumbMusicDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e53e3e',
  },

  // Player
  playerScreen: { flex: 1, backgroundColor: '#000' },
  playerVideo: { flex: 1 },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { fontSize: 64, color: 'rgba(255,255,255,0.85)' },
  playerTopSafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  closeButton: {
    margin: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  closeText: { color: '#fff', fontSize: 16 },
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
