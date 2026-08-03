# Data Model: Web Content Hashing and Usage Descriptors

## WebCachePolicy

Configuration attached to a web branding resource.

| Field | Type | Rules |
|---|---|---|
| `strategy` | `none \| filename \| query` | Defaults to `none` when the policy object is absent. |
| `hashLength` | integer, optional | Required by `filename` and `query`; defaulted to 12 by the runtime; inclusive range 8–64. |
| `fallbackFavicon` | normalized relative path, optional | Valid only for `filename`; complete compatibility output owned by AssetLoom. |
| `fallbackManifest` | normalized relative path, optional | Valid only for `filename`; complete compatibility output owned by AssetLoom. |

Legacy `stable` and `content-hash` values are invalid and receive migration guidance to `none` and `filename` respectively.

## ArtifactPublication

Declarative, resource-neutral publisher input.

### Stable publication

- `mode: stable`
- Fixed destination from the planned artifact.
- Optional public directory/base mapping.
- Optional query token length; when present, the public path gains `?v=<final digest prefix>`.

### Content-hash publication

- `mode: content-hash`
- Directory, logical name, extension, and safe hash length.
- Final destination is unresolved until materialized bytes have been hashed.
- Optional complete fallback destination.
- Optional public directory/base mapping.

The internal publication modes are generic implementation vocabulary; the public web configuration maps `none` and `query` to stable destinations and `filename` to content-hash destinations.

## FinalContentIdentity

| Field | Type | Meaning |
|---|---|---|
| `algorithm` | `sha256` | Fixed for result version 1. |
| `value` | 64 lowercase hexadecimal characters | Digest of final materialized/published bytes. |
| `token` | lowercase hexadecimal string | Full digest for `none`; exact configured digest prefix for `filename` and `query`. |

The identity belongs to a `PublishedArtifactV1` and is independent of its output root or destination.

## RenderFingerprintV2

Internal canonical record used to resolve a cache alias.

- Fingerprint revision.
- Renderer/encoder compatibility version.
- Relevant preset/algorithm version.
- Output format and encoding quality.
- Path-free effective image recipe: dimensions, fit, background, composite geometry/blend, and deterministic input positions.
- Ordered SHA-256 hashes of resolved input bytes.

It excludes artifact ID, resource ID, target, entire normalized configuration, destination, public URL, source path, timestamps, and absolute machine paths.

State transition:

1. Resolve and validate source/artifact input bytes.
2. Build and hash the canonical fingerprint record.
3. If alias and content exist, return cached bytes without rendering.
4. Otherwise render, content-address final bytes, and store the alias.

## WebUsageDescriptorV1

Typed version-1 descriptor kinds remain:

- `web.html-link`
- `web.head-metadata`
- `web.static-host-cache`

Every descriptor contains a target ID, deterministically ordered artifact IDs, and a JSON-safe payload. Artifact-output references are resolved after final publication so `href`/`src` values use the selected cache policy.

## Hash-Named Ownership Lifecycle

1. Render final bytes and derive final content identity.
2. Resolve the hash-bearing destination.
3. Preflight all current destinations and ownership collisions.
4. Publish complete files and persist the new ownership catalog.
5. Compare prior ownership with the complete new catalog.
6. Remove and report an obsolete predecessor only when its normalized identity appears in prior AssetLoom ownership.

Unowned destinations never enter the removal transition.
