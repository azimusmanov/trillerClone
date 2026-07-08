import SwiftUI
import AVFoundation
import UniformTypeIdentifiers

struct PickerScreen: View {
    @EnvironmentObject var appState: AppState

    @State private var showPicker    = false
    @State private var showAlert     = false
    @State private var isLoading     = false
    @State private var pending: (url: URL, name: String, durationMs: Double)?

    var body: some View {
        VStack(spacing: 18) {
            Spacer()

            Text("✦")
                .font(.system(size: 52))
                .foregroundColor(Theme.accentGlow)
                .glowEffect(Theme.accentGlow, radius: 24)

            Text("Pick a Song")
                .font(.system(size: 30, weight: .heavy))
                .foregroundColor(Theme.text)

            Text("Choose an MP3 to record to")
                .font(.system(size: 15))
                .foregroundColor(Theme.textMuted)

            Button {
                showPicker = true
            } label: {
                Group {
                    if isLoading {
                        ProgressView().tint(.white)
                    } else {
                        Text("Browse MP3")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundColor(.white)
                    }
                }
                .frame(minWidth: 180)
                .padding(.horizontal, 44)
                .padding(.vertical, 16)
            }
            .background(Theme.accent)
            .clipShape(Capsule())
            .glowEffect(Theme.accent, radius: 20)
            .disabled(isLoading)

            Button("Skip — no music") {
                appState.screen = .camera
            }
            .font(.system(size: 14))
            .foregroundColor(Theme.textMuted)
            .padding(.vertical, 6)

            if !appState.clips.isEmpty {
                Button("View recorded clips") {
                    appState.screen = .clips
                }
                .font(.system(size: 14))
                .foregroundColor(Theme.textMuted)
                .padding(.vertical, 6)
            }

            Spacer()
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
        .fileImporter(
            isPresented: $showPicker,
            allowedContentTypes: [.audio],
            allowsMultipleSelection: false
        ) { result in
            guard case .success(let urls) = result, let url = urls.first else { return }
            loadAudio(url: url)
        }
        .alert("Change Song?", isPresented: $showAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Clear & Change", role: .destructive) {
                if let p = pending { appState.setSong(url: p.url, name: p.name, durationMs: p.durationMs) }
            }
        } message: {
            Text("Switching songs will clear your recorded clips.")
        }
    }

    private func loadAudio(url: URL) {
        isLoading = true
        // fileImporter gives a security-scoped URL — must call startAccessingSecurityScopedResource
        let accessed = url.startAccessingSecurityScopedResource()
        Task {
            do {
                let name       = url.deletingPathExtension().lastPathComponent
                let asset      = AVURLAsset(url: url)
                let duration   = try await asset.load(.duration)
                let durationMs = duration.seconds * 1000

                await MainActor.run {
                    if accessed { url.stopAccessingSecurityScopedResource() }
                    isLoading = false
                    let isSame = appState.audio?.url == url
                    if !isSame && !appState.clips.isEmpty {
                        pending   = (url, name, durationMs)
                        showAlert = true
                    } else {
                        appState.setSong(url: url, name: name, durationMs: durationMs)
                    }
                }
            } catch {
                await MainActor.run {
                    if accessed { url.stopAccessingSecurityScopedResource() }
                    isLoading = false
                }
            }
        }
    }
}
