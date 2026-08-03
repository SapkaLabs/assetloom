# AssetLoom bare React Native demo

This is a caller-owned bare React Native application. AssetLoom is a development
dependency that publishes complete Android/iOS resources before native
compilation and returns a versioned catalog describing them.

```sh
yarn assets:plan
yarn assets:generate
yarn assets:report
yarn assets:verify
yarn android
yarn ios
```

`base.assetloom.json` declares the Android resource directory and iOS asset
catalog as explicit output roots. `demo-brand.assetloom.json` is merged second,
adds the report identity, and overrides brand colors. No configuration points
AssetLoom at `AndroidManifest.xml`, `Info.plist`, or the Xcode project.

## Publish and consume

`assets:generate` performs three explicit steps:

1. Publish complete generated files under the declared Android/iOS roots.
2. Write the canonical `GenerationResultV1` to
   `.assetloom/results/react-native-demo.json` and create the HTML report.
3. Run the caller-owned `scripts/consume-assetloom-result.mjs` validation.

The consumer script validates the public result contract and descriptor
references, then checks that this application has deliberately configured its
own native projects:

- `AndroidManifest.xml` selects `@mipmap/ic_launcher`,
  `@mipmap/ic_launcher_round`, and the generated `@style/AssetloomTheme`.
- The Xcode project registers `Images.xcassets` and
  `AssetloomLaunchScreen.storyboard`, and selects the `AppIcon` set.
- `Info.plist` selects `AssetloomLaunchScreen`.

Those committed native changes belong to this React Native application. The
AssetLoom package never reads or modifies them. The same consumer validation
runs after `assets:verify`.

The generated result currently describes app icons, adaptive/monochrome Android
icons, notification resources, light/dark splash resources, the iOS app-icon
catalog, and the launch storyboard. Notification code may select
`assetloom_notification` from the returned Android descriptors when the app
adds a notification implementation.

## White-label overrides

For a dynamic white-label build, produce another JSON file at runtime and pass
it last, then consume the requested result file:

```sh
assetloom generate \
  -c config/base.assetloom.json \
  -c config/demo-brand.assetloom.json \
  -c path/to/generated-runtime.assetloom.json \
  --result-file react-native-demo.json
yarn assets:consume
```

`runtime.assetloom.example.json` demonstrates an adaptive background image and
optional Apple Icon Composer package passthrough. Replace the sample `.icon`
directory with a package exported by Icon Composer before using that override.

The consuming repository explicitly ignores generated resource paths and
`.assetloom/`; AssetLoom does not edit `.gitignore`, `.git/info/exclude`, Gradle,
Xcode, plist, manifests, package metadata, or application source. A second
unchanged `assets:generate` run performs zero artifact content writes and
returns the complete catalog as unchanged.

CI should run `assets:generate` before Gradle or Xcode. Generation is not hidden
inside a native build phase.
