import { NativeModules } from 'react-native';

const { VideoStitcher } = NativeModules;

export type StitchSegment = {
  uri: string;
  durationMs: number;
};

/**
 * Concatenates video segments and overlays a trimmed audio track.
 * Returns a file:// URI pointing to the stitched MP4 in the temp directory.
 */
export function stitchVideos(
  segments: StitchSegment[],
  audioUri: string | null,
  trimStartMs: number,
  trimEndMs: number,
): Promise<string> {
  if (!VideoStitcher) {
    return Promise.reject(new Error('VideoStitcher native module not found. Make sure you ran expo prebuild and rebuilt the app.'));
  }
  return VideoStitcher.stitch(segments, audioUri ?? '', trimStartMs, trimEndMs);
}
