# Release-readiness report

Date: 2026-07-28.

Overall status: pre-release. The native Android evidence remains green and both
iOS native projects now build locally on macOS. A green hosted macOS workflow
and the release-record checks are still required before publishing.

## Completed evidence

- ESM package builds and exports the root API, schema, and package manifest.
- The packed tarball installs in an empty consumer and its CLI executes.
- All stable public error codes use the `LOOM_` prefix.
- Ordered merge, provenance, null deletion, array replacement, target
  rejection, conflict refusal, safe cleanup, local ignore preservation,
  passthrough, determinism, and second-run behavior have automated tests.
- The Android native fixture compiles generated resources with Gradle/AAPT2.
- The bare React Native Android demo completes `assembleDebug`.
- Xcode builds the generated iOS fixture for a generic iOS Simulator
  destination with code signing disabled.
- With Ruby 3.3.1, Bundler 2.5.9, and CocoaPods 1.15.2 from the repository
  `Gemfile.lock`, Xcode builds the bare React Native workspace for the same
  destination and the app launches on an iPhone 17 Pro simulator running iOS
  26.2.
- Xcode accepts the generated Light, Dark, and Tinted app-icon appearances,
  launch storyboard, light/dark launch assets, PBX membership, and deployment
  targets. The generated images were also inspected directly and in Simulator.
- A genuine Icon Composer `.icon` directory was passed through a clean generated
  fixture and compiled by Xcode 26.2. Assetloom records these PBX resources as
  `folder.iconcomposer.icon`; the prior generic-folder type was fixed and
  regression-tested.
- Fixture generation reports 14 unchanged files and zero writes on an unchanged
  second run. Demo generation reports 56 unchanged files and zero writes.
- Root `git status` is identical before and after generation. Generated native
  resources, `.assetloom/`, CocoaPods, Xcode workspaces, and build products are
  ignored without replacing existing ignore content.
- The Darwin arm64 benchmark with Node 26.3.0 completed 24 tasks in 82.26 ms
  cold and 8.14 ms warm, with 24 cold writes and zero warm writes.
- Root lint, package and demo typechecking, 13 tests, build, packed-package smoke
  test, generation verification, and native builds pass locally.
- Cross-platform quality CI and explicit Android/iOS native CI are configured.
- The prohibited dependency and public-export audits find no Expo dependency,
  API, target, adapter, configuration, fixture, or generated output.

## Local macOS verification

The final local environment was macOS 26.5.1 (25F80), Xcode 26.2 (17C52),
Icon Composer 1.2 (76), and iOS Simulator 26.2. Supporting tools were Node
26.3.0, Corepack 0.35.0, Yarn 4.9.2, Ruby 3.3.1, Bundler 2.5.9, CocoaPods
1.15.2, and OpenJDK 17.0.20.

The root quality suite passed with:

```sh
corepack enable
yarn install --immutable
yarn lint
yarn typecheck
yarn test
yarn build
yarn pack:smoke
```

The final fixture generation, verification, and native build passed with:

```sh
cd fixtures/ios-native
node ../../packages/assetloom/lib/cli.js generate -c assetloom.json
node ../../packages/assetloom/lib/cli.js verify -c assetloom.json
cd ../..
xcodebuild -project fixtures/ios-native/AssetloomFixture.xcodeproj \
  -scheme AssetloomFixture -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

The final bare React Native generation, verification, and native build passed
with:

```sh
cd apps/demo-react-native
bundle install
bundle exec pod install --project-directory=ios
yarn assets:generate
yarn assets:verify
cd ../..
xcodebuild -workspace apps/demo-react-native/ios/AssetloomDemo.xcworkspace \
  -scheme AssetloomDemo -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

The `-sdk iphonesimulator` Xcode commands used by `native-ios.yml` also passed
locally after the workflow was changed to install pods before generation and
to verify both generated projects.

## Required before an npm release

- Obtain a green hosted `native-ios` workflow run. The workflow now installs the
  demo's pinned Ruby bundle and runs CocoaPods through Bundler.
- Replace the committed structural `.icon` placeholder only when an appropriate
  reproducible branded demo export is available. Genuine `.icon` passthrough
  compilation is verified, but the placeholder is not a visual demo asset.
- Record benchmark results for release hardware and compare them with the local
  baseline.
- Review the packed file list and attach checksums to the release record.
