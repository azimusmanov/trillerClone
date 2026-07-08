# Triller Clone — Swift Rebuild Reference

This document is a complete reconstruction prompt for rebuilding this app from scratch in Swift/SwiftUI. It captures every design decision, screen, data model, sync architecture, and known issue from the React Native prototype.

---

## What This App Is

A mobile app (iOS only) for filming dance videos synced to music — Triller / TikTok-style. Target users are underground rappers and their audiences.

**Core user flow:**
1. User picks an audio file (MP3 or any audio file)
2. User trims it to the section they want to record to
3. User films one or more silent video takes while listening through earphones
4. App stitches the takes into one continuous video with the audio overlaid
5. User previews and saves to camera roll

---

## Most Important Architectural Decision

**Record video silently. Never try to record video with live audio playback through the speaker.**

Reasons:
- Mic bleed (the phone mic picks up the speaker, destroying audio quality)
- Sync headaches (live audio during recording creates unpredictable offsets)

Instead:
- Video takes are recorded with **no audio track that matters**
- Audio plays through earphones during recording so the artist can hear the beat
- Each clip stores the position in the song where recording started (`audioStartMs`)
- After recording, AVFoundation merges the audio into the clip for preview
- During final stitch, the full trimmed audio track is laid over all concatenated clips

**Do not reintroduce live-audio recording under any circumstances.**

---

## Data Model

```swift
struct AudioConfig {
    var uri: URL          // local file URL to the audio (MP3 etc.)
    var name: String      // display name
    var durationMs: Double
    var trimStartMs: Double   // where the selected segment starts
    var trimEndMs: Double     // where the selected segment ends
}

struct Clip {
    var videoURL: URL         // original silent recording
    var previewURL: URL?      // video with audio baked in (for playback) — nil until processed
    var audioConfig: AudioConfig?  // the audio this clip was recorded to
}
```

The `previewURL` is produced immediately after each recording by running a single-segment stitch (see Stitch section). It's what gets shown in ClipsScreen. `videoURL` is what gets used in the final multi-clip stitch.

---

## Screen Flow

```
PickerScreen → TrimScreen → CameraScreen → ClipsScreen
                                    ↓
                               StitchScreen
```

All state lives at the app root level and is passed down:
- `audio: AudioConfig?` — the current song and trim selection
- `clips: [Clip]` — all recorded takes

---

## Screen 1: PickerScreen

**Purpose:** Let the user pick an audio file.

**Behavior:**
- Show a "Browse" button that opens the system file picker filtered to audio types
- After picking, load the file and read its duration using AVAsset
- Navigate to TrimScreen
- If the user already has clips and picks a DIFFERENT song, show an alert: "Switching songs will clear your clips" with Cancel / Clear & Change options
- "Skip — no music" option goes straight to CameraScreen (no audio)
- If clips already exist, show a "View recorded clips" link

**Key APIs:**
- `UIDocumentPickerViewController` (or SwiftUI `.fileImporter`) for picking
- `AVAsset(url:)` + `load(.duration)` to get duration

---

## Screen 2: TrimScreen

**Purpose:** Let the user select a segment of the audio to record to.

**UI:**
- Song name and total duration displayed at top
- A waveform bar (fake/pseudo waveform is fine — 50 bars of varying heights generated from a sine formula)
- Two drag handles: START (purple/accent color, left bracket shape) and END (white, right bracket shape)
- Bars between the handles are lit in accent color; outside bars are dim
- A dim overlay covers the regions outside the selected range
- Below: time display showing start / selected duration / end
- "Preview" button — plays audio from trimStart to trimEnd, then auto-stops
- "Use segment — Record →" confirm button

**Key behavior:**
- Minimum segment length: 1 second
- Dragging start handle: seek audio playback position in real time if preview is playing
- Dragging end handle: update auto-stop timer if preview is playing
- Preview plays the full audio file starting at trimStart, auto-stops after (trimEnd - trimStart) ms
- On confirm: pass trimStartMs and trimEndMs back up to app state, navigate to CameraScreen

**Key APIs:**
- `AVAudioPlayer` for preview playback
- `DragGesture` in SwiftUI for the handles
- `GeometryReader` to get track width for position → time conversion

---

## Screen 3: CameraScreen

**Purpose:** Record silent video takes while audio plays through earphones.

**UI:**
- Full-screen camera preview
- Top bar: flip camera button (left), song name chip + clips count chip (right)
- Progress bar showing recording progress against total segment length
- Large record button (ring + red dot); turns into stop button while recording
- 3-second countdown overlay before recording starts
- "Stitch" button appears when at least 1 clip exists (left of record button)
- "Syncing audio…" spinner while preview is being processed after recording

**Recording flow (critical — get this exactly right):**
1. Set `AVAudioSession` category to `.playAndRecord` with `.defaultToSpeaker` option (but artist uses earphones)
2. Load the audio file into `AVAudioPlayer`, seek to `max(0, trimStartMs - 3000)ms`
3. Start playing audio
4. Show countdown: 3, 2, 1, GO (each tick is 1 second, using `Timer` or `Task.sleep`)
5. When countdown hits 0: start `AVCaptureMovieFileOutput.startRecording(to:recordingDelegate:)`
6. **Capture the exact `CMTime` of the first sample buffer** via `AVCaptureVideoDataOutput` delegate (see Sync section)
7. Auto-stop recording when audio reaches `trimEndMs` OR user taps stop
8. After recording: call the AVFoundation stitch function with a single segment to bake audio in
9. Show "Syncing audio…" while processing
10. Store the processed clip and return to idle state

**Max clips:** 10

**Key APIs:**
- `AVCaptureSession` with `AVCaptureDeviceInput` (front/back camera) + `AVCaptureMovieFileOutput`
- `AVAudioPlayer` for countdown audio playback
- `AVCaptureVideoDataOutput` to get first frame timestamp (see Sync section)
- `UIViewRepresentable` to wrap `AVCaptureVideoPreviewLayer` in SwiftUI

---

## Screen 4: ClipsScreen

**Purpose:** Review, play, and delete recorded clips.

**UI — Grid view:**
- 3-column grid of video thumbnails
- Each thumbnail: badge showing clip number (#1, #2...), purple dot if audio was baked in
- Tap → fullscreen player; long-press → delete confirmation

**UI — Fullscreen player:**
- Full-screen video playback (AVPlayer)
- Play/pause tap on the video itself
- Top bar: close button (✕), "Clip #N of M" title, delete button
- Swipe horizontally between clips (paging)
- Pagination dots at bottom
- Song name chip at bottom
- When swiping, stop current playback

**Key behavior:**
- Source for playback: `previewURL` if available (has audio baked in), else `videoURL` (muted)
- Audio session must be set to playback mode before playing (not recording mode)
- No need for separate audio playback — the previewURL has audio baked in already

**Key APIs:**
- `AVPlayer` + `VideoPlayer` view (SwiftUI) or `AVPlayerLayer` (UIKit)
- `AVPlayerItem` for status observation
- `LazyVGrid` for the thumbnail grid
- `TabView` with `.page` style for horizontal swipe between clips

---

## Screen 5: StitchScreen

**Purpose:** Configure cut length, run stitch, preview result, save to camera roll.

**UI — Settings phase:**
- "Average seconds per clip" stepper (1.0s to 5.0s, step 0.5)
- Preset buttons: 1s, 2s, 2.5s, 3s, 5s
- "Save as default" toggle (persisted with UserDefaults)
- "Stitch Now" button

**UI — Stitching phase:**
- Spinner + "Stitching N clips…" text

**UI — Preview phase:**
- Full-screen video player with the stitched result
- Play/pause
- "✂ Xs cuts · change" button to go back to settings
- "Save to Camera Roll" button
- "↺ Re-stitch" button to randomize again with same settings

**UI — Error phase:**
- Error message + "← Try again" link

**Stitch plan algorithm:**
```swift
func buildPlan(clips: [Clip], totalMs: Double, avgMs: Double) -> [(clipIndex: Int, startMs: Double, durationMs: Double)] {
    var segments: [(clipIndex: Int, startMs: Double, durationMs: Double)] = []
    var currentMs = 0.0
    while currentMs < totalMs {
        let remaining = totalMs - currentMs
        let lo = avgMs * 0.6
        let hi = avgMs * 1.4
        let dur = min(Double.random(in: lo...hi), remaining)
        segments.append((
            clipIndex: Int.random(in: 0..<clips.count),
            startMs: currentMs,
            durationMs: dur
        ))
        currentMs += dur
    }
    return segments
}
```

`startMs` here is the position in the song (0-based from trimStartMs). It is used as the video seek position when reading clips, because every clip was recorded starting from trimStartMs (so clip frame at time T corresponds to song position trimStartMs + T).

**Key APIs:**
- `AVMutableComposition` for stitching
- `AVAssetExportSession` for export
- `PHPhotoLibrary.shared().performChanges` for camera roll save

---

## AVFoundation Stitch Function

This is the heart of the app. In Swift:

```swift
func stitchClips(
    segments: [(uri: URL, startMs: Double, durationMs: Double)],
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
        ) else { return }

        var insertTime = CMTime.zero
        var firstSourceTrack: AVAssetTrack?

        for seg in segments {
            let asset = AVURLAsset(url: seg.uri)
            guard let srcTrack = asset.tracks(withMediaType: .video).first else { continue }
            if firstSourceTrack == nil { firstSourceTrack = srcTrack }

            var segStart = CMTime(seconds: seg.startMs / 1000, preferredTimescale: 600)
            let segDur   = CMTime(seconds: seg.durationMs / 1000, preferredTimescale: 600)

            // If clip is shorter than the seek position, restart from beginning
            // This keeps the composition timeline aligned with audio — never skip segments
            if segStart >= asset.duration {
                segStart = .zero
            }

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
        if let audioURL = audioURL,
           let audioAsset = AVURLAsset(url: audioURL) as AVURLAsset?,
           let audioSrcTrack = audioAsset.tracks(withMediaType: .audio).first,
           let audioTrack = composition.addMutableTrack(
               withMediaType: .audio,
               preferredTrackID: kCMPersistentTrackID_Invalid
           ) {
            let aStart   = CMTime(seconds: trimStartMs / 1000, preferredTimescale: 600)
            let aEnd     = CMTime(seconds: trimEndMs   / 1000, preferredTimescale: 600)
            let clamped  = min(aEnd - aStart, insertTime)
            try? audioTrack.insertTimeRange(
                CMTimeRange(start: aStart, duration: clamped),
                of: audioSrcTrack,
                at: .zero
            )
        }

        // Fix rotation from first source clip
        var videoComposition: AVMutableVideoComposition?
        if let src = firstSourceTrack {
            let t           = src.preferredTransform
            let natural     = src.naturalSize
            let displayRect = natural.applying(t)
            let renderSize  = CGSize(width: abs(displayRect.width), height: abs(displayRect.height))

            let vc = AVMutableVideoComposition()
            vc.renderSize    = renderSize
            vc.frameDuration = CMTime(value: 1, timescale: 30)

            let instr = AVMutableVideoCompositionInstruction()
            instr.timeRange = CMTimeRange(start: .zero, duration: composition.duration)

            let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
            layer.setTransform(t, at: .zero)
            instr.layerInstructions = [layer]
            vc.instructions = [instr]
            videoComposition = vc
        }

        // Export
        let outName = "stitched_\(Int(Date().timeIntervalSince1970)).mp4"
        let outURL  = FileManager.default.temporaryDirectory.appendingPathComponent(outName)
        try? FileManager.default.removeItem(at: outURL)

        guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else { return }
        exporter.outputURL             = outURL
        exporter.outputFileType        = .mp4
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
```

**For single-clip preview** (called immediately after each recording), call this same function with one segment: `startMs: 0, durationMs: 999_000`. The AVFoundation code clamps to the actual clip length. This produces a merged MP4 with audio baked in — no JS timing jitter, perfect hardware sync.

---

## Audio/Video Sync — The Key Problem and True Fix

This is the most important technical problem in the entire app.

**Why sync is hard:**
When you call `startRecording()`, the camera hardware takes ~50–150ms to start capturing frames. Audio is already playing. So frame 0 of the video corresponds to `trimStartMs + ~100ms` in the song, not `trimStartMs` exactly. If you embed audio starting at `trimStartMs` in the preview clip, audio is ~100ms ahead of the video — audible as "video feels slightly late."

**The React Native prototype's limitation:**
In RN, `recordAsync()` gives you the output file URI but no timestamp information. You can sample the audio player position before calling it, but you still don't know when the first frame was actually captured by the sensor.

**The Swift fix (the reason to rewrite):**

Use both `AVCaptureMovieFileOutput` (for the output file) AND `AVCaptureVideoDataOutput` (for frame callbacks) in the same `AVCaptureSession`. The `AVCaptureVideoDataOutput` delegate fires `captureOutput(_:didOutput:from:)` for every frame with a `CMSampleBuffer` that contains an exact `CMTime` presentation timestamp.

```swift
var firstFrameTime: CMTime?

func captureOutput(_ output: AVCaptureOutput,
                   didOutput sampleBuffer: CMSampleBuffer,
                   from connection: AVCaptureConnection) {
    if firstFrameTime == nil {
        firstFrameTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    }
}
```

After recording ends, calculate the audio offset:
```swift
// audioPlayerTime is the AVAudioPlayer.currentTime (in seconds) at the moment
// you read firstFrameTime from the host clock. You need to correlate the
// AVCaptureSession clock (mach time) with AVAudioPlayer time.
// Simplest approach: record a wall-clock timestamp when recording starts,
// read AVAudioPlayer.currentTime at that same instant.

let recordingStartHostTime: TimeInterval = // recorded when startRecording() was called
let audioPositionAtStart = audioPlayer.currentTime  // seconds into file at that moment

// When firstFrameTime arrives:
let sessionStartTime: TimeInterval // = CMTimeGetSeconds(firstFrameTime) if using device clock
let offset = audioPositionAtStart + (sessionStartTime - recordingStartHostTime)
let audioStartMs = offset * 1000
```

Then pass `audioStartMs` (not `trimStartMs`) to the stitch function. The audio in the clip will start at the exact moment corresponding to frame 0.

**Simpler approximation if you don't want to deal with AVCaptureVideoDataOutput yet:**

Record a `Date()` timestamp when `startRecording()` is called. In `fileOutput(_:didStartRecordingTo:from:)` delegate, record another timestamp. The delta between these two timestamps is the recording start latency. Add that to the audio player position to get a reasonable estimate.

---

## AVAudioSession Configuration

Critical for iOS audio behavior:

```swift
// During countdown and recording (earphone playback + allow recording)
try AVAudioSession.sharedInstance().setCategory(
    .playAndRecord,
    options: [.defaultToSpeaker, .allowBluetooth]
)
try AVAudioSession.sharedInstance().setActive(true)

// During clip/stitch playback only
try AVAudioSession.sharedInstance().setCategory(.playback)
try AVAudioSession.sharedInstance().setActive(true)
```

Failure to switch from `.playAndRecord` to `.playback` before playing back clips will silence audio output — this was a bug in the RN prototype.

---

## File Management

- **Temporary directory** (`FileManager.default.temporaryDirectory`): for preview clips and stitched output. These can be evicted by iOS.
- **Documents directory**: if you want clips to survive backgrounding. The RN prototype used temp dir for everything.
- **Camera roll**: final stitched output only, via `PHPhotoLibrary`.

Copy important files to the documents directory if you want them to persist across sessions. For a take-and-stitch workflow, temp dir is fine since clips are only needed until the session ends.

---

## Permissions Required (Info.plist)

```xml
NSCameraUsageDescription
NSMicrophoneUsageDescription   (required even though audio isn't used — AVCaptureSession needs it)
NSPhotoLibraryAddUsageDescription
NSPhotoLibraryUsageDescription  (needed on some iOS versions for PHPhotoLibrary)
```

---

## What the React Native Prototype Got Right

- The overall screen flow and UX decisions are solid — keep them
- The pseudo-waveform approach (50 sine-derived bars) looks fine and avoids needing real waveform data
- The buildPlan() randomized cut algorithm works well — port it directly
- The "3s countdown with audio starting 3s before trimStart" gives the artist time to feel the beat before recording
- Max 10 clips, segment length enforced by maxDuration — keep these constraints
- The processing spinner after each recording ("Syncing audio…") sets correct expectations

## What the React Native Prototype Got Wrong (Fix These)

1. **No frame timestamp** — audio embedded at trimStartMs instead of actual first frame time (50–150ms off)
2. **Native module registration** — `RCT_EXPORT_METHOD` unreliable in RN 0.81 new architecture; avoid entirely by being in Swift
3. **Audio session not reset** — forgetting to switch from recording to playback mode silenced clip audio
4. **Stitch skipping short clips** — if `startMs > clip.duration`, the segment was skipped and the entire subsequent audio track fell out of sync. Fixed by clamping to 0, but still needs the clip to be long enough for true frame sync

---

## UI/Style Reference

Dark purple/black theme:
- Background: `#080612`
- Surface: `#100d1c`
- Surface elevated: `#181228`
- Border: `#251b3e`
- Accent (purple): `#8b5cf6`
- Accent glow: `#a78bfa`
- Record red: `#f43f5e`
- Primary text: `#f0ebff`
- Muted text: `#7c6b9e`
- Dim text: `#3d3057`

Glow effects on accent elements: `shadow(color: accentColor.opacity(0.7), radius: 18)` in SwiftUI.

---

## Swift-Specific Implementation Notes

**Camera preview in SwiftUI:**
SwiftUI does not have a built-in camera view. Use `UIViewRepresentable` to wrap `AVCaptureVideoPreviewLayer` inside a `UIView`.

**Orientation:**
Lock the app to portrait. Set `AVCaptureConnection.videoOrientation = .portrait` on all capture connections.

**Front camera mirror:**
Front camera video is mirrored by default. Set `connection.isVideoMirrored = true` on the movie output connection (or leave it — Triller-style apps typically don't flip the front camera output).

**AVAsset async loading (iOS 16+):**
In iOS 16+, `AVAsset.load(.duration)` is async. For iOS 15 compatibility use the synchronous `asset.duration` but call it off the main thread.

**Export to MP4:**
`AVAssetExportSession` with `presetName: AVAssetExportPresetHighestQuality` and `outputFileType: .mp4`. Always delete the output path before exporting (export fails silently if file exists).

**Watermark:**
Add a `CATextLayer` or `AVVideoCompositionCoreAnimationTool` to the export if you want a watermark. Do this from the start.

**Concurrency:**
Swift's `async/await` maps cleanly to JS `async/await`. Use `Task { }` where you'd use an async function call. Use `await MainActor.run { }` to update UI from background tasks.

---

## Build Order (Replicate the RN Prototype's Progress)

1. Camera screen: capture a silent video, get back a file URL — confirm it works on a real device
2. Single-clip preview: run the stitch function with one clip + one MP3, confirm audio plays in sync
3. Picker + trim UI: pick an MP3, drag handles, get trimStartMs/trimEndMs
4. Full recording flow: countdown → record → stitch preview → show in clips grid
5. ClipsScreen: grid + fullscreen player with proper audio session switching
6. StitchScreen: buildPlan → multi-clip stitch → save to camera roll
7. Re-edit (reorder/replace takes) — not yet built in RN prototype

---

## Current State of RN Prototype (What Was Finished)

- [x] PickerScreen — fully working
- [x] TrimScreen — drag handles, preview, confirm
- [x] CameraScreen — countdown, record, single-clip preview stitch, processing state
- [x] ClipsScreen — grid + fullscreen player, delete, audio mode switching
- [x] StitchScreen — buildPlan, multi-clip stitch, save to camera roll
- [x] Native AVFoundation stitch (Obj-C) — works for both preview and final stitch
- [ ] Frame-accurate audio sync (50–150ms offset remains)
- [ ] Re-edit UI (reorder / replace clips)
- [ ] Backend (upload, users, sharing) — not started
- [ ] Watermark — not implemented
- [ ] Real waveform (uses fake sine bars) — acceptable for now
