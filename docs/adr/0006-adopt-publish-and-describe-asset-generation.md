# ADR 0006: Adopt publish-and-describe asset generation

Status: accepted.

Date: 2026-08-02.

## Context

AssetLoom began as a deterministic native-resource generator, but its execution model blurred two
different responsibilities: producing asset files and integrating those files into a consuming
application. Native targets updated Android manifests and Xcode projects; later catalog work added
HTML-head, web-manifest, and static-web-app configuration adapters, integration receipts, a generic
project-file gateway, and automatic `.git/info/exclude` synchronization.

Editing consumer applications reduces reuse because AssetLoom must understand each application
format, framework convention, and ownership model. Partial-file ownership is unsafe: AssetLoom and
the caller can both believe they control the same file, stale cleanup becomes semantic rather than
bounded, and a compatibility adapter can bypass otherwise strong publication boundaries. An asset
compiler can state what a caller needs without taking ownership of the caller's application.

## Decision

AssetLoom adopts a publish-and-describe model. It reads declared inputs, plans deterministic complete
files, renders or copies them, publishes them beneath explicit output roots, records ownership and
recoverable state, and returns a versioned structured result describing the complete current artifact
catalog. The caller consumes typed usage descriptors and performs any HTML, source, native-project,
or build-configuration changes itself.

Allowed writes are limited to:

- complete generated files beneath configured output roots;
- replacements for, or unchanged comparisons of, files already recorded as AssetLoom-owned;
- complete metadata intrinsic to a generated resource bundle, such as an owned asset-catalog
  `Contents.json`; and
- AssetLoom's dedicated cache, ownership manifest, lock, journal, and recovery state.

Forbidden writes include partial or semantic changes to HTML, JSX/TSX, CSS, `package.json`, web
manifests owned by the application, `Info.plist`, `.pbxproj`, `AndroidManifest.xml`, Gradle/build
files, application configuration, `.git/info/exclude`, and repository metadata. No optional adapter,
plugin, callback, compatibility facade, hook, or generic gateway may restore those operations.

## Result contract

The Node API returns `GenerationResultV1`, whose deterministic portion includes:

- `resultVersion: 1`;
- selected target IDs;
- every current published artifact, including created, updated, and unchanged dispositions;
- removed manifest-owned artifacts;
- typed, versioned, JSON-safe usage descriptors whose artifact IDs resolve within the result; and
- stable diagnostics.

Each artifact has a portable identity (`artifactId`, resource, target, and semantic role), an output
root ID plus normalized relative path, optional public path and media/image metadata, size, and the
full SHA-256 of final published bytes with the exact shortened cache-busting token. Absolute
machine-specific paths are not portable identities. CLI `--json` emits the same contract, and a
result-file option writes that schema without reinterpretation. Contract changes require a new result
version.

## Package boundaries

The workspace is split into focused lockstep-versioned packages:

- `@sapkalabs/assetloom-core` owns resource-neutral contracts, configuration composition,
  orchestration, hashing/cache primitives, ownership, bounded publication, recovery, diagnostics,
  and result versions.
- `@sapkalabs/assetloom-images` owns generic image inspection/transformation, Sharp, encoders,
  recipes, and image verification; it may depend only on core.
- `@sapkalabs/assetloom-native` owns Android/iOS/React Native presets, validation, complete native
  layouts, semantic roles, and usage descriptors; it may depend on core and images.
- `@sapkalabs/assetloom-web` owns web presets, favicon/social/PWA variants, public paths, content-hash
  policies, and web usage descriptors; it may depend on core and images.
- `@sapkalabs/assetloom` owns Commander commands, default composition, the executable, human/JSON
  presentation, and only those facade compatibilities that respect this decision.

Core cannot depend on Sharp, Commander, native, web, or image implementations. No dependency cycle,
cross-package private `src` import, or undeclared public entry point is allowed. Architecture tests
enforce these rules.

## Hashing and browser caching

Render caching and browser cache busting are separate. A render fingerprint includes only inputs
that can alter rendered bytes: source bytes, effective recipe and encoding options, and compatible
renderer/algorithm versions. Destinations, public URLs, unrelated configuration, timestamps, and
machine paths are excluded so moving an output can reuse materialized content.

Browser cache busting uses the SHA-256 of final encoded output bytes. Destination hashes are invalid
because paths do not identify content, and source-only hashes are insufficient because transforms
and encoders also affect output bytes. Web supports `none` (default for compatibility), `filename`
(recommended for immutable caching), and `query`. Filename publication renders, hashes, resolves the
final path, preflights ownership/collisions, publishes, updates the manifest, then removes an obsolete
hash-named predecessor only if it was manifest-owned.

## Removed integration model

Project integration artifacts, adapters, registries, receipts, sessions, and project-file gateways
are removed from runtime contracts. Native `update-project` operations and platform project
serializers are removed. Web HTML, manifest-merge, and static-web-app mutations are replaced with
complete AssetLoom-owned resource files where appropriate and typed usage descriptors otherwise.
Automatic Git ignore management is removed. Ownership manifests and recovery journals remain because
they govern AssetLoom-owned outputs rather than partial consumer files.

## Compatibility and migration

Supported generation behavior and public APIs remain where they do not violate the boundary.
Mutation behavior is deliberately breaking and is not retained as deprecated-callable functionality.
Configuration properties that name consumer integration files are rejected or migrated to explicit
owned output roots and descriptor options. The migration guide shows callers how to update their own
HTML, native manifests/projects, and build configuration using returned descriptor data. Expo remains
out of scope, and this refactor adds no new resource types.

The CLI keeps human output and gains stable JSON/result-file output based on `GenerationResultV1`.
The Node API returns the same versioned result. Tests replace mutation expectations with sentinel
preservation, bounded ownership, descriptor resolution, hashing, recovery, and package-boundary
evidence. Documentation treats caller-owned integration as an explicit application step.

## Rejected alternative

Retaining consumer-project mutation as an opt-in plugin was rejected. Optionality does not repair
the ownership ambiguity: a plugin would still interpret and partially own caller files, could escape
the bounded publisher, would require evolving framework-specific parsers, and would make the safety
contract depend on runtime composition. The official extension surface therefore contains no
project-file mutation primitive.

## Consequences

Callers gain a deterministic artifact catalog and can integrate it using their own framework and
release conventions. AssetLoom becomes easier to reuse and audit, while consumers must perform an
explicit migration for formerly automatic project changes. Package extraction increases release and
smoke-test surface, so lockstep versions, package-export tests, clean-consumer installs, dependency
graph enforcement, and migration documentation are required.
