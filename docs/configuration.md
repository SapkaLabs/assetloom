# Configuration reference

Assetloom reads one or more JSON files supplied with repeated `-c` options.
Files merge in the supplied order:

- objects merge recursively;
- later scalar values replace earlier values;
- arrays replace rather than concatenate;
- `null` deletes an inherited property;
- every surviving JSON pointer retains its last-writer provenance.

`project.root` is resolved from the CLI working directory. Source paths must
remain inside that project root. Each target declares an explicit output root;
generated files must remain beneath that root. Paths reject absolute output
values, traversal, duplicate/case-normalized destinations, and link escapes.

## Configuration metadata

Give every final customer configuration a human-readable identity:

```json
{
  "metadata": {
    "name": "Acme Banking",
    "description": "Production artwork for the Acme mobile applications."
  }
}
```

`metadata` is optional for backward compatibility. When it is present, `name`
is required. Assetloom uses the merged name in HTML report headings and to
derive the default report filename. A brand override should therefore set its
own metadata after the shared base configuration.

## Schema version 1 native targets

Only Android and iOS are valid target keys:

```json
{
  "schemaVersion": 1,
  "project": {
    "root": "."
  },
  "targets": {
    "android": {
      "enabled": true,
      "resourceDirectory": "./android/app/src/main/res"
    },
    "ios": {
      "enabled": true,
      "projectDirectory": "./ios/Demo",
      "assetCatalogDirectory": "./ios/Demo/Images.xcassets"
    }
  },
  "resources": {
    "appIcon": {
      "type": "app-icon",
      "android": {
        "legacy": {
          "source": "./assets/icon.svg"
        }
      }
    }
  }
}
```

At least one target must be enabled for planning or generation. Use
`--target android` or `--target ios` to select one enabled target without
removing the other target's owned outputs.

Target paths declare only Assetloom-owned output roots. Application manifests,
Xcode projects, plist files, and build configuration remain caller-owned.

## Schema version 2 targets and resources

Schema version 2 provides named target roots. Supported target kinds are
`directory`, `react-native-library`, `react-native-app`, and `web-app`, plus
the compatible native target declarations. Resource types are `files`,
`svg-components`, `image-variants`, `native-image-assets`,
`web-app-branding`, and `font-family`.

```json
{
  "schemaVersion": 2,
  "project": { "root": "." },
  "targets": {
    "shared": {
      "kind": "directory",
      "root": "./generated/shared"
    },
    "mobile": {
      "kind": "react-native-app",
      "root": "./apps/mobile",
      "androidFontDirectory": "android/app/src/main/assets/fonts",
      "iosFontDirectory": "ios/Assets/Fonts"
    },
    "website": {
      "kind": "web-app",
      "root": "./apps/website",
      "sourceDirectory": "src",
      "publicDirectory": "public",
      "publicBasePath": "/assets"
    }
  },
  "resources": {
    "legal": {
      "type": "files",
      "source": { "file": "./assets/legal.txt" },
      "outputs": [
        { "target": "shared", "directory": "documents" }
      ]
    },
    "logo": {
      "type": "image-variants",
      "source": { "file": "./assets/logo.svg" },
      "outputs": [
        {
          "target": "website",
          "path": "public/images/logo.webp",
          "width": 512,
          "height": 512,
          "format": "webp",
          "fit": "contain",
          "quality": 90
        }
      ]
    }
  }
}
```

`directory` and React Native targets resolve resource paths from their `root`.
A `web-app` target additionally defines source/public directories and the
portable URL base returned by web usage descriptors. These fields describe
publication layout; they do not authorize changes to application source,
package metadata, native projects, or build configuration.

File sources accept a single `file`, a glob under `root`, or a package source
where supported. Resource outputs name a target and a target-relative complete
file/directory layout. Handlers plan artifacts declaratively and perform no
filesystem writes themselves.

### Web branding and cache busting

`web-app-branding` uses the `web-app-branding-v1` preset and may request
favicons, application icons, maskable icons, an owned complete web manifest,
social imagery, and usage descriptors. Its optional naming policy is:

```json
{
  "naming": {
    "strategy": "filename",
    "hashLength": 12
  }
}
```

- `none` keeps the configured filename/public path and is the compatibility
  default.
- `filename` publishes `name.<token>.ext` and is recommended for immutable
  browser caching.
- `query` publishes the configured filename and returns
  `name.ext?v=<token>` as its public path.

Tokens are deterministic prefixes of the full SHA-256 of final encoded output
bytes. Their length defaults to 12 and must be from 8 through 64. The complete
digest is always returned. Legacy `stable` and `content-hash` values fail with
`LOOM_CFG_MIGRATION`; replace them with `none` and `filename` respectively.

`staticHost.includeCacheGuidance` asks for typed route/header guidance. The
caller applies that data to its own hosting configuration. `output.document`
and `staticWebApp` were removed because AssetLoom never edits consumer HTML or
host configuration.

## Schema version 1 app icon

Android accepts legacy artwork, optional distinct round artwork, and adaptive
foreground/background/monochrome layers. The adaptive background is either a
color or a source image.

iOS accepts either Light/Dark/Tinted variant artwork or an opaque Icon Composer
directory:

```json
{
  "resources": {
    "appIcon": {
      "type": "app-icon",
      "android": {
        "legacy": { "source": "./assets/icon.svg" },
        "adaptive": {
          "foreground": { "source": "./assets/foreground.svg" },
          "background": { "color": "#172033" },
          "monochrome": { "source": "./assets/monochrome.svg" }
        }
      },
      "ios": {
        "mode": "variants",
        "light": { "source": "./assets/icon-light.svg" },
        "dark": { "source": "./assets/icon-dark.svg" },
        "tinted": { "source": "./assets/icon-tinted.svg" }
      }
    }
  }
}
```

`mode: "icon-composer"` requires `source` to be a `.icon` directory and
optionally accepts the output `name`. Contents are copied without
interpretation.

## Schema version 1 notification icon

The Android notification resource accepts one source and an optional color:

```json
{
  "type": "notification-icon",
  "android": {
    "source": "./assets/notification.svg",
    "color": "#172033"
  }
}
```

The generated small-icon bitmaps are normalized to a white alpha-bearing image.
Application notification code selects `assetloom_notification` and
`assetloom_notification_color`.

## Schema version 1 splash screen

Light is required and Dark is optional. `imageWidth` is the logical width in
Android dp and iOS points:

```json
{
  "type": "splash-screen",
  "light": {
    "image": "./assets/splash.svg",
    "backgroundColor": "#FFFFFF",
    "imageWidth": 200
  },
  "dark": {
    "image": "./assets/splash-dark.svg",
    "backgroundColor": "#000000",
    "imageWidth": 200
  }
}
```

## Ownership and state

An output destination may be newly created, replace an existing
manifest-owned file, remain unchanged, or be rejected as an unowned collision.
Planning, validation, and predictable collision checks complete before
publication. Cleanup removes only files recorded by
`.assetloom/manifest.json`, and only when their current bytes still match the
owned hash.

AssetLoom writes runtime state only under `.assetloom/`. A pending publication
journal makes interruptions explicit and recoverable; a partial run is never
reported as complete success. AssetLoom does not modify `.git/info/exclude` or
any other repository metadata. Projects decide their own ignore policy.

The bundled schema is exported at `@sapkalabs/assetloom/schema`. See the
[migration guide](migration-publish-and-describe.md) for removed configuration
and caller-owned setup examples.
