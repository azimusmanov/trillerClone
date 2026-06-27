import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, SafeAreaView, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Audio, AVPlaybackStatusSuccess } from 'expo-av';

type Props = {
  onPicked: (uri: string, name: string, durationMs: number) => void;
  onSkip: () => void;
  hasClips: boolean;
  onViewClips: () => void;
};

export function PickerScreen({ onPicked, onSkip, hasClips, onViewClips }: Props) {
  const [loading, setLoading] = useState(false);

  const pickAudio = async () => {
    setLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];

      const { sound, status } = await Audio.Sound.createAsync(
        { uri: asset.uri },
        { shouldPlay: false },
      );
      const durationMs = (status as AVPlaybackStatusSuccess).durationMillis ?? 30_000;
      await sound.unloadAsync();

      onPicked(asset.uri, asset.name ?? 'Track', durationMs);
    } catch {
      Alert.alert('Error', 'Could not load that audio file. Make sure it\'s a valid MP3.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <Text style={styles.emoji}>🎵</Text>
        <Text style={styles.title}>Pick a Song</Text>
        <Text style={styles.subtitle}>Choose an MP3 to record to</Text>

        <TouchableOpacity style={styles.primaryButton} onPress={pickAudio} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.primaryButtonText}>Browse MP3</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.ghostButton} onPress={onSkip}>
          <Text style={styles.ghostText}>Skip — no music</Text>
        </TouchableOpacity>

        {hasClips && (
          <TouchableOpacity style={styles.ghostButton} onPress={onViewClips}>
            <Text style={styles.ghostText}>View recorded clips</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  emoji: { fontSize: 56 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#aaa', fontSize: 15, marginBottom: 8 },
  primaryButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 50,
    minWidth: 180,
    alignItems: 'center',
  },
  primaryButtonText: { fontSize: 17, fontWeight: '700', color: '#000' },
  ghostButton: { paddingVertical: 10 },
  ghostText: { color: '#888', fontSize: 15 },
});
