import SwiftUI
import AVFoundation

private let MAX_CLIPS   = 10
private let COUNTDOWN_S = 3

enum RecordState { case idle, countdown, recording, processing }

struct CameraScreen: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var camera = CameraManager()

    @State private var recordState:    RecordState = .idle
    @State private var countdown       = COUNTDOWN_S
    @State private var elapsedMs       = 0.0
    @State private var elapsedTimer:   Timer?
    @State private var audioPlayer:    AVAudioPlayer?
    @State private var countdownTask:  Task<Void, Never>?

    private var audio:     AudioConfig? { appState.audio }
    private var segmentMs: Double?      { audio?.segmentMs }

    var body: some View {
        ZStack {
            // Camera preview
            if camera.isAuthorized {
                CameraPreviewView(session: camera.session)
                    .ignoresSafeArea()
            } else {
                Theme.bg.ignoresSafeArea()
                permissionPrompt
            }

            // Top bar
            VStack {
                topBar
                Spacer()
                if recordState == .recording, let segMs = segmentMs {
                    progressBar(pct: min(elapsedMs / segMs, 1))
                        .padding(.bottom, 158)
                }
            }

            // Overlays
            if recordState == .countdown { countdownOverlay }
            if recordState == .processing { processingOverlay }

            // Bottom controls
            VStack {
                Spacer()
                bottomControls
                    .padding(.bottom, 48)
            }
        }
        .onAppear {
            Task { await camera.requestPermissionsAndSetup() }
            camera.onRecordingFinished = { url, audioTime in
                Task { @MainActor in
                    elapsedTimer?.invalidate(); elapsedTimer = nil; elapsedMs = 0
                    await processClip(videoURL: url, audioTimeAtStart: audioTime)
                }
            }
        }
        .onDisappear { cleanupAudio() }
    }

    // MARK: - Subviews

    private var permissionPrompt: some View {
        VStack(spacing: 16) {
            Text("Camera and microphone access required.")
                .foregroundColor(Theme.text).multilineTextAlignment(.center)
            Button("Grant Access") {
                Task { await camera.requestPermissionsAndSetup() }
            }
            .foregroundColor(Theme.accent)
        }
        .padding(32)
    }

    private var topBar: some View {
        HStack(alignment: .top) {
            Button {
                guard recordState == .idle else { return }
                camera.flipCamera()
            } label: {
                Text("⟳").font(.system(size: 20)).foregroundColor(Theme.text)
                    .frame(width: 42, height: 42)
                    .background(Color.black.opacity(0.6))
                    .clipShape(Circle())
                    .overlay(Circle().stroke(Theme.border, lineWidth: 1))
            }
            .disabled(recordState != .idle)

            Spacer()

            VStack(alignment: .trailing, spacing: 8) {
                Button {
                    guard recordState == .idle else { return }
                    appState.screen = .picker
                } label: {
                    Text(audio != nil ? "♪ \(audio!.name)" : "+ Add song")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Theme.text).lineLimit(1)
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Color.black.opacity(0.65))
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(Theme.border, lineWidth: 1))
                }
                .disabled(recordState != .idle)

                if !appState.clips.isEmpty {
                    Button {
                        guard recordState == .idle else { return }
                        appState.screen = .clips
                    } label: {
                        Text("Clips \(appState.clips.count)/\(MAX_CLIPS)")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Theme.text)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(Color.black.opacity(0.65))
                            .clipShape(Capsule())
                            .overlay(Capsule().stroke(Theme.border, lineWidth: 1))
                    }
                    .disabled(recordState != .idle)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 56)
    }

    private func progressBar(pct: Double) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(Theme.accent.opacity(0.2))
                RoundedRectangle(cornerRadius: 2)
                    .fill(Theme.accent)
                    .frame(width: geo.size.width * pct)
                    .glowEffect(Theme.accent, radius: 8)
            }
        }
        .frame(height: 2)
        .padding(.horizontal, 24)
    }

    private var countdownOverlay: some View {
        ZStack {
            Color.black.opacity(0.45).ignoresSafeArea()
            VStack(spacing: 8) {
                Text(countdown == 0 ? "GO" : "\(countdown)")
                    .font(.system(size: 120, weight: .black))
                    .foregroundColor(Theme.text)
                    .glowEffect(Theme.text, radius: 30)
                Text(audio != nil ? "Feel the beat" : "Get ready")
                    .font(.system(size: 16)).foregroundColor(Theme.textMuted)
            }
        }
    }

    private var processingOverlay: some View {
        ZStack {
            Color.black.opacity(0.75).ignoresSafeArea()
            VStack(spacing: 14) {
                ProgressView().tint(Theme.accent).scaleEffect(1.5)
                Text("Syncing audio…")
                    .font(.system(size: 16, weight: .semibold)).foregroundColor(Theme.text)
            }
        }
    }

    private var bottomControls: some View {
        VStack(spacing: 14) {
            if recordState == .recording {
                Text(timerText)
                    .font(.system(size: 15, weight: .semibold)).foregroundColor(Theme.text)
            }

            HStack(spacing: 36) {
                // Stitch button (left side)
                if !appState.clips.isEmpty && recordState == .idle {
                    Button { appState.screen = .stitch } label: {
                        VStack(spacing: 2) {
                            Text("✂").font(.system(size: 18))
                            Text("Stitch").font(.system(size: 9, weight: .bold))
                        }
                        .foregroundColor(Theme.accentGlow)
                        .frame(width: 56, height: 56)
                        .background(Theme.accent.opacity(0.15))
                        .clipShape(Circle())
                        .overlay(Circle().stroke(Theme.accent, lineWidth: 1.5))
                        .glowEffect(Theme.accent, radius: 10)
                    }
                } else if recordState == .idle {
                    Color.clear.frame(width: 56, height: 56)
                }

                // Main record button
                recordButton

                // Spacer to keep record button centred
                if !appState.clips.isEmpty && recordState == .idle {
                    Color.clear.frame(width: 56, height: 56)
                }
            }

            if recordState == .idle {
                Text(segmentMs != nil
                     ? "\(COUNTDOWN_S)s countdown · max \(fmt(segmentMs!))"
                     : "\(COUNTDOWN_S)s countdown")
                    .font(.system(size: 12)).foregroundColor(Theme.textDim)
            }
        }
    }

    @ViewBuilder
    private var recordButton: some View {
        switch recordState {
        case .idle:
            Button { beginCountdownAndRecord() } label: {
                ZStack {
                    Circle().stroke(Theme.text, lineWidth: 3).frame(width: 74, height: 74)
                    Circle().fill(Theme.record).frame(width: 54, height: 54)
                        .glowEffect(Theme.record, radius: 16)
                }
            }

        case .countdown:
            Button { cancelCountdown() } label: {
                Text("Cancel")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Theme.textMuted)
                    .padding(.horizontal, 32).padding(.vertical, 18)
                    .overlay(Capsule().stroke(Theme.textMuted, lineWidth: 1.5))
            }

        case .recording:
            Button { camera.stopRecording() } label: {
                ZStack {
                    Circle().stroke(Theme.record, lineWidth: 3).frame(width: 74, height: 74)
                        .glowEffect(Theme.record, radius: 20)
                    RoundedRectangle(cornerRadius: 5).fill(Theme.record)
                        .frame(width: 26, height: 26)
                }
            }

        case .processing:
            Color.clear.frame(width: 74, height: 74)
        }
    }

    // MARK: - Logic

    private var timerText: String {
        let s = Int(elapsedMs / 1000)
        let base = "\(s / 60):\(String(format: "%02d", s % 60))"
        if let segMs = segmentMs { return "\(base) / \(fmt(segMs))" }
        return base
    }

    private func beginCountdownAndRecord() {
        guard appState.clips.count < MAX_CLIPS else { return }

        countdownTask = Task {
            // Configure audio session for playback (artist hears beat through earphones)
            try? AVAudioSession.sharedInstance().setCategory(.playAndRecord,
                options: [.defaultToSpeaker, .allowBluetooth])
            try? AVAudioSession.sharedInstance().setActive(true)

            // Start audio 3 seconds before trimStart
            if let audio = appState.audio {
                let seekSec = max(0, (audio.trimStartMs - Double(COUNTDOWN_S) * 1000) / 1000)
                if let p = try? AVAudioPlayer(contentsOf: audio.url) {
                    p.currentTime = seekSec
                    p.play()
                    audioPlayer = p
                }
            }

            await MainActor.run { countdown = COUNTDOWN_S; recordState = .countdown }

            for i in stride(from: COUNTDOWN_S - 1, through: 0, by: -1) {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard !Task.isCancelled else { return }
                await MainActor.run { countdown = i }
            }
            guard !Task.isCancelled else { return }

            await MainActor.run {
                elapsedMs    = 0
                recordState  = .recording
                elapsedTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
                    Task { @MainActor in elapsedMs += 100 }
                }
                // Pass current audio player time so we can embed audio from the correct offset
                let audioTime = audioPlayer?.currentTime ?? (audio?.trimStartMs ?? 0) / 1000
                camera.startRecording(audioPlayerTime: audioTime)
            }

            // Auto-stop when the segment ends
            if let segMs = segmentMs {
                try? await Task.sleep(nanoseconds: UInt64(segMs) * 1_000_000)
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    if recordState == .recording { camera.stopRecording() }
                }
            }
        }
    }

    private func cancelCountdown() {
        countdownTask?.cancel(); countdownTask = nil
        cleanupAudio()
        recordState = .idle
    }

    private func cleanupAudio() {
        audioPlayer?.stop(); audioPlayer = nil
    }

    private func processClip(videoURL: URL, audioTimeAtStart: TimeInterval) async {
        cleanupAudio()
        recordState = .processing

        guard let audio = appState.audio else {
            appState.addClip(videoURL: videoURL, previewURL: nil)
            recordState = .idle
            return
        }

        let audioStartMs = audioTimeAtStart * 1000

        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            VideoStitcher.makePreview(
                clipURL: videoURL,
                audioURL: audio.url,
                audioStartMs: audioStartMs,
                trimEndMs: audio.trimEndMs
            ) { result in
                Task { @MainActor in
                    let previewURL = try? result.get()
                    appState.addClip(videoURL: videoURL, previewURL: previewURL)
                    recordState = .idle
                    continuation.resume()
                }
            }
        }
    }
}
