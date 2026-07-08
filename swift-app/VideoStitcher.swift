import AVFoundation
import Foundation

struct VideoStitcher {

    struct Segment {
        var url: URL
        var startMs: Double
        var durationMs: Double
    }

    enum StitchError: Error {
        case compositionFailed
        case exportFailed
    }

    // Full multi-clip stitch with audio overlay
    static func stitch(
        segments: [Segment],
        audioURL: URL?,
        trimStartMs: Double,
        trimEndMs: Double,
        completion: @escaping (Result<URL, Error>) -> Void
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            let composition = AVMutableComposition()

            guard let videoTrack = composition.addMutableTrack(
                withMediaType: .video,
                preferredTrackID: kCMPersistentTrackID_Invalid
            ) else {
                completion(.failure(StitchError.compositionFailed))
                return
            }

            var insertTime   = CMTime.zero
            var firstSrcTrack: AVAssetTrack?

            for seg in segments {
                let asset = AVURLAsset(url: seg.url)
                guard let srcTrack = asset.tracks(withMediaType: .video).first else { continue }
                if firstSrcTrack == nil { firstSrcTrack = srcTrack }

                var segStart = CMTime(seconds: seg.startMs / 1000,    preferredTimescale: 600)
                let segDur   = CMTime(seconds: seg.durationMs / 1000, preferredTimescale: 600)

                // If clip is too short to seek to segStart, restart from frame 0.
                // Keeps composition timeline aligned with audio — never skip segments.
                if segStart >= asset.duration { segStart = .zero }

                let available = asset.duration - segStart
                guard available > .zero else { continue }

                let clipDur = min(segDur, available)
                try? videoTrack.insertTimeRange(
                    CMTimeRange(start: segStart, duration: clipDur),
                    of: srcTrack,
                    at: insertTime
                )
                insertTime = insertTime + clipDur
            }

            // Audio overlay
            if let audioURL = audioURL {
                let audioAsset = AVURLAsset(url: audioURL)
                if let srcAudio = audioAsset.tracks(withMediaType: .audio).first,
                   let audioTrack = composition.addMutableTrack(
                       withMediaType: .audio,
                       preferredTrackID: kCMPersistentTrackID_Invalid
                   ) {
                    let aStart  = CMTime(seconds: trimStartMs / 1000, preferredTimescale: 600)
                    let aEnd    = CMTime(seconds: trimEndMs   / 1000, preferredTimescale: 600)
                    let clamped = min(aEnd - aStart, insertTime)
                    try? audioTrack.insertTimeRange(
                        CMTimeRange(start: aStart, duration: clamped),
                        of: srcAudio,
                        at: .zero
                    )
                }
            }

            export(composition: composition, firstSrcTrack: firstSrcTrack,
                   videoTrack: videoTrack, prefix: "stitched", completion: completion)
        }
    }

    // Single-clip preview: bake audio in so playback needs no JS sync tricks
    static func makePreview(
        clipURL: URL,
        audioURL: URL,
        audioStartMs: Double,
        trimEndMs: Double,
        completion: @escaping (Result<URL, Error>) -> Void
    ) {
        stitch(
            segments: [Segment(url: clipURL, startMs: 0, durationMs: 999_000)],
            audioURL: audioURL,
            trimStartMs: audioStartMs,
            trimEndMs: trimEndMs,
            completion: completion
        )
    }

    // MARK: - Private

    private static func export(
        composition: AVMutableComposition,
        firstSrcTrack: AVAssetTrack?,
        videoTrack: AVMutableCompositionTrack,
        prefix: String,
        completion: @escaping (Result<URL, Error>) -> Void
    ) {
        var videoComposition: AVMutableVideoComposition?

        if let src = firstSrcTrack {
            let t          = src.preferredTransform
            let natural    = src.naturalSize.applying(t)
            let renderSize = CGSize(width: abs(natural.width), height: abs(natural.height))

            let vc            = AVMutableVideoComposition()
            vc.renderSize     = renderSize
            vc.frameDuration  = CMTime(value: 1, timescale: 30)

            let instr         = AVMutableVideoCompositionInstruction()
            instr.timeRange   = CMTimeRange(start: .zero, duration: composition.duration)

            let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
            layer.setTransform(t, at: .zero)
            instr.layerInstructions = [layer]
            vc.instructions         = [instr]
            videoComposition        = vc
        }

        let outName = "\(prefix)_\(Int(Date().timeIntervalSince1970)).mp4"
        let outURL  = FileManager.default.temporaryDirectory.appendingPathComponent(outName)
        try? FileManager.default.removeItem(at: outURL)

        guard let exporter = AVAssetExportSession(
            asset: composition,
            presetName: AVAssetExportPresetHighestQuality
        ) else {
            completion(.failure(StitchError.exportFailed))
            return
        }
        exporter.outputURL                  = outURL
        exporter.outputFileType             = .mp4
        exporter.shouldOptimizeForNetworkUse = true
        if let vc = videoComposition { exporter.videoComposition = vc }

        exporter.exportAsynchronously {
            if let error = exporter.error {
                completion(.failure(error))
            } else {
                completion(.success(outURL))
            }
        }
    }
}
