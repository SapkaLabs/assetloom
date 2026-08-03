# Data Model: Publish-and-Describe Foundation

## GenerationResultV1

Fields: `resultVersion` (literal 1), sorted unique `targets`, sorted `artifacts`, sorted `removed`,
sorted `usage`, and sorted `diagnostics`.

Validation: contains no `undefined`, bigint, functions, timestamps, random values, or portable
absolute paths. Every usage artifact ID resolves to one current artifact. A result exists only after
complete successful publication and state finalization.

## PublishedArtifactV1

Identity fields: `artifactId`, `resourceId`, `targetId`, `role`.

Location fields: `outputRootId`, normalized `/`-separated `relativePath`, optional `publicPath`.

Publication fields: `disposition` (`created`, `updated`, `unchanged`), optional `mediaType`, `width`,
and `height`, plus non-negative integer `sizeBytes` and `contentHash`.

Uniqueness: `artifactId` and `(outputRootId, case-normalized relativePath)` are unique within a
result. Artifact order is target, resource, role, relative path, artifact ID by code-point comparison.

## ContentHashV1

Fields: `algorithm` (literal `sha256`), 64-character lowercase hexadecimal `value`, and lowercase
hexadecimal `token`. The token is a deterministic prefix of `value` and reflects the exact token used
by a cache-busting policy; when no shorter policy token applies it may equal the full digest.

## RemovedArtifactV1

Fields: prior `artifactId`, `targetId`, `outputRootId`, normalized `relativePath`, prior full content
hash, and removal disposition `removed`. It is emitted only after a manifest-owned file is safely
removed. Ordering matches published locations.

## UsageDescriptorV1

Fields: stable `kind`, positive integer `version`, `targetId`, sorted unique `artifactIds`, and a
recursive JSON-safe `payload`. Payload schemas are owned by extension packages. Descriptor order is
target, kind, version, serialized stable identity.

## DiagnosticV1

Fields: stable `code`, `severity` (`info`, `warning`, `error`), `message`, and optional JSON-safe
context. Successful results may contain informational/warning diagnostics; a failed generation does
not return a successful result wrapper.

## OutputRoot

Fields: stable `outputRootId`, owning target ID, and internal canonical absolute path. The absolute
path is never serialized as portable identity. Root IDs are unique and roots must remain beneath the
configured project boundary; artifact paths remain beneath their selected root without following
links.

## PreparedOwnedArtifact

Fields: public identity/role metadata, output-root ID, normalized relative path, final bytes, byte
size, full SHA-256, token, and optional usage/media metadata. State transitions:

```text
planned -> materialized -> boundary/ownership preflighted -> intent persisted
        -> created|updated|unchanged -> manifest committed -> result published
```

Any failure after intent persistence transitions to `recovery-required`; only an identical prepared
intent can resume it.

## OwnershipManifestEntry

Fields: manifest version, output-root ID, normalized relative path, target ID, artifact ID, and last
published SHA-256. Legacy entries without a root ID are migrated only when their path can be proven to
belong to exactly one declared output root; ambiguous or escaping entries fail closed.
