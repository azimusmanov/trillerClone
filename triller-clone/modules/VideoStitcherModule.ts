import { NativeModules } from 'react-native';

const { VideoStitcher } = NativeModules;

export type StitchSegment = {
  uri: string;
  startMs: number;   // where in the clip to start (chronological position in song)
  durationMs: number;
};

export function stitchVideos(
  segments: StitchSegment[],
  audioUri: string | null,
  trimStartMs: number,
  trimEndMs: number,
): Promise<string> {
  if (!VideoStitcher) {
    return Promise.reject(new Error('VideoStitcher native module not found. Rebuild the app.'));
  }
  return VideoStitcher.stitch(segments, audioUri ?? '', trimStartMs, trimEndMs);
}
