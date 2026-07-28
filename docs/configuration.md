# Configuration reference

Assetloom reads one or more JSON files supplied with repeated `-c` options.
Files merge in the supplied order:

- objects merge recursively;
- later scalar values replace earlier values;
- arrays replace rather than concatenate;
- `null` deletes an inherited property;
- every surviving JSON pointer retains its last-writer provenance.

Paths are resolved from `project.root`, which is resolved from the CLI working
directory. Source paths and output paths must remain inside that root.

## Targets

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
      "resourceDirectory": "./android/app/src/main/res",
      "manifestPath": "./android/app/src/main/AndroidManifest.xml"
    },
    "ios": {
      "enabled": true,
      "projectDirectory": "./ios/Demo",
      "projectFile": "./ios/Demo.xcodeproj/project.pbxproj",
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

## App icon

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

## Notification icon

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

## Splash screen

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

The bundled schema is available at `@sapkalabs/assetloom/schema`.
