import SwiftUI
import AVKit
import AVFoundation

struct ClipsScreen: View {
    @EnvironmentObject var appState: AppState

    @State private var playerOpen = false
    @State private var activeIdx  = 0
    @State private var player:    AVPlayer?

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 3)

    var body: some View {
        if playerOpen && !appState.clips.isEmpty {
            fullscreenPlayer
        } else {
            gridView
        }
    }

    // MARK: - Grid

    private var gridView: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Button("← Camera") { appState.screen = .camera }
                    .font(.system(size: 15)).foregroundColor(Theme.textMuted)
                Spacer()
                Text("Clips (\(appState.clips.count))")
                    .font(.system(size: 17, weight: .bold)).foregroundColor(Theme.text)
                Spacer()
                Color.clear.frame(width: 80)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .overlay(alignment: .bottom) { Divider().overlay(Theme.border) }

            Text("Tap to play · Long-press to delete")
                .font(.system(size: 11)).foregroundColor(Theme.textDim).padding(.vertical, 5)

            ScrollView {
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(Array(appState.clips.enumerated()), id: \.element.id) { index, clip in
                        ClipThumbnail(clip: clip, number: index + 1) {
                            openClip(at: index)
                        } onDelete: {
                            appState.deleteClip(at: index)
                        }
                    }
                }
                .padding(8)
            }
        }
        .background(Theme.bg.ignoresSafeArea())
    }

    // MARK: - Fullscreen player

    private var fullscreenPlayer: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Paged video player
            TabView(selection: $activeIdx) {
                ForEach(Array(appState.clips.enumerated()), id: \.element.id) { index, clip in
                    VideoPlayer(player: index == activeIdx ? player : AVPlayer())
                        .ignoresSafeArea()
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .onChange(of: activeIdx) { newIdx in
                loadPlayer(for: newIdx)
            }

            // Top bar
            VStack {
                HStack {
                    Button {
                        player?.pause(); player = nil
                        playerOpen = false
                    } label: {
                        Text("✕").foregroundColor(Theme.text)
                            .frame(width: 40, height: 40)
                            .background(Color.black.opacity(0.65))
                            .clipShape(Circle())
                            .overlay(Circle().stroke(Theme.border, lineWidth: 1))
                    }
                    Spacer()
                    Text("Clip #\(activeIdx + 1) of \(appState.clips.count)")
                        .font(.system(size: 15, weight: .semibold)).foregroundColor(Theme.text)
                    Spacer()
                    Button {
                        appState.deleteClip(at: activeIdx)
                        if appState.clips.isEmpty {
                            player?.pause(); player = nil
                            playerOpen = false
                        } else {
                            activeIdx = min(activeIdx, appState.clips.count - 1)
                            loadPlayer(for: activeIdx)
                        }
                    } label: {
                        Text("🗑").frame(width: 40, height: 40)
                            .background(Color.black.opacity(0.65))
                            .clipShape(Circle())
                            .overlay(Circle().stroke(Theme.border, lineWidth: 1))
                    }
                }
                .padding(.horizontal, 16).padding(.top, 56)
                Spacer()
            }

            // Pagination dots
            if appState.clips.count > 1 {
                VStack {
                    Spacer()
                    HStack(spacing: 6) {
                        ForEach(0..<appState.clips.count, id: \.self) { i in
                            Capsule()
                                .fill(i == activeIdx ? Theme.text : Theme.text.opacity(0.3))
                                .frame(width: i == activeIdx ? 18 : 6, height: 6)
                                .glowEffect(i == activeIdx ? Theme.text : .clear, radius: 4)
                        }
                    }
                    .padding(.bottom, 100)
                }
            }

            // Song chip
            if let audio = appState.clips[safe: activeIdx]?.audioConfig {
                VStack {
                    Spacer()
                    Text("♪ \(audio.name)")
                        .font(.system(size: 13, weight: .semibold)).foregroundColor(Theme.text)
                        .lineLimit(1)
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .background(Color.black.opacity(0.8))
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(Theme.border, lineWidth: 1))
                        .padding(.bottom, 48).padding(.horizontal, 16)
                }
            }
        }
        .onAppear { loadPlayer(for: activeIdx) }
        .onDisappear { player?.pause(); player = nil }
    }

    // MARK: - Helpers

    private func openClip(at index: Int) {
        activeIdx  = index
        playerOpen = true
    }

    private func loadPlayer(for index: Int) {
        player?.pause()
        guard let clip = appState.clips[safe: index] else { return }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {}
        let url = clip.previewURL ?? clip.videoURL
        player  = AVPlayer(url: url)
        player?.play()
    }
}

// MARK: - Thumbnail

private struct ClipThumbnail: View {
    let clip:     Clip
    let number:   Int
    let onTap:    () -> Void
    let onDelete: () -> Void

    @State private var showAlert = false

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 10)
                .fill(Theme.surface2)
                .aspectRatio(2/3, contentMode: .fit)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.border, lineWidth: 1))

            // Clip number badge
            Text("#\(number)")
                .font(.system(size: 11, weight: .semibold)).foregroundColor(Theme.text)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Color.black.opacity(0.8))
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .padding(6)

            // Music dot (top right)
            if clip.audioConfig != nil {
                Circle()
                    .fill(clip.previewURL != nil ? Theme.accent : Theme.textDim)
                    .frame(width: 7, height: 7)
                    .glowEffect(clip.previewURL != nil ? Theme.accent : .clear, radius: 6)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(6)
            }
        }
        .onTapGesture { onTap() }
        .onLongPressGesture(minimumDuration: 0.4) { showAlert = true }
        .alert("Delete Clip #\(number)?", isPresented: $showAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { onDelete() }
        }
    }
}
