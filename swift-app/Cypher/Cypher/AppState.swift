import SwiftUI

enum AppScreen {
    case picker, trim, camera, clips, stitch
}

@MainActor
class AppState: ObservableObject {
    @Published var screen: AppScreen = .picker
    @Published var audio:  AudioConfig? = nil
    @Published var clips:  [Clip] = []

    // Called when the user picks a song. If clips exist with a different song, caller shows alert first.
    func setSong(url: URL, name: String, durationMs: Double) {
        clips = []
        audio = AudioConfig(url: url, name: name, durationMs: durationMs,
                            trimStartMs: 0, trimEndMs: durationMs)
        screen = .trim
    }

    func confirmTrim(startMs: Double, endMs: Double) {
        audio?.trimStartMs = startMs
        audio?.trimEndMs   = endMs
        screen = .camera
    }

    func addClip(videoURL: URL, previewURL: URL?) {
        clips.append(Clip(videoURL: videoURL, previewURL: previewURL, audioConfig: audio))
    }

    func deleteClip(at index: Int) {
        guard clips.indices.contains(index) else { return }
        clips.remove(at: index)
    }
}
