# `@sapkalabs/assetloom`

Assetloom generates deterministic, configurable application resources for
Android, iOS, React Native libraries and applications, web applications, and
ordinary output directories. Schema version 2 supports files, SVG components,
image variants, web branding, and fonts without hard-coded application names.

Existing schema-version-1 Android and iOS configurations remain supported by
the same CLI commands and continue through the original native planning,
rendering, verification, manifest, and reporting paths. Expo is not supported.

## Install

```sh
yarn add --dev @sapkalabs/assetloom
```

Create an `assetloom.json` in the application root. It declares project targets
and the resources to generate; see the
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

With schema version 1, filter generation or verification with `--target
android` or `--target ios`. Schema version 2 accepts any configured target ID,
for example `--target dashboard` or `--target mobileComponents`.
Use `--json` for machine-readable output and `--verbose` to include diagnostic
stacks for failures.

Generation JSON is the direct `GenerationResultV1` value rather than an
`ok`/`result` envelope. `--result-file <path>` writes the byte-identical stable
document beneath `.assetloom/results`; paths are guarded against absolute,
traversing, and link-escaped destinations. Human generation reports changed,
unchanged, and removed artifact counts. Logs and report notices go to stderr
when JSON mode reserves stdout.

## Publish-and-describe Node API

The portable generation boundary is `generateVersioned`. It publishes only complete
Assetloom-owned files under configured target roots and returns `GenerationResultV1`:

```js
import {
  createDefaultCatalogRuntime,
  generateVersioned,
  loadVersionedConfiguration,
} from '@sapkalabs/assetloom';

const loaded = await loadVersionedConfiguration(['assetloom.json']);
const result = await generateVersioned(
  loaded,
  createDefaultCatalogRuntime(loaded),
);

for (const artifact of result.artifacts) {
  console.log(
    artifact.artifactId,
    artifact.disposition,
    artifact.outputRootId,
    artifact.relativePath,
    artifact.contentHash.value,
  );
}
```

`artifacts` is the complete current catalog, including unchanged outputs. `removed`
contains stale manifest-owned files removed in this run. Portable paths are root-relative
with `/` separators; absolute machine paths are not public identities. Every artifact
reports the full SHA-256 of its final bytes and the exact deterministic token available to
cache-busting policies. Versioned JSON-safe `usage` descriptors are caller guidance only;
Assetloom does not use them to edit consumer application files.

The safe legacy `generate` and `generateV2` projections remain available for
compatible callers. They are non-authoritative run-local views and cannot be
used to reintroduce consumer-file mutation.

## Focused package graph

```text
@sapkalabs/assetloom-core
          ↑
@sapkalabs/assetloom-images
       ↗       ↖
@sapkalabs/assetloom-native   @sapkalabs/assetloom-web
       ↖       ↗
    @sapkalabs/assetloom
```

Core owns resource-neutral contracts, orchestration, bounded publication,
state, hashing, ownership, and versioned results. Images contains Sharp-backed
generic image behavior. Native and web contain their focused planners,
presets, validators, and strongly typed descriptor payloads. This facade owns
default composition and every Commander command. All public roots are declared
through package exports; private `src` imports and cycles are forbidden.

## Configurable resources (schema version 2)

This minimal example copies shared files to both a React Native package and a
dashboard, converts an SVG preview into a web image, and expands onboarding
artwork into Android density resources and iOS image sets.

```json
{
  "schemaVersion": 2,
  "project": { "root": "." },
  "targets": {
    "mobileComponents": {
      "kind": "react-native-library",
      "root": "./mobile/components"
    },
    "mobileApp": {
      "kind": "react-native-app",
      "root": "./mobile/app"
    },
    "dashboard": {
      "kind": "web-app",
      "root": "./web/dashboard",
      "sourceDirectory": "src",
      "publicDirectory": "public",
      "publicBasePath": "/"
    }
  },
  "resources": {
    "sharedImages": {
      "type": "files",
      "source": {
        "root": "./assets/images",
        "include": ["**/*.{png,jpg,webp}"]
      },
      "outputs": [
        { "target": "mobileComponents", "directory": "src/assets" },
        { "target": "dashboard", "directory": "src/assets" }
      ]
    },
    "socialPreview": {
      "type": "image-variants",
      "source": { "file": "./assets/social-preview.svg" },
      "outputs": [
        {
          "target": "dashboard",
          "path": "public/social-preview.webp",
          "width": 1200,
          "height": 630,
          "format": "webp",
          "fit": "cover",
          "quality": 90
        }
      ]
    },
    "onboardingImages": {
      "type": "native-image-assets",
      "source": {
        "root": "./assets/onboarding",
        "include": ["**/*.{png,jpg,jpeg}"]
      },
      "output": {
        "target": "mobileApp",
        "android": {
          "resourceDirectory": "android/app/src/main/res",
          "densities": [
            { "density": "mdpi", "width": 480 },
            { "density": "hdpi", "width": 720 },
            { "density": "xhdpi", "width": 960 },
            { "density": "xxhdpi", "width": 1440 },
            { "density": "xxxhdpi", "width": 1920 }
          ]
        },
        "ios": {
          "assetCatalogDirectory": "ios/App/Images.xcassets",
          "scales": [
            { "scale": "1x", "width": 480 },
            { "scale": "2x", "width": 960 },
            { "scale": "3x", "width": 1440 }
          ]
        }
      },
      "format": "jpeg",
      "quality": 85,
      "onNameCollision": "prefer-output-format"
    }
  }
}
```

SVG components use the generic `themed-icon-v1` preset. Component names use
only the source filename unless an explicit parent-directory policy is needed:

```json
{
  "target": "mobileComponents",
  "directory": "src/icons",
  "runtime": "react-native",
  "preset": "themed-icon-v1",
  "naming": "pascal-case",
  "componentNaming": {
    "parentDirectoryPrefix": "F_",
    "separator": "_"
  }
}
```

Web branding uses `web-app-branding-v1`; the built-in social overlay is
selected with `overlayPreset: "product-overview-v1"`. Its optional `naming`
policy is `none`, `filename`, or `query`; omission defaults to `none`.
`filename` is recommended for immutable caching and produces
`logo.<token>.png`, while `query` preserves `logo.png` and returns
`logo.png?v=<token>`. Hashed policies default to 12 hexadecimal characters and
accept 8 through 64. The full SHA-256 of final encoded bytes is always returned.
Legacy `stable` and `content-hash` values migrate to `none` and `filename`.

`generate --report` writes a deterministic, self-contained HTML review to
`.assetloom/reports/<configuration-name>.html`. It embeds configured source
artwork, actual generated images, native bundle files, and manifest
integrity diagnostics. Repeated density outputs are summarized in the visual
sections, while a complete file tree provides click-to-preview access to every
generated file. Run `report` by itself to inspect the resources already on
disk, or use `--report-output reports/acme.html` to select a destination.
See the [reporting guide](https://github.com/SapkaLabs/assetloom/blob/main/docs/reporting.md)
for multi-customer workflows.

Generation owns only paths recorded in `.assetloom/manifest.json`. Existing
unowned destination files are rejected before publication. Unchanged
content is not rewritten, and cleanup refuses to remove an owned path whose
content was changed outside Assetloom. Configure `.assetloom/` and generated
resources in the consuming repository's ignore policy when appropriate;
AssetLoom never modifies repository metadata.

If generation is interrupted after publication starts, Assetloom retains
`.assetloom/pending-generation.json`. Rerun `generate` with the same effective
configuration and target selection to converge the remaining phases. Assetloom
rejects changed inputs and blocks `clean`, `verify`, and `report` while that
intent is pending so a partial publication cannot be mistaken for a complete
one.

Assetloom automatically recovers a stale same-host project lock only when the
recorded PID is provably absent. A crash during that recovery can leave
`.assetloom/lock.recovery`, which deliberately blocks further automatic
recovery. Inspect it and clear it through the guarded, token-validated API:

First stop every Assetloom process operating on the project. Exactly one
recovery operator must perform the complete inspect-and-clear sequence; do not
run this manual procedure concurrently from multiple terminals or automation
workers.

```js
import {
  clearAbandonedProjectLockRecoveryClaim,
  inspectProjectLockRecoveryClaim,
} from '@sapkalabs/assetloom';

const inspection = await inspectProjectLockRecoveryClaim(process.cwd());
if (inspection.status === 'held' && inspection.clearable) {
  await clearAbandonedProjectLockRecoveryClaim(
    process.cwd(),
    inspection.claim.recoveryId,
  );
}
```

Only a valid same-host claim whose PID is definitely dead is clearable. Live or
PID-reused processes, remote hosts, permission-denied probes, and malformed
claims remain fail-closed. Do not delete the claim by hand; investigate the
reported process identity and filesystem state instead.

The content-addressed render cache survives configuration switches and
`assetloom clean`. Cache reuse depends only on source bytes, the path-free
effective recipe and encoding settings, and renderer/preset compatibility
versions—not configuration filenames, unrelated configuration, destinations,
public URLs, resource names, or absolute source paths.

The JSON Schema is exported as `@sapkalabs/assetloom/schema`.

Documentation:

- [CLI](https://github.com/SapkaLabs/assetloom/blob/main/docs/cli.md)
- [Configuration](https://github.com/SapkaLabs/assetloom/blob/main/docs/configuration.md)
- [HTML reports](https://github.com/SapkaLabs/assetloom/blob/main/docs/reporting.md)
- [Error codes](https://github.com/SapkaLabs/assetloom/blob/main/docs/error-codes.md)
- [Architecture](https://github.com/SapkaLabs/assetloom/blob/main/docs/architecture/architecture.md)
- [Publish-and-describe migration](https://github.com/SapkaLabs/assetloom/blob/main/docs/migration-publish-and-describe.md)
