import SwiftUI
import AVFoundation

private let BARS    = 50
private let MIN_SEG = 1_000.0
private let TRACK_H: CGFloat = 64

private let WAVEFORM: [Double] = (0..<BARS).map { i in
    let f = Double(i)
    return max(0.06, min(1.0, abs(sin(f * 0.41)) * 0.55 + abs(sin(f * 1.7)) * 0.4 + 0.08))
}

struct TrimScreen: View {
    let audio: AudioConfig
    @EnvironmentObject var appState: AppState

    @State private var trimStart: Double
    @State private var trimEnd:   Double
    @State private var trackWidth: CGFloat = 0
    @State private var previewing  = false
    @State private var player:     AVAudioPlayer?
    @State private var stopTimer:  Timer?

    init(audio: AudioConfig) {
        self.audio = audio
        _trimStart = State(initialValue: audio.trimStartMs)
        _trimEnd   = State(initialValue: audio.trimEndMs)
    }

    private var segMs: Double { trimEnd - trimStart }
    private var sPct:  Double { trackWidth > 0 ? trimStart / audio.durationMs : 0 }
    private var ePct:  Double { trackWidth > 0 ? trimEnd   / audio.durationMs : 1 }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Button("← Back") { appState.screen = .picker }
                    .foregroundColor(Theme.textMuted).font(.system(size: 15))
                Spacer()
                Text("Trim").font(.system(size: 17, weight: .bold)).foregroundColor(Theme.text)
                Spacer()
                Color.clear.frame(width: 60)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .overlay(alignment: .bottom) { Divider().overlay(Theme.border) }

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(audio.name)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(Theme.text)
                        Text("Total: \(fmt(audio.durationMs))")
                            .font(.system(size: 13)).foregroundColor(Theme.textDim)
                    }

                    // Waveform + handles
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            // Bars
                            HStack(spacing: 2) {
                                ForEach(0..<BARS, id: \.self) { i in
                                    let bS = (Double(i)   / Double(BARS)) * audio.durationMs
                                    let bE = (Double(i+1) / Double(BARS)) * audio.durationMs
                                    let inside = bS >= trimStart && bE <= trimEnd
                                    RoundedRectangle(cornerRadius: 1)
                                        .fill(inside ? Theme.accent : Theme.surface2)
                                        .frame(height: TRACK_H * WAVEFORM[i])
                                }
                            }
                            .frame(height: TRACK_H)
                            .background(Theme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 8))

                            // Dim overlays outside selection
                            if trackWidth > 0 {
                                Rectangle()
                                    .fill(Color.black.opacity(0.65))
                                    .frame(width: max(0, CGFloat(sPct) * trackWidth))
                                Rectangle()
                                    .fill(Color.black.opacity(0.65))
                                    .frame(width: max(0, CGFloat(1 - ePct) * trackWidth))
                                    .offset(x: CGFloat(ePct) * trackWidth)
                            }

                            // START handle (accent/purple)
                            if trackWidth > 0 {
                                TrimHandle(color: Theme.accent)
                                    .offset(x: CGFloat(sPct) * trackWidth - 10)
                                    .gesture(DragGesture(minimumDistance: 0)
                                        .onChanged { v in
                                            let maxPct = (trimEnd / audio.durationMs) - (MIN_SEG / audio.durationMs)
                                            let pct    = max(0, min(Double(v.location.x / trackWidth), maxPct))
                                            trimStart  = pct * audio.durationMs
                                            if previewing { player?.currentTime = trimStart / 1000 }
                                            resetStopTimer()
                                        }
                                    )
                            }

                            // END handle (white)
                            if trackWidth > 0 {
                                TrimHandle(color: Theme.text)
                                    .offset(x: CGFloat(ePct) * trackWidth - 10)
                                    .gesture(DragGesture(minimumDistance: 0)
                                        .onChanged { v in
                                            let minPct = (trimStart / audio.durationMs) + (MIN_SEG / audio.durationMs)
                                            let pct    = max(minPct, min(Double(v.location.x / trackWidth), 1.0))
                                            trimEnd    = pct * audio.durationMs
                                            resetStopTimer()
                                        }
                                    )
                            }
                        }
                        .frame(height: TRACK_H + 16)
                        .onAppear   { trackWidth = geo.size.width }
                        .onChange(of: geo.size.width) { trackWidth = $0 }
                    }
                    .frame(height: TRACK_H + 16)

                    // Legend
                    HStack(spacing: 16) {
                        Label("Start", systemImage: "circle.fill")
                            .font(.system(size: 11)).foregroundColor(Theme.textDim)
                            .labelStyle(ColorDotLabel(color: Theme.accent))
                        Label("End", systemImage: "circle.fill")
                            .font(.system(size: 11)).foregroundColor(Theme.textDim)
                            .labelStyle(ColorDotLabel(color: Theme.text))
                    }

                    // Times
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(fmt(trimStart))
                                .font(.system(size: 17, weight: .bold)).foregroundColor(Theme.accentGlow)
                            Text("START").font(.system(size: 10)).foregroundColor(Theme.textDim)
                        }
                        Spacer()
                        VStack(spacing: 2) {
                            Text(fmt(segMs))
                                .font(.system(size: 17, weight: .bold)).foregroundColor(Theme.text)
                            Text("SELECTED").font(.system(size: 10)).foregroundColor(Theme.textDim)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(fmt(trimEnd))
                                .font(.system(size: 17, weight: .bold)).foregroundColor(Theme.text)
                            Text("END").font(.system(size: 10)).foregroundColor(Theme.textDim)
                        }
                    }

                    // Preview / auto-trim buttons
                    HStack(spacing: 12) {
                        Button {
                            togglePreview()
                        } label: {
                            Text(previewing ? "⏹  Stop" : "▶  Preview")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(previewing ? Theme.bg : Theme.textMuted)
                                .frame(maxWidth: .infinity).padding(.vertical, 13)
                        }
                        .background(previewing ? Theme.text : Theme.surface2)
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(previewing ? Theme.text : Theme.border, lineWidth: 1))

                        Button {
                            // Auto-trim: coming soon
                        } label: {
                            Text("✨  Auto-trim")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(Theme.textMuted)
                                .frame(maxWidth: .infinity).padding(.vertical, 13)
                        }
                        .background(Theme.surface2)
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(Theme.border, lineWidth: 1))
                    }

                    // Confirm
                    Button {
                        stopPreview()
                        appState.confirmTrim(startMs: trimStart, endMs: trimEnd)
                    } label: {
                        Text("Use segment — Record →")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity).padding(.vertical, 16)
                    }
                    .background(Theme.accent)
                    .clipShape(Capsule())
                    .glowEffect(Theme.accent, radius: 16)
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 32)
            }
        }
        .background(Theme.bg.ignoresSafeArea())
        .onDisappear { stopPreview() }
    }

    // MARK: - Audio preview

    private func togglePreview() {
        if previewing { stopPreview(); return }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback)
            try AVAudioSession.sharedInstance().setActive(true)
            let p          = try AVAudioPlayer(contentsOf: audio.url)
            p.currentTime  = trimStart / 1000
            p.play()
            player         = p
            previewing     = true
            stopTimer      = Timer.scheduledTimer(withTimeInterval: segMs / 1000, repeats: false) { _ in
                stopPreview()
            }
        } catch {}
    }

    private func stopPreview() {
        stopTimer?.invalidate(); stopTimer = nil
        player?.stop(); player = nil
        previewing = false
    }

    private func resetStopTimer() {
        guard previewing else { return }
        stopTimer?.invalidate()
        stopTimer = Timer.scheduledTimer(withTimeInterval: (trimEnd - trimStart) / 1000, repeats: false) { _ in
            stopPreview()
        }
    }
}

// MARK: - Subviews

private struct TrimHandle: View {
    let color: Color
    var body: some View {
        ZStack {
            Rectangle()
                .fill(color)
                .frame(width: 3, height: 80)
                .glowEffect(color, radius: 8)
            VStack(spacing: 54) {
                Circle().fill(color).frame(width: 14, height: 14).glowEffect(color, radius: 8)
                Circle().fill(color).frame(width: 14, height: 14).glowEffect(color, radius: 8)
            }
        }
        .frame(width: 44, height: 88)
        .contentShape(Rectangle())
    }
}

private struct ColorDotLabel: LabelStyle {
    let color: Color
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 8, height: 8)
            configuration.title
        }
    }
}
