#import <React/RCTBridgeModule.h>
#import <AVFoundation/AVFoundation.h>

@interface VideoStitcher : NSObject <RCTBridgeModule>
@end

@implementation VideoStitcher

RCT_EXPORT_MODULE()
+ (BOOL)requiresMainQueueSetup { return NO; }

// ─── helpers ──────────────────────────────────────────────────────────────────

static NSString* filePath(NSString *uri) {
  return [uri hasPrefix:@"file://"] ? [uri substringFromIndex:7] : uri;
}

static void applyRotationFix(AVMutableCompositionTrack *track,
                              AVAssetTrack *src,
                              AVMutableVideoComposition **outVC,
                              CMTime duration) {
  CGAffineTransform t   = src.preferredTransform;
  CGSize natural        = src.naturalSize;
  CGRect displayRect    = CGRectApplyAffineTransform(CGRectMake(0,0,natural.width,natural.height), t);
  CGSize renderSize     = CGSizeMake(ABS(displayRect.size.width), ABS(displayRect.size.height));

  AVMutableVideoComposition *vc = [AVMutableVideoComposition videoComposition];
  vc.renderSize    = renderSize;
  vc.frameDuration = CMTimeMake(1, 30);

  AVMutableVideoCompositionInstruction *instr = [AVMutableVideoCompositionInstruction videoCompositionInstruction];
  instr.timeRange  = CMTimeRangeMake(kCMTimeZero, duration);

  AVMutableVideoCompositionLayerInstruction *layer =
    [AVMutableVideoCompositionLayerInstruction videoCompositionLayerInstructionWithAssetTrack:track];
  [layer setTransform:t atTime:kCMTimeZero];

  instr.layerInstructions = @[layer];
  vc.instructions         = @[instr];
  *outVC = vc;
}

static void exportComposition(AVMutableComposition *composition,
                               AVMutableVideoComposition *vc,
                               NSString *outPath,
                               RCTPromiseResolveBlock resolve,
                               RCTPromiseRejectBlock reject) {
  NSURL *outUrl = [NSURL fileURLWithPath:outPath];
  if ([[NSFileManager defaultManager] fileExistsAtPath:outPath])
    [[NSFileManager defaultManager] removeItemAtPath:outPath error:nil];

  AVAssetExportSession *exp = [[AVAssetExportSession alloc]
    initWithAsset:composition presetName:AVAssetExportPresetHighestQuality];
  exp.outputURL                    = outUrl;
  exp.outputFileType               = AVFileTypeMPEG4;
  exp.shouldOptimizeForNetworkUse  = YES;
  if (vc) exp.videoComposition     = vc;

  [exp exportAsynchronouslyWithCompletionHandler:^{
    if (exp.error) reject(@"ERR", exp.error.localizedDescription, exp.error);
    else           resolve(outUrl.absoluteString);
  }];
}

// ─── mergeAudio: embed MP3 audio into a single clip video ─────────────────────
// Called immediately after each recording so preview playback is one file — no JS sync needed.

RCT_EXPORT_METHOD(mergeAudio:(NSString *)videoUri
                  audioUri:(NSString *)audioUri
                  audioStartMs:(double)audioStartMs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    AVURLAsset *videoAsset = [AVURLAsset assetWithURL:[NSURL fileURLWithPath:filePath(videoUri)]];
    AVURLAsset *audioAsset = [AVURLAsset assetWithURL:[NSURL fileURLWithPath:filePath(audioUri)]];

    NSArray *vTracks = [videoAsset tracksWithMediaType:AVMediaTypeVideo];
    if (!vTracks.count) { reject(@"ERR_MERGE", @"No video track in clip", nil); return; }
    AVAssetTrack *srcVideo = vTracks[0];

    AVMutableComposition *comp = [AVMutableComposition composition];

    // Insert full video
    AVMutableCompositionTrack *compVideo =
      [comp addMutableTrackWithMediaType:AVMediaTypeVideo preferredTrackID:kCMPersistentTrackID_Invalid];
    NSError *err = nil;
    [compVideo insertTimeRange:CMTimeRangeMake(kCMTimeZero, videoAsset.duration)
                       ofTrack:srcVideo atTime:kCMTimeZero error:&err];
    if (err) { reject(@"ERR_MERGE", err.localizedDescription, err); return; }

    // Insert matching audio segment
    NSArray *aTracks = [audioAsset tracksWithMediaType:AVMediaTypeAudio];
    if (aTracks.count) {
      AVMutableCompositionTrack *compAudio =
        [comp addMutableTrackWithMediaType:AVMediaTypeAudio preferredTrackID:kCMPersistentTrackID_Invalid];
      CMTime aStart    = CMTimeMakeWithSeconds(audioStartMs / 1000.0, 600);
      CMTime available = CMTimeSubtract(audioAsset.duration, aStart);
      CMTime aDur      = CMTimeMinimum(videoAsset.duration, available);
      [compAudio insertTimeRange:CMTimeRangeMake(aStart, aDur)
                         ofTrack:aTracks[0] atTime:kCMTimeZero error:nil];
    }

    AVMutableVideoComposition *vc = nil;
    applyRotationFix(compVideo, srcVideo, &vc, comp.duration);

    NSString *out = [NSTemporaryDirectory()
      stringByAppendingPathComponent:[NSString stringWithFormat:@"preview_%ld.mp4",
        (long)[[NSDate date] timeIntervalSince1970]]];
    exportComposition(comp, vc, out, resolve, reject);
  });
}

// ─── stitch: concatenate segments with audio overlay ──────────────────────────

RCT_EXPORT_METHOD(stitch:(NSArray *)segments
                  audioUri:(NSString *)audioUri
                  trimStartMs:(double)trimStartMs
                  trimEndMs:(double)trimEndMs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    AVMutableComposition *comp = [AVMutableComposition composition];
    AVMutableCompositionTrack *videoTrack =
      [comp addMutableTrackWithMediaType:AVMediaTypeVideo preferredTrackID:kCMPersistentTrackID_Invalid];
    CMTime insertTime = kCMTimeZero;
    AVAssetTrack *firstSrc = nil;

    for (NSDictionary *seg in segments) {
      NSString *uri   = seg[@"uri"];
      NSNumber *durMs = seg[@"durationMs"];
      NSNumber *stMs  = seg[@"startMs"];
      if (!uri || !durMs || !stMs) continue;

      AVURLAsset *asset = [AVURLAsset assetWithURL:[NSURL fileURLWithPath:filePath(uri)]];
      NSArray *tracks   = [asset tracksWithMediaType:AVMediaTypeVideo];
      if (!tracks.count) continue;
      AVAssetTrack *src = tracks[0];
      if (!firstSrc) firstSrc = src;

      CMTime segStart = CMTimeMakeWithSeconds([stMs doubleValue]  / 1000.0, 600);
      CMTime segDur   = CMTimeMakeWithSeconds([durMs doubleValue] / 1000.0, 600);

      // If the clip is shorter than the seek position, restart from frame 0.
      // This keeps the composition timeline aligned with the audio — never skip segments.
      if (CMTIME_IS_INVALID(asset.duration) || CMTimeCompare(segStart, asset.duration) >= 0) {
        segStart = kCMTimeZero;
      }

      CMTime available = CMTimeSubtract(asset.duration, segStart);
      if (CMTIME_IS_INVALID(available) || CMTimeCompare(available, kCMTimeZero) <= 0) continue;
      CMTime clipDur = CMTimeMinimum(segDur, available);

      NSError *e = nil;
      [videoTrack insertTimeRange:CMTimeRangeMake(segStart, clipDur) ofTrack:src atTime:insertTime error:&e];
      if (!e) insertTime = CMTimeAdd(insertTime, clipDur);
    }

    if (audioUri.length > 0) {
      AVURLAsset *audioAsset = [AVURLAsset assetWithURL:[NSURL fileURLWithPath:filePath(audioUri)]];
      NSArray *aTracks = [audioAsset tracksWithMediaType:AVMediaTypeAudio];
      if (aTracks.count) {
        AVMutableCompositionTrack *audioTrack =
          [comp addMutableTrackWithMediaType:AVMediaTypeAudio preferredTrackID:kCMPersistentTrackID_Invalid];
        CMTime aStart   = CMTimeMakeWithSeconds(trimStartMs / 1000.0, 600);
        CMTime aEnd     = CMTimeMakeWithSeconds(trimEndMs   / 1000.0, 600);
        CMTime clamped  = CMTimeMinimum(CMTimeSubtract(aEnd, aStart), insertTime);
        [audioTrack insertTimeRange:CMTimeRangeMake(aStart, clamped)
                            ofTrack:aTracks[0] atTime:kCMTimeZero error:nil];
      }
    }

    AVMutableVideoComposition *vc = nil;
    if (firstSrc) applyRotationFix(videoTrack, firstSrc, &vc, comp.duration);

    NSString *out = [NSTemporaryDirectory()
      stringByAppendingPathComponent:[NSString stringWithFormat:@"stitched_%ld.mp4",
        (long)[[NSDate date] timeIntervalSince1970]]];
    exportComposition(comp, vc, out, resolve, reject);
  });
}

@end
