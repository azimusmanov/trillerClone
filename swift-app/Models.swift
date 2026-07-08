import Foundation

struct AudioConfig: Equatable {
    var url: URL
    var name: String
    var durationMs: Double
    var trimStartMs: Double
    var trimEndMs: Double

    var segmentMs: Double { trimEndMs - trimStartMs }
}

struct Clip: Identifiable {
    let id = UUID()
    var videoURL: URL
    var previewURL: URL?
    var audioConfig: AudioConfig?
}
