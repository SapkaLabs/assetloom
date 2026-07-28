# Android application-resource research

Status: authoritative inputs for preset version 1.

## Launcher and adaptive icons

Android adaptive icons use independent foreground and background layers. Each
layer is designed on a 108 × 108 dp canvas; the inner 66 × 66 dp is the safe
masked viewport and the outer 18 dp on every edge is available for masks and
motion. A monochrome layer enables themed icons on supporting launchers.

Assetloom therefore renders adaptive layers at 108 dp in every primary density
bucket, emits `mipmap-anydpi-v26` adaptive-icon XML, and includes the
`monochrome` element when configured. A conventional 48 dp launcher bitmap is
also emitted for pre-adaptive launchers. Separate round artwork is optional;
the legacy artwork is the deterministic fallback.

Sources:

- [Adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)
- [Create app icons](https://developer.android.com/studio/write/create-app-icons)
- [AdaptiveIconDrawable API](https://developer.android.com/reference/android/graphics/drawable/AdaptiveIconDrawable)

## Density resources

The primary density scale factors used by the version 1 presets are mdpi 1×,
hdpi 1.5×, xhdpi 2×, xxhdpi 3×, and xxxhdpi 4×. Android chooses the closest
density-specific resource and scales it when an exact density is absent.
Assetloom generates each primary bucket to avoid runtime upscaling.

Source: [Support different pixel densities](https://developer.android.com/training/multiscreen/screendensities).

## Notification small icons and color

The small icon is required by Android notification templates. Assetloom emits
a 24 dp alpha-bearing, white small-icon bitmap in every primary density bucket.
It also emits a named color resource. The application chooses those resources
when constructing a platform or AndroidX notification; no messaging-library
contract is assumed.

Sources:

- [About notifications](https://developer.android.com/develop/ui/compose/notifications)
- [Create a notification](https://developer.android.com/develop/ui/views/notifications/build-notification)

## Splash screens

Android 12 introduced the platform splash-screen API. Its theme attributes
include `windowSplashScreenBackground` and
`windowSplashScreenAnimatedIcon`. Assetloom writes a base window-background
drawable and an API-31 theme override, with day/night colors and images selected
through Android resource qualifiers.

The generated theme inherits the project's conventional `AppTheme`; application
theme integration is an idempotent manifest update.

Sources:

- [Splash screens](https://developer.android.com/develop/ui/views/launch/splash-screen)
- [Migrate a splash screen to Android 12](https://developer.android.com/develop/ui/views/launch/splash-screen/migrate)

## Formats, names, and compilation

Android resource files are placed in type-and-qualifier directories. Assetloom
uses lowercase ASCII resource names containing only digits and underscores
after the first letter. PNG is the default for preset version 1 because it
supports alpha on every supported API level and is straightforward to validate
deterministically. Lossless or transparent WebP requires API 18 or newer and
remains available as a task format for future presets.

Duplicate resources at the same merge priority fail resource merging, so the
planner detects destination collisions before rendering.

Sources:

- [Add app resources](https://developer.android.com/studio/write/add-resources)
- [App resources overview](https://developer.android.com/guide/topics/resources/providing-resources)
- [Create WebP images](https://developer.android.com/studio/write/convert-webp)
- [AAPT2](https://developer.android.com/tools/aapt2)

## Verification

Structural verification decodes every generated image and checks the plan,
manifest hash, dimensions, format, XML declaration, and resource name. Native
verification invokes the project's Gradle wrapper with
`:app:processDebugResources`, exercising resource merging and AAPT2.
