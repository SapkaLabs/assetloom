# Apple application-resource research

Status: authoritative inputs for preset version 1.

## App-icon appearances

iOS and iPadOS support Light, Dark, and Tinted app-icon appearances. Xcode's
single-size app-icon mode accepts a 1024 × 1024 source for the default
appearance and optional luminosity variants; tinted artwork should be
grayscale. Assetloom emits these variants in `AppIcon.appiconset` and records
their appearance slots in `Contents.json`.

Sources:

- [Configuring an app icon using an asset catalog](https://developer.apple.com/documentation/xcode/configuring-your-app-icon)
- [Asset Catalog Format Reference: App Icon Type](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/AppIconType.html)
- [Asset Catalog Format Reference: Contents.json](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/Contents.html)

## Icon Composer and Liquid Glass

Current Xcode can use an Icon Composer `.icon` package as the app-icon source.
Icon Composer owns Liquid Glass layers, material effects, and platform
appearance customization. Its package is treated as opaque: Assetloom copies a
user-exported `.icon` directory byte-for-byte, selects its basename in the Xcode
app-icon build setting, and never synthesizes or rewrites proprietary contents.

Source: [Creating an app icon using Icon Composer](https://developer.apple.com/documentation/xcode/creating-your-app-icon-using-icon-composer).

## Asset catalogs

Asset catalog item types are encoded in folder extensions. App icon sets use
`.appiconset`, image sets use `.imageset`, and named colors use `.colorset`.
Each generated set has a required `Contents.json` and unique asset name.
Assetloom uses one committed parent `Images.xcassets` and owns only its generated
children.

Sources:

- [Asset Catalog Format Reference: Types](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/AssetTypes.html)
- [Asset Catalog Format Reference: Folders](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/FolderStructure.html)

## Launch screens

Apple permits a launch screen configured through the information property list
or a storyboard. A launch storyboard must contain UIKit objects only, use a
single root view or view controller, avoid code connections and custom classes,
and use layout constraints for different screen sizes.

Assetloom emits a simple storyboard with a centered named image and named
background color. Light and dark asset-catalog appearances provide runtime
selection without launch-time code.

Sources:

- [Specifying an app's launch screen](https://developer.apple.com/documentation/xcode/specifying-your-apps-launch-screen)
- [Responding to app launch](https://developer.apple.com/documentation/UIKit/responding-to-the-launch-of-your-app)

## Project and command-line integration

For traditional PBX groups, generated storyboards require a file reference and
membership in the Resources build phase. File-system-synchronized Xcode groups
discover files from the directory and do not require a PBX entry. Assetloom
handles both forms and updates build settings idempotently.

Apple documents `actool` as the command-line tool that compiles, prints,
updates, and verifies asset catalogs. End-to-end CI uses `xcodebuild`, which
also compiles the storyboard and Swift application.

Sources:

- [Managing files and folders in an Xcode project](https://developer.apple.com/documentation/xcode/managing-files-and-folders-in-your-xcode-project)
- [Xcode command-line tool reference](https://developer.apple.com/documentation/xcode/xcode-command-line-tool-reference)

## Verification

Structural verification parses generated JSON, decodes every PNG, and checks
hashes, planned dimensions, formats, and required outputs. Native verification
uses the configured `.xcodeproj` and shared scheme with code signing disabled;
the macOS CI job runs the same Xcode build against the native fixture.
