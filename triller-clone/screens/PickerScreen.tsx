import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, SafeAreaView, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Audio, AVPlaybackStatusSuccess } from 'expo-av';
import { c, glow } from '../theme';

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
      const { sound, status } = await Audio.Sound.createAsync({ uri: asset.uri }, { shouldPlay: false });
      const durationMs = (status as AVPlaybackStatusSuccess).durationMillis ?? 30_000;
      await sound.unloadAsync();
      onPicked(asset.uri, asset.name ?? 'Track', durationMs);
    } catch {
      Alert.alert('Error', 'Could not load that audio file.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.body}>
        <Text style={s.glyph}>✦</Text>
        <Text style={s.title}>Pick a Song</Text>
        <Text style={s.sub}>Choose an MP3 to record to</Text>

        <TouchableOpacity style={s.primaryBtn} onPress={pickAudio} disabled={loading}>
          {loading
            ? <ActivityIndicator color={c.bg} />
            : <Text style={s.primaryBtnText}>Browse MP3</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={onSkip}>
          <Text style={s.ghost}>Skip — no music</Text>
        </TouchableOpacity>

        {hasClips && (
          <TouchableOpacity onPress={onViewClips}>
            <Text style={s.ghost}>View recorded clips</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 32 },
  glyph: { fontSize: 52, color: c.accentGlow, ...glow(c.accentGlow, 24) },
  title: { color: c.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  sub: { color: c.textMuted, fontSize: 15, marginTop: -8 },
  primaryBtn: {
    backgroundColor: c.accent,
    paddingHorizontal: 44, paddingVertical: 16,
    borderRadius: 50, minWidth: 180, alignItems: 'center',
    ...glow(c.accent, 20),
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  ghost: { color: c.textMuted, fontSize: 14, paddingVertical: 6 },
});
