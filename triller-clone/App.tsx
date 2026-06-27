import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { PickerScreen } from './screens/PickerScreen';
import { TrimScreen } from './screens/TrimScreen';
import { CameraScreen } from './screens/CameraScreen';
import { ClipsScreen } from './screens/ClipsScreen';
import { StitchScreen } from './screens/StitchScreen';

export type AudioConfig = {
  uri: string;
  name: string;
  durationMs: number;
  trimStartMs: number;
  trimEndMs: number;
};

export type Clip = {
  videoUri: string;
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
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Loading...</Text>
      </View>
    );
  }

  if (!cameraPermission.granted || !micPermission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Camera and microphone access is required.</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={async () => {
            await requestCameraPermission();
            await requestMicPermission();
          }}
        >
          <Text style={styles.buttonText}>Grant Permissions</Text>
        </TouchableOpacity>
      </View>
    );
  }

  switch (screen) {
    case 'picker':
      return (
        <PickerScreen
          onPicked={(uri, name, durationMs) => {
            setAudio({ uri, name, durationMs, trimStartMs: 0, trimEndMs: durationMs });
            setScreen('trim');
          }}
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
            setAudio((prev) => prev ? { ...prev, trimStartMs, trimEndMs } : prev);
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
          onClipRecorded={(videoUri) =>
            setClips((prev) => [...prev, { videoUri, audioConfig: audio }])
          }
          onChangeSong={() => setScreen('picker')}
          onViewClips={() => setScreen('clips')}
          onStitch={() => setScreen('stitch')}
        />
      );

    case 'clips':
      return (
        <ClipsScreen
          clips={clips}
          onDeleteClip={(index) =>
            setClips((prev) => prev.filter((_, i) => i !== index))
          }
          onBack={() => setScreen('camera')}
        />
      );

    case 'stitch':
      return (
        <StitchScreen
          clips={clips}
          audio={audio}
          onBack={() => setScreen('camera')}
        />
      );
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', gap: 16 },
  text: { color: '#fff', fontSize: 16, textAlign: 'center', paddingHorizontal: 32 },
  button: { backgroundColor: '#fff', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 50 },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#000' },
});
