# `@sapkalabs/assetloom-native`

Android/iOS semantic roles, image presets, resource-name validation, complete
native asset layouts, and typed `native.resource` usage descriptors. It
depends on `@sapkalabs/assetloom-core` and
`@sapkalabs/assetloom-images`.

```js
import {
  assertNativeResourceName,
  createNativeResourceUsageV1,
} from '@sapkalabs/assetloom-native';
```

Descriptor payloads contain platform, role, resource name, portable relative
path, and deterministic manual-setup instructions. They are data for the
caller. The package never edits Android manifests, Gradle files, plist files,
Xcode projects, package metadata, build scripts, or application source.

Complete metadata intrinsically owned by a generated resource bundle—such as
an AssetLoom-created asset-catalog `Contents.json`—is allowed. Registering that
bundle with an application remains caller-owned. CLI commands and default
composition remain in `@sapkalabs/assetloom`.
