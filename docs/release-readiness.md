# Release-readiness report

Date: 2026-07-28.

Overall status: pre-release; native implementation complete, macOS CI evidence
required before publishing.

## Completed evidence

- ESM package builds and exports the root API, schema, and package manifest.
- The packed tarball installs in an empty consumer and its CLI executes.
- All stable public error codes use the `LOOM_` prefix.
- Ordered merge, provenance, null deletion, array replacement, target
  rejection, conflict refusal, safe cleanup, local ignore preservation,
  passthrough, determinism, and second-run behavior have automated tests.
- The Android native fixture compiles generated resources with Gradle/AAPT2.
- The bare React Native Android demo completes `assembleDebug`.
- Both generated Xcode project files parse as OpenStep PBX projects.
- iOS images, catalogs, launch storyboard, ownership hashes, and no-alpha app
  icons pass portable verification.
- Cross-platform quality CI and explicit Android/iOS native CI are configured.
- The prohibited dependency audit returns no matching packages.

## Required before an npm release

- Obtain a green macOS `native-ios` workflow run using the repository's Xcode
  project and shared schemes.
- Confirm the current Xcode version accepts Light, Dark, and Tinted appearance
  slots and the generated launch storyboard without warnings.
- Replace the demo passthrough placeholder with a real Icon Composer export
  when publishing a passthrough screenshot or compatibility claim.
- Record benchmark results for release hardware and compare them with the local
  baseline.
- Review the packed file list and attach checksums to the release record.
