# `@sapkalabs/assetloom`

Assetloom generates deterministic Android and iOS application resources from
SVG, PNG, or WebP source artwork. It is designed for native projects and bare
React Native projects. Expo is not supported.

## Install

```sh
yarn add --dev @sapkalabs/assetloom
```

Create an `assetloom.json` in the application root. It declares the native
project paths and resources to generate; see the
[configuration reference](https://github.com/SapkaLabs/assetloom/blob/main/docs/configuration.md)
for a complete example.

## React Native

Keep generation explicit in the application scripts:

```json
{
  "scripts": {
    "assets:generate": "assetloom generate -c assetloom.json --report",
    "assets:report": "assetloom report -c assetloom.json",
    "assets:verify": "assetloom verify -c assetloom.json",
    "android": "yarn assets:generate && react-native run-android",
    "ios": "yarn assets:generate && react-native run-ios"
  }
}
```

Run Metro and the native application as usual:

```sh
yarn start
yarn android
# or
yarn ios
```

Install CocoaPods through the application's normal `Gemfile` and `Podfile`
before the first iOS launch. Do not add Assetloom to Gradle or Xcode build
phases; generated resources are intended to exist before native compilation.

## CLI

Pass configuration files in merge order; later values override earlier values.
`null` deletes a value, objects merge recursively, and arrays replace earlier
arrays.

```sh
assetloom plan -c config/base.assetloom.json -c config/brand.assetloom.json
assetloom generate -c config/base.assetloom.json -c config/brand.assetloom.json --report
assetloom report -c config/base.assetloom.json -c config/brand.assetloom.json
assetloom verify -c config/base.assetloom.json -c config/brand.assetloom.json
assetloom clean -c config/base.assetloom.json -c config/brand.assetloom.json
```

Filter generation or verification with `--target android` or `--target ios`.
Use `--json` for machine-readable output and `--verbose` to include diagnostic
stacks for failures.

`generate --report` writes a deterministic, self-contained HTML review to
`.assetloom/reports/<configuration-name>.html`. It embeds configured source
artwork, actual generated images, native integration files, and manifest
integrity diagnostics. Repeated density outputs are summarized in the visual
sections, while a complete file tree provides click-to-preview access to every
generated file. Run `report` by itself to inspect the resources already on
disk, or use `--report-output reports/acme.html` to select a destination.
See the [reporting guide](https://github.com/SapkaLabs/assetloom/blob/main/docs/reporting.md)
for multi-customer workflows.

Generation owns only paths recorded in `.assetloom/manifest.json`. Unchanged
content is not rewritten, and cleanup refuses to remove an owned path whose
content was changed outside Assetloom. Keep `.assetloom/` and generated native
resources locally Git-ignored.

The content-addressed render cache survives configuration switches and
`assetloom clean`. Cache reuse depends on the effective source bytes and render
settings, not on configuration filenames or resource names.

The JSON Schema is exported as `@sapkalabs/assetloom/schema`.

Documentation:

- [Configuration](https://github.com/SapkaLabs/assetloom/blob/main/docs/configuration.md)
- [HTML reports](https://github.com/SapkaLabs/assetloom/blob/main/docs/reporting.md)
- [Error codes](https://github.com/SapkaLabs/assetloom/blob/main/docs/error-codes.md)
- [Architecture](https://github.com/SapkaLabs/assetloom/blob/main/docs/architecture/architecture.md)
