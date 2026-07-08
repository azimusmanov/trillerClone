import AVFoundation
import SwiftUI

@MainActor
final class CameraManager: NSObject, ObservableObject {
    @Published var isRecording  = false
    @Published var isAuthorized = false

    let session = AVCaptureSession()

    private let movieOutput     = AVCaptureMovieFileOutput()
    private var cameraPosition: AVCaptureDevice.Position = .front

    // Called on the main actor after recording finishes.
    // (videoURL, audioTimeAtRecordStart) — use audioTimeAtRecordStart as trimStartMs in preview stitch.
    var onRecordingFinished: ((URL, TimeInterval) -> Void)?

    // Records wall-clock time + audio player position when startRecording() is called.
    // The delta between this and fileOutput:didStartRecordingTo: gives camera startup latency.
    private var audioTimeAtStart: TimeInterval = 0

    override init() {
        super.init()
    }

    func requestPermissionsAndSetup() async {
        let camStatus = AVCaptureDevice.authorizationStatus(for: .video)
        let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)

        if camStatus == .notDetermined {
            await AVCaptureDevice.requestAccess(for: .video)
        }
        if micStatus == .notDetermined {
            await AVCaptureDevice.requestAccess(for: .audio)
        }

        let granted = AVCaptureDevice.authorizationStatus(for: .video)  == .authorized &&
                      AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
        isAuthorized = granted
        if granted { setupSession() }
    }

    func flipCamera() {
        cameraPosition = cameraPosition == .front ? .back : .front
        reconfigureVideoInput()
    }

    func startRecording(audioPlayerTime: TimeInterval) {
        audioTimeAtStart = audioPlayerTime

        let outName = "clip_\(Int(Date().timeIntervalSince1970)).mov"
        let outURL  = FileManager.default.temporaryDirectory.appendingPathComponent(outName)
        movieOutput.startRecording(to: outURL, recordingDelegate: self)
        isRecording = true
    }

    func stopRecording() {
        movieOutput.stopRecording()
    }

    // MARK: - Private

    private func setupSession() {
        session.beginConfiguration()
        session.sessionPreset = .high

        addVideoInput()
        addAudioInput()

        if session.canAddOutput(movieOutput) {
            session.addOutput(movieOutput)
        }
        fixOrientation()
        session.commitConfiguration()

        Task.detached { [weak self] in
            self?.session.startRunning()
        }
    }

    private func addVideoInput() {
        guard let device = camera(at: cameraPosition),
              let input  = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else { return }
        session.addInput(input)
    }

    private func addAudioInput() {
        guard let mic   = AVCaptureDevice.default(for: .audio),
              let input = try? AVCaptureDeviceInput(device: mic),
              session.canAddInput(input) else { return }
        session.addInput(input)
    }

    private func reconfigureVideoInput() {
        session.beginConfiguration()
        for input in session.inputs {
            if let d = (input as? AVCaptureDeviceInput)?.device, d.hasMediaType(.video) {
                session.removeInput(input)
            }
        }
        addVideoInput()
        fixOrientation()
        session.commitConfiguration()
    }

    private func fixOrientation() {
        guard let conn = movieOutput.connection(with: .video) else { return }
        if conn.isVideoOrientationSupported  { conn.videoOrientation  = .portrait }
        if conn.isVideoMirroringSupported    { conn.isVideoMirrored   = (cameraPosition == .front) }
    }

    private func camera(at position: AVCaptureDevice.Position) -> AVCaptureDevice? {
        AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position)
    }
}

extension CameraManager: AVCaptureFileOutputRecordingDelegate {
    nonisolated func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        guard error == nil else { return }
        Task { @MainActor [self] in
            isRecording = false
            onRecordingFinished?(outputFileURL, audioTimeAtStart)
        }
    }

    nonisolated func fileOutput(
        _ output: AVCaptureFileOutput,
        didStartRecordingTo fileURL: URL,
        from connections: [AVCaptureConnection]
    ) {
        // TODO: record precise start timestamp here for better sync accuracy
    }
}
