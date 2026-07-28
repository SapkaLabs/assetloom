# Error codes and diagnostics

Every stable public error uses a `LOOM_` code. Dependency and operating-system
exceptions are retained as `cause` and never replace the public code.

## Families

- Configuration: `LOOM_CFG_PARSE`, `LOOM_CFG_MERGE`,
  `LOOM_CFG_VALIDATE`, `LOOM_CFG_PROVENANCE`, `LOOM_CFG_PATH_INVALID`.
- Sources: `LOOM_SRC_NOT_FOUND`, `LOOM_SRC_INVALID`,
  `LOOM_SRC_UNSUPPORTED`, `LOOM_SRC_SECURITY_VIOLATION`.
- Planning: `LOOM_PLAN_INVALID`, `LOOM_PLAN_COLLISION`,
  `LOOM_PLAN_TARGET_UNSUPPORTED`.
- Rendering: `LOOM_RENDER_FAILED`, `LOOM_RENDER_TIMEOUT`,
  `LOOM_RENDER_DIMENSION_INVALID`, `LOOM_RENDER_FORMAT_UNSUPPORTED`.
- Cache: `LOOM_CACHE_CORRUPT`, `LOOM_CACHE_READ_FAILED`,
  `LOOM_CACHE_WRITE_FAILED`.
- Locking: `LOOM_LOCK_ACQUIRE_FAILED`, `LOOM_LOCK_ALREADY_HELD`.
- Writes: `LOOM_WRITE_FAILED`, `LOOM_WRITE_CONFLICT`,
  `LOOM_WRITE_OUTSIDE_ROOT`, `LOOM_ATOMIC_PUBLISH_FAILED`.
- Manifest: `LOOM_MANIFEST_INVALID`, `LOOM_MANIFEST_READ_FAILED`,
  `LOOM_MANIFEST_WRITE_FAILED`.
- Git ignore: `LOOM_GITIGNORE_FAILED`,
  `LOOM_GITIGNORE_INVALID_BLOCK`,
  `LOOM_GITIGNORE_VERIFICATION_FAILED`.
- Verification: `LOOM_VERIFY_FAILED`, `LOOM_VERIFY_IMAGE_INVALID`,
  `LOOM_VERIFY_ANDROID_FAILED`, `LOOM_VERIFY_IOS_FAILED`.
- Android: `LOOM_ANDROID_RESOURCE_INVALID`,
  `LOOM_ANDROID_MANIFEST_UPDATE_FAILED`,
  `LOOM_ANDROID_BUILD_VERIFICATION_FAILED`.
- iOS: `LOOM_IOS_ASSET_CATALOG_INVALID`,
  `LOOM_IOS_PROJECT_UPDATE_FAILED`,
  `LOOM_IOS_BUILD_VERIFICATION_FAILED`.
- Cleanup: `LOOM_CLEAN_UNOWNED_FILE`, `LOOM_CLEAN_FAILED`.
- Process: `LOOM_CLI_USAGE`, `LOOM_INTERNAL`.

Human output places contextual fields below the stable summary:

```text
[LOOM_CFG_VALIDATE] Invalid Assetloom configuration.

File: config/brands/acme.assetloom.json
Path: /resources/appIcon/android/adaptive/background
Reason: Specify either "color" or "source", but not both.
```

`--json` emits `ok: false` and the error name, code, message, and context.
Stacks are omitted unless `--verbose` is also supplied. Unexpected errors are
wrapped with `LOOM_INTERNAL`.
