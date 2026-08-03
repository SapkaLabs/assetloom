# Migrating to publish-and-describe

AssetLoom now has one boundary: it publishes complete files that it owns and
returns a versioned description of the resulting catalog. The consuming
application owns every reference to those files. There is no compatibility
flag, adapter, callback, hook, or plugin that restores application-file
mutation.

The governing decision is [ADR 0006](adr/0006-adopt-publish-and-describe-asset-generation.md),
backed by the repository [constitution](../.specify/memory/constitution.md).

## Node API

Before, callers commonly consumed run-local arrays from `generate` or
`generateV2`:

```js
const { written, unchanged, removed } = await generateV2(loaded, runtime);
```

Those arrays use machine-local paths and do not describe the complete current
catalog. Use `generateVersioned` as the authoritative boundary:

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
  console.log({
    id: artifact.artifactId,
    path: artifact.relativePath,
    disposition: artifact.disposition,
    sha256: artifact.contentHash.value,
  });
}
```

`resultVersion` is `1`. `artifacts` is the complete current catalog, including
`unchanged` outputs. `removed` contains stale manifest-owned outputs removed
during this run. `usage` contains deterministic caller guidance, and every
descriptor references IDs present in `artifacts`. Result paths use `/`
separators and are relative to a named output root; absolute machine paths are
not portable artifact identities.

Safe legacy Node entry points remain available for callers that need their old
run-local projections. They do not define the current CLI or portable result
contract and cannot mutate consumer files.

## CLI

Before, generation JSON used a success envelope and run-local fields:

```json
{
  "ok": true,
  "result": {
    "written": ["..."],
    "unchanged": [],
    "removed": []
  }
}
```

Now generation emits `GenerationResultV1` directly:

```sh
assetloom --json generate -c assetloom.json
assetloom --json generate -c assetloom.json --result-file ci/result.json
```

```json
{
  "artifacts": [
    {
      "artifactId": "branding:web:favicon-32",
      "contentHash": {
        "algorithm": "sha256",
        "token": "2d711642b726",
        "value": "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881"
      },
      "disposition": "unchanged",
      "outputRootId": "website:public",
      "relativePath": "assets/favicon.2d711642b726.png",
      "resourceId": "branding",
      "role": "favicon-32",
      "sizeBytes": 428,
      "targetId": "website"
    }
  ],
  "diagnostics": [],
  "removed": [],
  "resultVersion": 1,
  "targets": ["website"],
  "usage": []
}
```

The exact digest in a real result is always 64 lowercase hexadecimal
characters. `--result-file` is relative to `.assetloom/results`, is guarded
against traversal and link escapes, and contains byte-for-byte the same stable
JSON as stdout. Plan, report, verify, and clean keep their existing JSON
envelopes. See the [CLI reference](cli.md).

## Web: the caller updates HTML

Remove `output.document`. AssetLoom does not locate or parse an HTML file.
Instead, consume `web.html-link` and `web.head-metadata` values in application
build code:

```js
const linkTags = result.usage
  .filter((item) => item.kind === 'web.html-link')
  .map(({ payload }) => {
    const attributes = Object.entries(payload)
      .map(([name, value]) => `${name}="${String(value)}"`)
      .join(' ');
    return `<link ${attributes}>`;
  });

// The consuming application owns its template and decides where these belong.
const html = renderApplicationHtml({ assetLinks: linkTags });
```

If static-host cache guidance is requested, translate the returned
`web.static-host-cache` payload into the host configuration in consumer-owned
deployment code. AssetLoom never merges that configuration.

Web naming values changed as follows:

| Former value | Current value | Behavior |
| --- | --- | --- |
| `stable` | `none` | Keep the configured filename and public path. This is the compatibility default. |
| `content-hash` | `filename` | Put a final-byte hash token in the filename. Recommended for immutable caching. |
| n/a | `query` | Keep the filename and return `?v=<token>` in the public path. |

All policies return the full SHA-256 of final encoded bytes. Filename and query
tokens default to 12 hexadecimal characters and may be configured from 8
through 64.

## Android setup

Remove `targets.android.manifestPath`. Generate the complete resources, then
use each `native.resource` descriptor in caller-owned Android code. Depending
on the returned roles, the application maintainer references resource names
from `AndroidManifest.xml`, its theme XML, or notification setup. AssetLoom
does not open those files. For example, a caller may choose to add this itself:

```xml
<meta-data
  android:name="com.google.firebase.messaging.default_notification_icon"
  android:resource="@drawable/assetloom_notification" />
```

The descriptor's `manualSetup` entries remain the authoritative per-resource
instructions.

## iOS setup

Remove `targets.ios.projectFile`. AssetLoom may publish complete asset catalogs,
their owned `Contents.json`, and an owned storyboard, but it does not register
them. The application maintainer adds the returned catalog or storyboard to
the Xcode target, chooses the app-icon set and launch-screen name in its build
settings, and updates any plist keys itself.

## React Native setup

AssetLoom can publish assets under a declared React Native application or
library output root. The package/application author consumes the returned
relative paths or resource names in JavaScript and completes the Android/iOS
steps above. Generation should run as an explicit pre-build command; AssetLoom
does not add Gradle tasks, Xcode phases, imports, dependencies, or package
scripts.

## Removed capabilities and configuration

- Native project-update operations and Android manifest/Xcode/plist writers.
- HTML-head insertion, web-manifest merge, and static-host configuration
  writers.
- Project-file gateways, integration adapters, mutation receipts, and
  repository-ignore management.
- `targets.android.manifestPath`, `targets.ios.projectFile`, web
  `output.document`, and web `staticWebApp` configuration.

Obsolete configuration fails with `LOOM_CFG_MIGRATION` and an actionable JSON
pointer. A former `.assetloom/integration-receipts.json` file is inert and is
never loaded. The application owner may archive or delete it after confirming
that no older AssetLoom release is in use.

AssetLoom still owns `.assetloom/manifest.json`, its content cache, locks, and
recoverable pending-publication state. Those files govern AssetLoom outputs;
they are not consumer-application mutation receipts.
