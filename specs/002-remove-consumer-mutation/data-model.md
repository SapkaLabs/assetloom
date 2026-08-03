# Data Model: Mutation-Free Plans and Usage

## PlannedUsageDescriptorV1

Fields: `kind`, literal `version: 1`, `targetId`, sorted unique `artifactIds`, and JSON-safe `payload`.
It is declarative plan data and has no destination, callback, command, or write operation.

Lifecycle: planned by a resource/native preset -> aggregated by execution -> validated against current
published artifact IDs -> emitted as `UsageDescriptorV1`.

## WebHtmlLinkUsageV1

Payload: `rel`, optional media `type`, optional `sizes`, `href` resolved from a returned artifact, and
optional cross-origin/purpose data. Artifact IDs identify the complete icon or manifest output.

## WebHeadMetadataUsageV1

Payload: deterministic caller-ready link/meta/title element data. It contains values, not a consumer
HTML path.

## WebStaticHostGuidanceV1

Payload: deterministic route/header guidance for returned immutable artifacts. It contains no static
configuration destination.

## NativeResourceUsageV1

Payload: platform (`android` or `ios`), semantic role, resource/catalog name, portable returned path,
and concise manual integration requirements. It references one or more current artifact IDs.

## CompleteGeneratedManifest

An ordinary text artifact with stable ID/role, configured output-root-relative path, complete
deterministic JSON bytes, media type `application/manifest+json`, ownership manifest entry, and result
hash. It has no receipt or partial-field state.

## Removed mutation entities

Project integration recipe/artifact, prepared project change, adapter/registry/session, project-file
snapshot/gateway, integration receipt/document/store, Git ignore managed block, and native
`update-project` task cease to exist in current runtime contracts.
