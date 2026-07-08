# Xcode Project Setup Checklist

## 1. Create the project
- New Project → iOS → App
- Interface: SwiftUI
- Language: Swift
- Product name: TrillerApp (or whatever)
- Minimum deployment: iOS 16.0

## 2. Add all .swift files
Drag every .swift file from this folder into the Xcode project navigator.
Make sure "Copy items if needed" is UNCHECKED if you want to edit in VSCode.
Make sure "Add to target: TrillerApp" IS checked.

## 3. Add permissions to Info.plist
In Xcode: select the project → Info tab → add these keys:

| Key                                    | Value                                              |
|----------------------------------------|----------------------------------------------------|
| NSCameraUsageDescription               | Record video takes for your music videos           |
| NSMicrophoneUsageDescription           | Required by the camera session                     |
| NSPhotoLibraryAddUsageDescription      | Save your stitched video to Camera Roll            |
| NSPhotoLibraryUsageDescription         | Save your stitched video to Camera Roll            |

## 4. Add capabilities
Project → Signing & Capabilities → + Capability:
- (Nothing extra needed for this app beyond default)

## 5. Signing
- Team: your Apple ID (free account works for device testing)
- Bundle identifier: com.yourname.trillerapp (must be unique)

## 6. Build and run
- Plug in your iPhone
- Select your device from the scheme picker
- Cmd+R

The simulator does NOT have a camera — always test on a real device.
