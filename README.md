# Assetloom

Assetloom generates deterministic native application resources for Android and
iOS from SVG, PNG, or WebP artwork. It supports native projects and bare React
Native applications; Expo is outside its scope.

Generated output includes launcher and app icons, Android notification
resources, splash screens, Apple asset catalogs, and Xcode resource integration.
Generation is explicit, safe to repeat, and writes nothing when content is
unchanged.

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
      "resourceDirectory": "./android/app/src/main/res",
      "manifestPath": "./android/app/src/main/AndroidManifest.xml"
    },
    "ios": {
      "enabled": true,
      "projectDirectory": "./ios/YourApp",
      "projectFile": "./ios/YourApp.xcodeproj/project.pbxproj",
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
    "assets:generate": "assetloom generate -c assetloom.json",
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

## White-label applications

Assetloom is well suited to white-label application frameworks where one React
Native codebase produces many branded native apps. Keep native paths and common
defaults in a base configuration, then merge a brand file last:

```sh
assetloom generate \
  -c config/base.assetloom.json \
  -c config/brands/acme.assetloom.json
```

A brand file only needs to override its own artwork or colors:

```json
{
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

Keep generated resource paths and `.assetloom/` locally Git-ignored. Assetloom
tracks ownership in its manifest, avoids unchanged writes, and never cleans
files it does not own.

Rendered assets remain cached across brand switches. Reuse is based on the
merged configuration's effective source bytes and render settings, not the
configuration filenames or resource names; `assetloom clean` leaves this cache
intact.

See the [package guide](packages/assetloom/README.md) and
[configuration reference](docs/configuration.md) for splash screens,
notification icons, Icon Composer packages, and all CLI options.

## Run this repository's demo

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

- `packages/assetloom` — the ESM package and CLI.
- `apps/demo-react-native` — a bare React Native example.
- `fixtures` — native verification projects.
- `docs` — configuration, architecture, and release status.

## Development

```sh
corepack enable
yarn install --immutable
yarn build
yarn lint
yarn typecheck
yarn test
```
