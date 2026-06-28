#import <React/RCTBridgeModule.h>
#import <AVFoundation/AVFoundation.h>

@interface VideoStitcher : NSObject <RCTBridgeModule>
@end

@implementation VideoStitcher

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup { return NO; }

RCT_EXPORT_METHOD(stitch:(NSArray *)segments
                  audioUri:(NSString *)audioUri
                  trimStartMs:(double)trimStartMs
                  trimEndMs:(double)trimEndMs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    AVMutableComposition *composition = [AVMutableComposition composition];
    AVMutableCompositionTrack *videoTrack =
      [composition addMutableTrackWithMediaType:AVMediaTypeVideo
                               preferredTrackID:kCMPersistentTrackID_Invalid];
    CMTime insertTime = kCMTimeZero;
    AVAssetTrack *firstSrcTrack = nil;

    for (NSDictionary *segment in segments) {
      NSString *uri     = segment[@"uri"];
      NSNumber *durMs   = segment[@"durationMs"];
      NSNumber *startMs = segment[@"startMs"]; // chronological position in the song
      if (!uri || !durMs || !startMs) continue;

      NSString *filePath = [uri hasPrefix:@"file://"] ? [uri substringFromIndex:7] : uri;
      AVURLAsset *asset  = [AVURLAsset assetWithURL:[NSURL fileURLWithPath:filePath]];

      NSArray *tracks = [asset tracksWithMediaType:AVMediaTypeVideo];
      if (!tracks.count) continue;
      AVAssetTrack *srcTrack = tracks[0];

      if (!firstSrcTrack) firstSrcTrack = srcTrack;

      // Start reading from the correct chronological position in the clip
      CMTime segStart     = CMTimeMakeWithSeconds([startMs doubleValue] / 1000.0, 600);
      CMTime segDur       = CMTimeMakeWithSeconds([durMs doubleValue]   / 1000.0, 600);
      CMTime available    = CMTimeSubtract(asset.duration, segStart);

      // Skip if this clip doesn't have content at the required position
      if (CMTIME_IS_INVALID(available) || CMTimeCompare(available, kCMTimeZero) <= 0) continue;

      CMTime clipDur  = CMTimeMinimum(segDur, available);
      CMTimeRange range = CMTimeRangeMake(segStart, clipDur);

      NSError *err = nil;
      [videoTrack insertTimeRange:range ofTrack:srcTrack atTime:insertTime error:&err];
      if (!err) insertTime = CMTimeAdd(insertTime, clipDur);
    }

    // Audio overlay
    if (audioUri.length > 0) {
      NSString *audioPath = [audioUri hasPrefix:@"file://"] ? [audioUri substringFromIndex:7] : audioUri;
      AVURLAsset *audioAsset = [AVURLAsset assetWithURL:[NSURL fileURLWithPath:audioPath]];
      NSArray *audioTracks   = [audioAsset tracksWithMediaType:AVMediaTypeAudio];

      if (audioTracks.count) {
        AVMutableCompositionTrack *audioTrack =
          [composition addMutableTrackWithMediaType:AVMediaTypeAudio
                                   preferredTrackID:kCMPersistentTrackID_Invalid];
        CMTime aStart   = CMTimeMakeWithSeconds(trimStartMs / 1000.0, 600);
        CMTime aEnd     = CMTimeMakeWithSeconds(trimEndMs   / 1000.0, 600);
        CMTime aDur     = CMTimeSubtract(aEnd, aStart);
        CMTime clamped  = CMTimeMinimum(aDur, insertTime);

        [audioTrack insertTimeRange:CMTimeRangeMake(aStart, clamped)
                            ofTrack:audioTracks[0]
                             atTime:kCMTimeZero
                              error:nil];
      }
    }

    // Output file
    NSString *outName = [NSString stringWithFormat:@"stitched_%ld.mp4",
                         (long)[[NSDate date] timeIntervalSince1970]];
    NSString *outPath = [NSTemporaryDirectory() stringByAppendingPathComponent:outName];
    NSURL    *outUrl  = [NSURL fileURLWithPath:outPath];

    if ([[NSFileManager defaultManager] fileExistsAtPath:outPath])
      [[NSFileManager defaultManager] removeItemAtPath:outPath error:nil];

    AVAssetExportSession *exporter =
      [[AVAssetExportSession alloc] initWithAsset:composition
                                       presetName:AVAssetExportPresetHighestQuality];
    exporter.outputURL          = outUrl;
    exporter.outputFileType     = AVFileTypeMPEG4;
    exporter.shouldOptimizeForNetworkUse = YES;

    // Fix rotation from first source clip
    if (firstSrcTrack) {
      CGAffineTransform t    = firstSrcTrack.preferredTransform;
      CGSize natural         = firstSrcTrack.naturalSize;
      CGRect displayRect     = CGRectApplyAffineTransform(CGRectMake(0, 0, natural.width, natural.height), t);
      CGSize renderSize      = CGSizeMake(ABS(displayRect.size.width), ABS(displayRect.size.height));

      AVMutableVideoComposition *vc = [AVMutableVideoComposition videoComposition];
      vc.renderSize    = renderSize;
      vc.frameDuration = CMTimeMake(1, 30);

      AVMutableVideoCompositionInstruction *instr = [AVMutableVideoCompositionInstruction videoCompositionInstruction];
      instr.timeRange = CMTimeRangeMake(kCMTimeZero, composition.duration);

      AVMutableVideoCompositionLayerInstruction *layer =
        [AVMutableVideoCompositionLayerInstruction videoCompositionLayerInstructionWithAssetTrack:videoTrack];
      [layer setTransform:t atTime:kCMTimeZero];

      instr.layerInstructions = @[layer];
      vc.instructions         = @[instr];
      exporter.videoComposition = vc;
    }

    [exporter exportAsynchronouslyWithCompletionHandler:^{
      if (exporter.error)
        reject(@"ERR_STITCH", exporter.error.localizedDescription, exporter.error);
      else
        resolve(outUrl.absoluteString);
    }];
  });
}

@end
