# Feature Specification: Remove Consumer-Project Mutation

**Feature Branch**: `mvp`

**Created**: 2026-08-02

**Status**: Draft

**Input**: Remove every runtime capability that interprets or changes consumer application files or
repository metadata, replacing useful outcomes with complete owned artifacts and typed usage data.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate without touching the consumer application (Priority: P1)

As an application owner, I can run every AssetLoom generation, cleanup, verification, and reporting
workflow while consumer HTML, source, native manifests/projects, build files, configuration, package
metadata, and repository metadata remain byte-for-byte unchanged.

**Why this priority**: This is the non-negotiable product boundary and removes unsafe shared ownership.

**Independent Test**: Place unique sentinels in every formerly mutated file class, run all public
runtime operations with native and web resources, and verify only complete manifest-owned outputs and
dedicated AssetLoom state changed.

**Acceptance Scenarios**:

1. **Given** Android and iOS resources plus existing application manifests/projects, **When** assets
   are planned, generated, verified, reported, or cleaned, **Then** the application files are neither
   parsed for integration nor modified.
2. **Given** web branding plus existing HTML, web manifest, and static-host configuration, **When**
   assets are generated, **Then** those existing files remain unchanged and the result describes
   caller-owned integration actions.
3. **Given** generated outputs in a Git repository, **When** any runtime operation completes, **Then**
   `.git/info/exclude`, `.gitignore`, and other repository metadata remain unchanged.
4. **Given** a plugin/adapter/callback registration attempt for consumer-file mutation, **When** the
   public package is inspected or consumed, **Then** no callable mutation contract or export exists.

---

### User Story 2 - Consume web usage descriptors (Priority: P1)

As a web application caller, I receive complete generated branding resources plus typed, versioned
descriptors for icons, web-manifest links, SEO metadata, and optional static-host cache guidance, so my
application can update its own HTML and configuration.

**Why this priority**: Web integrations currently depend on the forbidden adapter system and need a
useful descriptive replacement.

**Independent Test**: Generate web branding beside sentinel HTML/manifest/static configuration,
validate every descriptor resolves to returned artifact IDs, and use descriptor payloads in a caller
fixture without AssetLoom reading or modifying the fixture's consumer files.

**Acceptance Scenarios**:

1. **Given** web icon outputs, **When** generation succeeds, **Then** link descriptors provide rel,
   type, sizes, and returned artifact public paths.
2. **Given** requested web-manifest metadata, **When** the configured destination is absent or already
   AssetLoom-owned, **Then** AssetLoom publishes a complete manifest file and returns a descriptor that
   references it.
3. **Given** an existing unowned web-manifest destination, **When** generation preflights, **Then** it
   fails as an ownership collision rather than merging fields.
4. **Given** requested SEO or static-host metadata, **When** generation succeeds, **Then** deterministic
   descriptors contain caller-ready data and no consumer destination to mutate.

---

### User Story 3 - Consume native usage descriptors (Priority: P1)

As a native or React Native caller, I receive complete Android/iOS resource layouts and typed manual
integration descriptors without AssetLoom registering resources in an Android manifest or Xcode
project.

**Why this priority**: Native project mutation is part of the original behavior and must have explicit
migration semantics.

**Independent Test**: Generate native icons/splash resources beside sentinel Android/Xcode project
files and validate descriptors provide platform roles, asset/resource names, paths, and documented
caller actions while sentinels remain unchanged.

**Acceptance Scenarios**:

1. **Given** Android launcher, notification, or splash resources, **When** generation succeeds, **Then**
   native descriptors identify generated resource names/roles and required caller-owned manifest or
   theme setup.
2. **Given** iOS icons, catalogs, or splash resources, **When** generation succeeds, **Then** native
   descriptors identify catalog/resource names and required caller-owned Xcode/plist setup.
3. **Given** a native configuration containing former consumer project-file options, **When** it is
   loaded, **Then** validation reports a stable migration-oriented `LOOM_` error rather than using the
   paths.

---

### User Story 4 - Migrate without hidden compatibility mutation (Priority: P2)

As an existing caller, I receive clear failures and migration guidance for removed integration
options and exports while non-mutating generation behavior remains supported.

**Why this priority**: The break is deliberate, but must not silently ignore configuration or preserve
an unsafe escape hatch.

**Independent Test**: Compile/import a clean consumer fixture against the public exports, load legacy
mutation configurations, and compare before/after examples; removed APIs are unavailable, invalid
options fail stably, and valid output-only workflows still pass.

**Acceptance Scenarios**:

1. **Given** an import of a removed adapter, receipt, gateway, native integration serializer, or
   Git-ignore manager, **When** a clean consumer type-checks, **Then** the import fails because no public
   entry point exists.
2. **Given** a valid non-mutating native or catalog workflow, **When** it runs after migration, **Then**
   its complete generated bytes remain supported except where destination ownership requires a safe
   collision failure.
3. **Given** obsolete integration receipt state from an older installation, **When** the migrated
   runtime operates, **Then** it does not use the receipt to edit a consumer file and documents safe
   manual retirement.

### Edge Cases

- A former web-manifest path points to an existing unowned file with identical desired bytes.
- A native project file is absent, malformed, read-only, linked, or outside the project root.
- Old integration receipt state exists while the referenced consumer file has changed.
- A target produces only usage descriptors after all direct integration tasks are removed.
- A filtered generation removes a formerly owned complete manifest while preserving another target.
- A report describes required integration without embedding or semantically inspecting consumer files.
- A caller tries to register a generic write callback under a new name.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Runtime operations MUST NOT parse, semantically inspect, patch, merge, append, or
  partially rewrite consumer application files.
- **FR-002**: Runtime operations MUST NOT modify HTML, JSX/TSX, consumer CSS, package metadata, web
  application manifests, plist/Xcode files, Android manifests, Gradle/build files, application
  configuration, or equivalent consumer-owned files.
- **FR-003**: Runtime operations MUST NOT modify `.git/info/exclude`, `.gitignore`, or repository
  metadata.
- **FR-004**: Public contracts and exports MUST NOT contain project-integration artifacts, adapters,
  registries, receipts, sessions, generic project-file gateways, arbitrary write callbacks, or
  equivalent escape hatches.
- **FR-005**: Native plans MUST contain only complete owned resource outputs and MUST NOT contain an
  `update-project` or resource-registration operation.
- **FR-006**: Web plans MUST contain only complete owned outputs and descriptors and MUST NOT contain
  HTML-head, web-manifest merge, or static-host configuration integration operations.
- **FR-007**: A requested generated web manifest MUST be a complete AssetLoom-owned file subject to
  ordinary unowned collision and stale ownership rules.
- **FR-008**: Web usage descriptors MUST be versioned, deterministic, JSON-safe, strongly typed, and
  reference only artifact IDs in the complete result.
- **FR-009**: Web descriptors MUST cover applicable icon links, manifest link, SEO/head metadata, and
  static-host cache guidance without naming a consumer file to modify.
- **FR-010**: Native usage descriptors MUST be versioned, deterministic, JSON-safe, strongly typed,
  and reference only returned native artifacts.
- **FR-011**: Native descriptors MUST identify applicable platform roles, resource/catalog names,
  portable paths, and explicit caller-owned setup requirements.
- **FR-012**: Former native project-file and web integration configuration properties MUST be removed
  from accepted schemas and types and MUST fail with stable migration-oriented diagnostics.
- **FR-013**: Obsolete integration receipt state MUST NOT be loaded, interpreted, or used by runtime
  operations to change consumer files.
- **FR-014**: Planning, generation, cleanup, verification, and reporting APIs MUST operate without a
  mutation adapter or project-file gateway dependency.
- **FR-015**: Verification and reporting MUST inspect only declared sources, complete owned outputs,
  ownership/recovery state, and caller-safe descriptor data.
- **FR-016**: Existing non-mutating generation outputs and public workflows MUST remain supported
  where they do not conflict with whole-file ownership.
- **FR-017**: Removed behavior MUST NOT remain callable under deprecation, compatibility, plugin, hook,
  callback, or renamed generic interfaces.
- **FR-018**: Every failure introduced by removal or invalid migration configuration MUST use a stable
  `LOOM_` code and preserve underlying causes when applicable.
- **FR-019**: No new resource type may be added as part of this feature, and Expo remains out of scope.
- **FR-020**: Documentation and migration artifacts MUST distinguish complete generated bundle
  metadata from forbidden consumer application configuration.

### Key Entities

- **Owned Complete Artifact**: A whole file exclusively created/replaced/retained by AssetLoom under
  an output root.
- **Web Usage Descriptor V1**: Typed caller data for HTML links/meta, manifest reference, SEO, or
  static-host guidance.
- **Native Usage Descriptor V1**: Typed caller data for platform resource identity and manual setup.
- **Removed Mutation Contract**: Any former plan operation, runtime port, adapter, receipt, gateway,
  registration, schema field, or export capable of consumer-file modification.
- **Migration Diagnostic**: A stable `LOOM_` failure explaining an obsolete integration option and its
  caller-owned replacement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sentinel files for every listed consumer-file class and repository metadata remain
  byte-for-byte unchanged across 100% of public runtime operation tests.
- **SC-002**: A final source, schema, public-export, and packed-package search finds zero callable
  consumer-mutation capabilities, excluding historical ADR/migration documentation and test sentinel
  names.
- **SC-003**: 100% of generated web/native usage descriptors validate against versioned strong types,
  round-trip through JSON, and reference current artifact IDs.
- **SC-004**: Existing unowned web-manifest/native output collisions fail before publication in every
  tested equal/different-byte case.
- **SC-005**: All native plans tested contain zero `update-project` operations and all web plans contain
  zero integration operations.
- **SC-006**: Planning, generation, cleanup, verification, and reporting compile and run without any
  project mutation dependency.
- **SC-007**: All valid non-mutating regression workflows pass the full build, lint, type-check, test,
  and packed-package smoke matrix.

## Assumptions

- Feature 1's versioned result, bounded publication, ownership manifest, and recovery journal are the
  replacement foundation.
- Complete resource-bundle metadata intrinsic to generated resources remains allowed.
- Detailed migration examples and final CLI/facade presentation are completed in roadmap feature 5;
  this feature records the breaking surface and removes the runtime capability.
- Historical ADRs may describe superseded behavior when clearly marked by ADR 0006; runtime and
  current user documentation may not present it as available.
