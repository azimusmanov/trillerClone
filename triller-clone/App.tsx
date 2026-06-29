import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { PickerScreen } from './screens/PickerScreen';
import { TrimScreen } from './screens/TrimScreen';
import { CameraScreen } from './screens/CameraScreen';
import { ClipsScreen } from './screens/ClipsScreen';
import { StitchScreen } from './screens/StitchScreen';
import { c } from './theme';

export type AudioConfig = {
  uri: string;
  name: string;
  durationMs: number;
  trimStartMs: number;
  trimEndMs: number;
};

export type Clip = {
  videoUri: string;          // original silent video — used for stitch
  previewUri: string | null; // video with audio baked in — used for playback
  audioConfig: AudioConfig | null;
};

type AppScreen = 'picker' | 'trim' | 'camera' | 'clips' | 'stitch';

export default function App() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [screen, setScreen] = useState<AppScreen>('picker');
  const [audio, setAudio] = useState<AudioConfig | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);

  if (!cameraPermission || !micPermission) {
    return <View style={s.center}><Text style={s.text}>Loading...</Text></View>;
  }

  if (!cameraPermission.granted || !micPermission.granted) {
    return (
      <View style={s.center}>
        <Text style={s.text}>Camera and microphone access is required.</Text>
        <TouchableOpacity style={s.btn} onPress={async () => { await requestCameraPermission(); await requestMicPermission(); }}>
          <Text style={s.btnText}>Grant Permissions</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pickSong = (uri: string, name: string, durationMs: number) => {
    const isSameSong = audio?.uri === uri;
    const doSet = () => {
      setAudio({ uri, name, durationMs, trimStartMs: 0, trimEndMs: durationMs });
      setScreen('trim');
    };
    if (!isSameSong && clips.length > 0) {
      Alert.alert(
        'Change Song?',
        'Switching songs will clear your recorded clips.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear & Change', style: 'destructive', onPress: () => { setClips([]); doSet(); } },
        ],
      );
    } else {
      doSet();
    }
  };

  switch (screen) {
    case 'picker':
      return (
        <PickerScreen
          onPicked={pickSong}
          onSkip={() => setScreen('camera')}
          hasClips={clips.length > 0}
          onViewClips={() => setScreen('clips')}
        />
      );

    case 'trim':
      return (
        <TrimScreen
          audio={audio!}
          onConfirm={(trimStartMs, trimEndMs) => {
            setAudio(prev => prev ? { ...prev, trimStartMs, trimEndMs } : prev);
            setScreen('camera');
          }}
          onBack={() => setScreen('picker')}
        />
      );

    case 'camera':
      return (
        <CameraScreen
          audio={audio}
          clips={clips}
          onClipRecorded={(videoUri, previewUri) => setClips(prev => [...prev, { videoUri, previewUri, audioConfig: audio }])}
          onChangeSong={() => setScreen('picker')}
          onViewClips={() => setScreen('clips')}
          onStitch={() => setScreen('stitch')}
        />
      );

    case 'clips':
      return (
        <ClipsScreen
          clips={clips}
          onDeleteClip={index => setClips(prev => prev.filter((_, i) => i !== index))}
          onBack={() => setScreen('camera')}
        />
      );

    case 'stitch':
      return <StitchScreen clips={clips} audio={audio} onBack={() => setScreen('camera')} />;
  }
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, gap: 16 },
  text: { color: c.text, fontSize: 16, textAlign: 'center', paddingHorizontal: 32 },
  btn: { backgroundColor: c.accent, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 50 },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
