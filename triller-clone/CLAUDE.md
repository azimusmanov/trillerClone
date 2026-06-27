@AGENTS.md

# CLAUDE.md

Project context for Claude Code. Read this before making changes.

## What this is

A mobile app (TikTok/Triller-style) for filming dance videos synced to music. Core user flow:

1. User uploads a sound (MP3, or audio extracted from a video file)
2. User trims the audio to the section they want
3. User films multiple video takes dancing to the song
4. App auto-stitches the takes into one continuous video, with the audio track over it
5. User can re-edit (reorder, replace, or re-record takes)

Target users: underground rappers and their audiences. Early testers are real people the developer knows personally, so ship rough and iterate.

## Core technical decision: record silently, sync in post

We do NOT try to record video with live audio playback through the speaker (causes mic bleed and sync headaches). Instead:

- Video takes are recorded **silently** (video only, no captured audio matters)
- Each take stores the timestamp offset (startMs) where it begins in the song
- During stitching, FFmpeg overlays the trimmed audio track onto the concatenated video using those offsets

This is the single most important architectural constraint. Do not reintroduce live-audio recording.

## Tech stack

### Mobile (this repo)
- React Native via **Expo SDK 54** (pinned to match the developer's Expo Go app — do not upgrade past 54 without confirming the phone's Expo Go supports it)
- TypeScript
- expo-camera — video capture
- expo-av — audio playback / handling
- expo-document-picker — picking MP3s
- expo-media-library / expo-file-system — saving and managing files

### Backend (separate, not built yet)
- Node.js + TypeScript (Express or Fastify)
- AWS S3 — store raw takes and final outputs (undecided)
- PostgreSQL — users, projects, takes metadata
- BullMQ + Redis — queue stitching jobs (async, never synchronous)

### Video processing
- **FFmpeg** is the core of the stitching pipeline (trim audio, concat video takes, overlay audio, normalize resolution/fps)
- Run FFmpeg as a background job (Lambda container or ECS), never in the main API process
- fluent-ffmpeg as the Node wrapper

## Known gotchas

- Mobile video formats differ: iOS records HEVC (.mov), Android records H.264 (.mp4). Transcode everything to H.264 MP4 on ingest before stitching.
- Recorded videos save to the app cache directory by default (temporary). Copy to documentDirectory to persist, then upload to S3.
- Frame-accurate sync depends on storing startMs per take at record-start time.
- Expo SDK version must match the phone's Expo Go supported SDK, or the app won't load.

## Build order (current phase: POC)

The current goal is proving the core loop end to end before building product UI:

1. [ ] Camera screen: record a silent video take, get back a file URI (the hardest native piece — do this first)
2. [ ] Local FFmpeg script: stitch one video take + one trimmed MP3 into a playable output
3. [ ] Audio picker + trim UI
4. [ ] Multi-take recording and management
5. [ ] Wire stitching to a backend job
6. [ ] Re-edit UI (reorder / replace takes)

Do not jump ahead to polish, auth, or infra until the core record→stitch loop is proven.

## Conventions

- Watermark final output (subtle) from the start.
- Test on real devices, not simulators (camera/audio behavior in simulators is unreliable).