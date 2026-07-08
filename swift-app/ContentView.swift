import SwiftUI

struct ContentView: View {
    @StateObject private var appState = AppState()

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            switch appState.screen {
            case .picker:
                PickerScreen()
            case .trim:
                if let audio = appState.audio {
                    TrimScreen(audio: audio)
                }
            case .camera:
                CameraScreen()
            case .clips:
                ClipsScreen()
            case .stitch:
                StitchScreen()
            }
        }
        .environmentObject(appState)
        .preferredColorScheme(.dark)
    }
}
