import SwiftUI
import AVKit
import Photos

private let DEFAULT_AVG_S = 2.5
private let MIN_S         = 1.0
private let MAX_S         = 5.0
private let DEFAULTS_KEY  = "defaultAvgClipLength"

enum StitchPhase { case settings, stitching, preview, error }

struct StitchScreen: View {
    @EnvironmentObject var appState: AppState

    @State private var avgS = UserDefaults.standard.double(forKey: DEFAULTS_KEY).nonZeroOr(DEFAULT_AVG_S)
    @State private var saveAsDefault = false
    @State private var phase:     StitchPhase = .settings
    @State private var outputURL: URL?    = nil
    @State private var errorMsg:  String  = ""
    @State private var saving     = false
    @State private var player:    AVPlayer?

    private var totalMs: Double {
        appState.audio.map { $0.trimEndMs - $0.trimStartMs } ?? Double(appState.clips.count) * 3000
    }

    var body: some View {
        switch phase {
        case .settings:  settingsView
        case .stitching: stitchingView
        case .preview:   previewView
        case .error:     errorView
        }
    }

    // MARK: - Settings

    private var settingsView: some View {
        VStack(spacing: 0) {
            HStack {
                Button("← Back") { appState.screen = .camera }
                    .font(.system(size: 15)).foregroundColor(Theme.textMuted)
                Spacer()
                Text("Cut Length").font(.system(size: 17, weight: .bold)).foregroundColor(Theme.text)
                Spacer()
                Color.clear.frame(width: 60)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .overlay(alignment: .bottom) { Divider().overlay(Theme.border) }

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Average seconds per clip")
                            .font(.system(size: 20, weight: .bold)).foregroundColor(Theme.text)
                        Text("Each cut varies ±40% around this")
                            .font(.system(size: 13)).foregroundColor(Theme.textDim)
                    }

                    // Stepper
                    HStack(spacing: 28) {
                        Button {
                            avgS = max(MIN_S, (avgS - 0.5).rounded(toPlaces: 1))
                        } label: {
                            Text("−").font(.system(size: 26, weight: .light)).foregroundColor(Theme.text)
                                .frame(width: 52, height: 52)
                                .background(Theme.surface2)
                                .clipShape(Circle())
                                .overlay(Circle().stroke(Theme.border, lineWidth: 1))
                        }
                        .disabled(avgS <= MIN_S).opacity(avgS <= MIN_S ? 0.3 : 1)

                        Text(String(format: "%.1fs", avgS))
                            .font(.system(size: 38, weight: .heavy))
                            .foregroundColor(Theme.text)
                            .frame(minWidth: 90, alignment: .center)
                            .glowEffect(Theme.accentGlow, radius: 12)

                        Button {
                            avgS = min(MAX_S, (avgS + 0.5).rounded(toPlaces: 1))
                        } label: {
                            Text("+").font(.system(size: 26, weight: .light)).foregroundColor(Theme.text)
                                .frame(width: 52, height: 52)
                                .background(Theme.surface2)
                                .clipShape(Circle())
                                .overlay(Circle().stroke(Theme.border, lineWidth: 1))
                        }
                        .disabled(avgS >= MAX_S).opacity(avgS >= MAX_S ? 0.3 : 1)
                    }

                    // Presets
                    HStack(spacing: 8) {
                        ForEach([1.0, 2.0, 2.5, 3.0, 5.0], id: \.self) { n in
                            let active = avgS == n
                            Button { avgS = n } label: {
                                Text(n == floor(n) ? "\(Int(n))s" : "\(n)s")
                                    .font(.system(size: 14))
                                    .foregroundColor(active ? Theme.text : Theme.textMuted)
                                    .padding(.horizontal, 16).padding(.vertical, 8)
                            }
                            .background(active ? Theme.accentLo : Theme.surface2)
                            .clipShape(Capsule())
                            .overlay(Capsule().stroke(active ? Theme.accent : Theme.border, lineWidth: 1))
                            .glowEffect(active ? Theme.accent : .clear, radius: active ? 10 : 0)
                        }
                    }

                    // Save as default
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Save as default")
                                .font(.system(size: 15, weight: .semibold)).foregroundColor(Theme.text)
                            Text("Skip this menu next time")
                                .font(.system(size: 12)).foregroundColor(Theme.textDim)
                        }
                        Spacer()
                        Toggle("", isOn: $saveAsDefault).tint(Theme.accent)
                    }
                    .padding(16)
                    .background(Theme.surface2)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.border, lineWidth: 1))

                    // Stitch button
                    Button {
                        if saveAsDefault { UserDefaults.standard.set(avgS, forKey: DEFAULTS_KEY) }
                        runStitch()
                    } label: {
                        Text("✂  Stitch Now")
                            .font(.system(size: 17, weight: .bold)).foregroundColor(.white)
                            .frame(maxWidth: .infinity).padding(.vertical, 16)
                    }
                    .background(Theme.accent)
                    .clipShape(Capsule())
                    .glowEffect(Theme.accent, radius: 18)
                }
                .padding(24)
            }
        }
        .background(Theme.bg.ignoresSafeArea())
    }

    // MARK: - Stitching

    private var stitchingView: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 12) {
                ProgressView().tint(Theme.accent).scaleEffect(1.5)
                Text("Stitching \(appState.clips.count) clips…")
                    .font(.system(size: 18, weight: .bold)).foregroundColor(Theme.text)
                Text("~\(String(format: "%.1f", avgS))s cuts · \(Int(totalMs / 1000))s total")
                    .font(.system(size: 14)).foregroundColor(Theme.textDim)
            }
        }
    }

    // MARK: - Preview

    private var previewView: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if outputURL != nil {
                VideoPlayer(player: player).ignoresSafeArea()
            }

            VStack {
                HStack {
                    Button {
                        player?.pause(); player = nil
                        appState.screen = .camera
                    } label: {
                        Text("✕").foregroundColor(Theme.text)
                            .frame(width: 40, height: 40)
                            .background(Color.black.opacity(0.65))
                            .clipShape(Circle())
                            .overlay(Circle().stroke(Theme.border, lineWidth: 1))
                    }
                    Spacer()
                    Text("Preview").font(.system(size: 16, weight: .bold)).foregroundColor(Theme.text)
                    Spacer()
                    Color.clear.frame(width: 40)
                }
                .padding(.horizontal, 16).padding(.top, 56)
                Spacer()

                VStack(spacing: 14) {
                    Button { phase = .settings } label: {
                        Text("✂ \(String(format: "%.1f", avgS))s cuts · change")
                            .font(.system(size: 13)).foregroundColor(Theme.textMuted)
                    }

                    Button {
                        saveToRoll()
                    } label: {
                        Group {
                            if saving { ProgressView().tint(.white) }
                            else {
                                Text("⬇  Save to Camera Roll")
                                    .font(.system(size: 16, weight: .bold)).foregroundColor(.white)
                            }
                        }
                        .frame(maxWidth: .infinity).frame(height: 50)
                    }
                    .background(saving ? Theme.accent.opacity(0.5) : Theme.accent)
                    .clipShape(Capsule())
                    .glowEffect(Theme.accent, radius: 16)
                    .disabled(saving)

                    Button { runStitch() } label: {
                        Text("↺  Re-stitch")
                            .font(.system(size: 13)).foregroundColor(Theme.textDim)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 16).padding(.bottom, 26)
                .background(Color.black.opacity(0.85))
                .overlay(alignment: .top) { Divider().overlay(Theme.border) }
            }
        }
        .onAppear {
            guard let url = outputURL else { return }
            do {
                try AVAudioSession.sharedInstance().setCategory(.playback)
                try AVAudioSession.sharedInstance().setActive(true)
            } catch {}
            player = AVPlayer(url: url)
            player?.play()
        }
        .onDisappear { player?.pause(); player = nil }
    }

    // MARK: - Error

    private var errorView: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 12) {
                Text("Stitch failed")
                    .font(.system(size: 22, weight: .heavy)).foregroundColor(Theme.record)
                Text(errorMsg)
                    .font(.system(size: 13)).foregroundColor(Theme.textMuted)
                    .multilineTextAlignment(.center)
                Button("← Try again") { phase = .settings }
                    .foregroundColor(Theme.textMuted).padding(.top, 16)
            }
            .padding(32)
        }
    }

    // MARK: - Logic

    private func runStitch() {
        player?.pause(); player = nil
        outputURL = nil
        phase     = .stitching

        let plan = buildPlan(totalMs: totalMs, avgMs: avgS * 1000)
        let segs = plan.map {
            VideoStitcher.Segment(
                url: appState.clips[$0.clipIndex].videoURL,
                startMs: $0.startMs,
                durationMs: $0.durationMs
            )
        }

        VideoStitcher.stitch(
            segments: segs,
            audioURL: appState.audio?.url,
            trimStartMs: appState.audio?.trimStartMs ?? 0,
            trimEndMs:   appState.audio?.trimEndMs   ?? 0
        ) { result in
            Task { @MainActor in
                switch result {
                case .success(let url):
                    outputURL = url
                    phase     = .preview
                case .failure(let err):
                    errorMsg = err.localizedDescription
                    phase    = .error
                }
            }
        }
    }

    private func buildPlan(totalMs: Double, avgMs: Double) -> [(clipIndex: Int, startMs: Double, durationMs: Double)] {
        var out: [(clipIndex: Int, startMs: Double, durationMs: Double)] = []
        var cur = 0.0
        while cur < totalMs {
            let remaining = totalMs - cur
            let lo  = avgMs * 0.6
            let hi  = avgMs * 1.4
            let dur = min(Double.random(in: lo...hi), remaining)
            out.append((
                clipIndex:  Int.random(in: 0..<appState.clips.count),
                startMs:    cur.rounded(),
                durationMs: dur.rounded()
            ))
            cur += dur
        }
        return out
    }

    private func saveToRoll() {
        guard let url = outputURL else { return }
        saving = true
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                Task { @MainActor in saving = false }
                return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
            }) { _, _ in
                Task { @MainActor in saving = false }
            }
        }
    }
}
