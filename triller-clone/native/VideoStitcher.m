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
    AVMutableCompositionTrack *videoTrack = [composition addMutableTrackWithMediaType:AVMediaTypeVideo
                                                                    preferredTrackID:kCMPersistentTrackID_Invalid];
    CMTime insertTime = kCMTimeZero;

    for (NSDictionary *segment in segments) {
      NSString *uri = segment[@"uri"];
      NSNumber *durMs = segment[@"durationMs"];
      if (!uri || !durMs) continue;

      NSString *filePath = [uri hasPrefix:@"file://"] ? [uri substringFromIndex:7] : uri;
      AVURLAsset *asset = [AVURLAsset assetWithURL:[NSURL fileURLWithPath:filePath]];

      NSArray *tracks = [asset tracksWithMediaType:AVMediaTypeVideo];
      if (!tracks.count) continue;

      CMTime segDur  = CMTimeMakeWithSeconds([durMs doubleValue] / 1000.0, 600);
      CMTime clipDur = CMTimeMinimum(segDur, asset.duration);
      CMTimeRange range = CMTimeRangeMake(kCMTimeZero, clipDur);

      NSError *err = nil;
      [videoTrack insertTimeRange:range ofTrack:tracks[0] atTime:insertTime error:&err];
      if (!err) insertTime = CMTimeAdd(insertTime, clipDur);
    }

    // Audio overlay
    if (audioUri.length > 0) {
      NSString *audioPath = [audioUri hasPrefix:@"file://"] ? [audioUri substringFromIndex:7] : audioUri;
      AVURLAsset *audioAsset = [AVURLAsset assetWithURL:[NSURL fileURLWithPath:audioPath]];
      NSArray *audioTracks = [audioAsset tracksWithMediaType:AVMediaTypeAudio];

      if (audioTracks.count) {
        AVMutableCompositionTrack *audioTrack = [composition addMutableTrackWithMediaType:AVMediaTypeAudio
                                                                        preferredTrackID:kCMPersistentTrackID_Invalid];
        CMTime aStart  = CMTimeMakeWithSeconds(trimStartMs / 1000.0, 600);
        CMTime aEnd    = CMTimeMakeWithSeconds(trimEndMs   / 1000.0, 600);
        CMTime aDur    = CMTimeSubtract(aEnd, aStart);
        CMTime clamped = CMTimeMinimum(aDur, insertTime);

        [audioTrack insertTimeRange:CMTimeRangeMake(aStart, clamped)
                            ofTrack:audioTracks[0]
                             atTime:kCMTimeZero
                              error:nil];
      }
    }

    // Output path in tmp directory
    NSString *outName   = [NSString stringWithFormat:@"stitched_%ld.mp4", (long)[[NSDate date] timeIntervalSince1970]];
    NSString *outPath   = [NSTemporaryDirectory() stringByAppendingPathComponent:outName];
    NSURL    *outUrl    = [NSURL fileURLWithPath:outPath];

    if ([[NSFileManager defaultManager] fileExistsAtPath:outPath]) {
      [[NSFileManager defaultManager] removeItemAtPath:outPath error:nil];
    }

    AVAssetExportSession *exporter = [[AVAssetExportSession alloc] initWithAsset:composition
                                                                      presetName:AVAssetExportPresetHighestQuality];
    exporter.outputURL              = outUrl;
    exporter.outputFileType         = AVFileTypeMPEG4;
    exporter.shouldOptimizeForNetworkUse = YES;

    [exporter exportAsynchronouslyWithCompletionHandler:^{
      if (exporter.error) {
        reject(@"ERR_STITCH", exporter.error.localizedDescription, exporter.error);
      } else {
        resolve(outUrl.absoluteString);
      }
    }];
  });
}

@end
