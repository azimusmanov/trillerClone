import { NativeModules } from 'react-native';

const { VideoStitcher } = NativeModules;

export type StitchSegment = {
  uri: string;
  startMs: number;
  durationMs: number;
};

/** Embeds audio into a clip video. Returns a merged file:// URI. */
export function mergeAudio(
  videoUri: string,
  audioUri: string,
  audioStartMs: number,
): Promise<string> {
  if (!VideoStitcher) return Promise.reject(new Error('VideoStitcher native module not found.'));
  return VideoStitcher.mergeAudio(videoUri, audioUri, audioStartMs);
}

/** Concatenates video segments with audio overlay into a single MP4. */
export function stitchVideos(
  segments: StitchSegment[],
  audioUri: string | null,
  trimStartMs: number,
  trimEndMs: number,
): Promise<string> {
  if (!VideoStitcher) return Promise.reject(new Error('VideoStitcher native module not found.'));
  return VideoStitcher.stitch(segments, audioUri ?? '', trimStartMs, trimEndMs);
}
