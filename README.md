# Assetloom

Assetloom is a deterministic asset compiler and whole-file publisher for
Android, iOS, React Native, web, and ordinary directory outputs. Native image
generation accepts SVG, PNG, and WebP artwork; Expo is outside its scope.

Generated output includes launcher and app icons, Android notification
resources, splash screens, and Apple asset catalogs. It returns usage descriptors
for caller-owned Android, iOS, and web setup; it never edits application files.
Generation is explicit, safe to repeat, and writes nothing when content is
unchanged.

The authoritative Node boundary is `generateVersioned`; the authoritative
machine CLI boundary is the same direct `GenerationResultV1` value:

```sh
assetloom --json generate -c assetloom.json \
  --result-file ci/assets.json
```

The result contains every current artifact, including unchanged outputs,
stale owned outputs removed during the run, typed usage descriptors, stable
diagnostics, and the full SHA-256 of each final published file. Result files
are guarded beneath `.assetloom/results`.

## Use in a React Native application

Install Assetloom as a development dependency:

```sh
yarn add --dev @sapkalabs/assetloom
```

Create `assetloom.json` in the application root. This typical configuration
enables both native projects and generates modern app icons:

```json
{
  "$schema": "./node_modules/@sapkalabs/assetloom/schema/config.schema.json",
  "schemaVersion": 1,
  "project": { "root": "." },
  "targets": {
    "android": {
      "enabled": true,
      "resourceDirectory": "./android/app/src/main/res"
    },
    "ios": {
      "enabled": true,
      "projectDirectory": "./ios/YourApp",
      "assetCatalogDirectory": "./ios/YourApp/Images.xcassets"
    }
  },
  "resources": {
    "appIcon": {
      "type": "app-icon",
      "android": {
        "legacy": { "source": "./assets/icon.svg" },
        "adaptive": {
          "foreground": { "source": "./assets/icon-foreground.svg" },
          "background": { "color": "#172033" },
          "monochrome": { "source": "./assets/icon-monochrome.svg" }
        }
      },
      "ios": {
        "mode": "variants",
        "light": { "source": "./assets/icon.svg" },
        "dark": { "source": "./assets/icon-dark.svg" },
        "tinted": { "source": "./assets/icon-tinted.svg" }
      }
    }
  }
}
```

Add generation to the normal React Native commands:

```json
{
  "scripts": {
    "assets:plan": "assetloom plan -c assetloom.json",
    "assets:generate": "assetloom generate -c assetloom.json --report",
    "assets:report": "assetloom report -c assetloom.json",
    "assets:verify": "assetloom verify -c assetloom.json",
    "android": "yarn assets:generate && react-native run-android",
    "ios": "yarn assets:generate && react-native run-ios"
  }
}
```

Start Metro, then launch either platform from another terminal:

```sh
yarn start
yarn android
# or: yarn ios
```

Install CocoaPods through the application's normal `Gemfile` and `Podfile`
before the first iOS build. Do not hide generation in Gradle or Xcode build
phases.

After generation, the caller must reference Android resources from its own
manifest/theme and add iOS catalogs or storyboards to its own Xcode project.
Assetloom publishes complete resource files only.

## White-label applications

Assetloom is well suited to white-label application frameworks where one React
Native codebase produces many branded native apps. Keep native paths and common
defaults in a base configuration, then merge a brand file last:

```sh
assetloom generate \
  -c config/base.assetloom.json \
  -c config/brands/acme.assetloom.json \
  --report
```

A brand file only needs to override its own artwork or colors:

```json
{
  "metadata": {
    "name": "Acme",
    "description": "Production artwork for the Acme applications."
  },
  "resources": {
    "appIcon": {
      "android": {
        "legacy": { "source": "./assets/brands/acme/icon.svg" }
      },
      "ios": {
        "light": { "source": "./assets/brands/acme/icon.svg" }
      }
    }
  }
}
```

Configuration files merge in command-line order. Objects merge recursively,
arrays replace earlier arrays, and `null` removes an inherited value. A build
service can produce the final brand file at runtime and pass it last.

`--report` creates a professional, self-contained dashboard at
`.assetloom/reports/acme.html`. It embeds both configured source artwork and
the native files that were actually generated, including integrity status,
dimensions, densities, appearances, and platform-context previews. Give each
brand a distinct `metadata.name` and generate every configuration to retain an
independent visual snapshot. See the [HTML reporting guide](docs/reporting.md).

Configure the consuming repository to ignore generated resource paths and
`.assetloom/` when appropriate. Assetloom never edits repository ignore files.
It tracks ownership in its manifest, avoids unchanged writes, and never cleans
files it does not own.

Rendered assets remain cached across brand switches. Reuse is based on source
bytes, path-free effective recipes, encoding settings, and compatible renderer
versions—not unrelated configuration, destinations, public URLs, source paths,
configuration filenames, or resource names; `assetloom clean` leaves this
cache intact. Web browser cache busting separately uses final encoded-byte
SHA-256 with `none`, `filename`, or `query` policy.

See the [package guide](packages/assetloom/README.md) and
[configuration reference](docs/configuration.md) for splash screens,
notification icons, Icon Composer packages, and all CLI options.
Breaking changes from the former application-mutation surface are covered in
the [publish-and-describe migration guide](docs/migration-publish-and-describe.md).

## Run this repository's demo

Publish the demo assets, persist the result catalog, and validate the
caller-owned native registrations:

```sh
yarn demo:assets
yarn demo:assets:verify
```

Start Metro in one terminal:

```sh
yarn demo:start
```

Launch either native application in another terminal:

```sh
yarn demo:android
yarn demo:ios
```

On a fresh macOS checkout, run `bundle install` and
`bundle exec pod install --project-directory=ios` from
`apps/demo-react-native` before the first iOS launch.

## Workspace

- `packages/assetloom-core` — resource-neutral contracts, orchestration, state,
  ownership, publication, diagnostics, and result types.
- `packages/assetloom-images` — Sharp-backed generic image inspection and
  transformation contracts; depends only on core.
- `packages/assetloom-native` — native presets, validators, semantic roles,
  layouts, and typed usage descriptors; depends on core and images.
- `packages/assetloom-web` — web presets, public paths, final-byte cache
  policies, and typed usage descriptors; depends on core and images.
- `packages/assetloom` — compatibility facade, default composition, Commander
  CLI, human/JSON output, schema, and executable; depends on all four focused
  packages.
- `apps/demo-react-native` — a bare React Native example.
- `fixtures` — native verification projects.
- `docs` — configuration, architecture, and release status.

The graph is acyclic. Packages use public exported roots only; CLI commands
exist only in the facade.

## Development

```sh
corepack enable
yarn install --immutable
yarn build
yarn lint
yarn typecheck
yarn test
```
