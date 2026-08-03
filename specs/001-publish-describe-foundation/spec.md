# Feature Specification: Publish-and-Describe Foundation

**Feature Branch**: `mvp`

**Created**: 2026-08-02

**Status**: Draft

**Input**: Establish bounded whole-file publication and a deterministic, versioned result that
describes every current AssetLoom artifact without modifying consumer application files.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consume a complete generation result (Priority: P1)

As a Node API caller, I receive one portable result describing every current artifact, removed owned
artifact, usage instruction, diagnostic, and selected target so I can integrate assets in my own
application code without AssetLoom inspecting that code.

**Why this priority**: The public result is the replacement boundary on which every later migration
depends.

**Independent Test**: Generate one configured complete file twice and serialize both results; the
first result reports a created artifact, the second reports the same artifact as unchanged, and both
provide the same portable identity, final-byte digest, usage references, and deterministic ordering.

**Acceptance Scenarios**:

1. **Given** a valid plan with a new artifact, **When** a caller generates it, **Then** the result is
   version 1 and catalogs the artifact as created with its identity, normalized path, size, and full
   final-byte hash.
2. **Given** a previously successful identical run, **When** the caller generates again, **Then** the
   result catalogs every current artifact as unchanged and performs zero content writes.
3. **Given** a manifest-owned artifact that is no longer planned, **When** generation succeeds,
   **Then** the result reports that artifact in the removed catalog and excludes it from current
   artifacts.
4. **Given** typed usage descriptors, **When** the result is validated, **Then** every referenced
   artifact ID exists in the same result and the entire result round-trips through JSON without loss.

---

### User Story 2 - Publish only complete owned files (Priority: P1)

As an application owner, I can run AssetLoom knowing it publishes only complete files inside declared
output roots and never overwrites or removes files it does not own.

**Why this priority**: Safe ownership and bounded writes are prerequisites for exposing any publisher.

**Independent Test**: Run a plan beside sentinel consumer files and attempt unowned collisions,
traversal, link escapes, duplicate destinations, and stale cleanup; successful outputs stay within
the declared roots while every forbidden case fails before publication and sentinels remain identical.

**Acceptance Scenarios**:

1. **Given** valid relative destinations beneath an explicit output root, **When** publication runs,
   **Then** it creates or replaces only complete manifest-owned files.
2. **Given** an existing unowned destination with different bytes, **When** a plan is prepared,
   **Then** generation fails before any planned content is published.
3. **Given** an absolute path, traversal, link/junction escape, duplicate destination, or
   case-normalized collision, **When** planning is validated, **Then** the run fails with a stable
   `LOOM_` error before publication.
4. **Given** stale owned and unrelated unowned files, **When** cleanup is planned, **Then** only the
   manifest-owned stale files are eligible for removal.

---

### User Story 3 - Recover deterministic publication (Priority: P2)

As an automation operator, I can distinguish complete success from interrupted publication and rerun
the same intent to recover without accepting changed inputs or a partial result as successful.

**Why this priority**: Multi-file publication must remain trustworthy across unexpected I/O failures.

**Independent Test**: Inject a failure after publication begins, observe durable pending state and a
failed result, retry the identical intent to convergence, and verify changed input or target scope is
rejected while recovery is pending.

**Acceptance Scenarios**:

1. **Given** an unexpected I/O failure after publication starts, **When** the operation ends, **Then**
   it reports failure and leaves explicit recoverable state.
2. **Given** pending recoverable state, **When** the identical intent is retried, **Then** generation
   safely converges and clears the pending state only after complete success.
3. **Given** pending recoverable state, **When** inputs, configuration, package compatibility, or
   target scope changes, **Then** generation fails closed with a stable diagnostic.

### Edge Cases

- A planned destination differs from another only by case on a case-insensitive filesystem.
- A destination parent becomes a symlink or junction after planning but before publication.
- An owned output is modified externally between ownership preflight and publication.
- A stale manifest entry points outside every declared output root or through a link.
- Two usage descriptors reference the same artifact, or a descriptor references a removed artifact.
- A deterministic result contains optional media or dimensions for only the artifacts where they are
  meaningful.
- A failure occurs after some bytes are published but before the ownership manifest or recovery state
  is finalized.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Node generation operation MUST return `GenerationResultV1` with
  `resultVersion: 1`, selected target IDs, current artifacts, removed artifacts, usage descriptors,
  and diagnostics.
- **FR-002**: The current artifact catalog MUST include created, updated, and unchanged outputs, not
  only files changed during the current run.
- **FR-003**: Each published artifact MUST expose a stable artifact, resource, target, and semantic
  role identity; output-root ID; normalized relative path; disposition; byte size; optional public
  path/media/dimensions; and final-byte content hash.
- **FR-004**: Each content hash MUST contain the full lowercase SHA-256 digest and the exact
  deterministic shortened token selected for cache-busting use.
- **FR-005**: Portable result identity MUST NOT depend on absolute machine paths, timestamps, random
  identifiers, or iteration-order accidents.
- **FR-006**: Current artifacts, removed artifacts, usage descriptors, diagnostics, and target IDs
  MUST use documented deterministic ordering.
- **FR-007**: Result values MUST be JSON-safe and round-trip through serialization without losing
  identity, path, hash, descriptor, or diagnostic meaning.
- **FR-008**: Usage descriptors MUST use a versioned kind/envelope and MUST reference only artifact
  IDs present in the result's current artifact catalog.
- **FR-009**: Extension packages MUST be able to expose strongly typed descriptor payloads while the
  resource-neutral contract validates their JSON-safe envelope.
- **FR-010**: Resource handlers and target planners MUST produce declarative complete-file artifact
  plans and MUST perform no direct filesystem writes.
- **FR-011**: Only the bounded publisher MAY write runtime artifacts, and every artifact write MUST
  remain beneath its explicitly identified output root.
- **FR-012**: Output-root-relative paths MUST reject absolute paths, parent traversal, symlink or
  junction escapes, duplicate destinations, and case-normalized collisions.
- **FR-013**: Planning, path validation, ownership checks, and predictable collision checks MUST
  complete before publication starts.
- **FR-014**: Existing unowned destination files MUST cause a pre-publication ownership collision and
  MUST never be overwritten, including when their bytes happen to equal planned bytes.
- **FR-015**: Existing manifest-owned destinations MUST be classified as updated or unchanged by
  comparing their complete planned bytes, and unchanged artifacts MUST incur zero content writes.
- **FR-016**: Stale cleanup MUST remove only files recorded as owned for the affected output/target
  scope and MUST report every successful removal.
- **FR-017**: AssetLoom state writes MUST remain beneath its dedicated state root and MUST reject
  traversal or filesystem-link escapes.
- **FR-018**: Unexpected publication failure MUST leave a durable intent sufficient to detect and
  resume the identical operation and MUST never return a successful complete result.
- **FR-019**: Recovery MUST reject a retry whose byte-affecting inputs, configuration, compatibility
  versions, planned outputs, or target scope differ from the pending intent.
- **FR-020**: Public failures MUST use stable `LOOM_` error codes and preserve dependency errors as
  causes where supported.
- **FR-021**: The foundation contract MUST NOT expose patch, merge, append, manifest/plist update,
  project-registration, consumer-file callback, or arbitrary file-gateway operations.
- **FR-022**: A candidate destination MAY be read only for whole-file ownership, collision, and byte
  comparison; no consumer configuration semantics may be inferred from it.
- **FR-023**: Complete metadata files intrinsic to an AssetLoom-owned generated bundle MAY be planned
  as ordinary owned artifacts.

### Key Entities

- **Generation Result V1**: The versioned portable description of one complete successful run.
- **Published Artifact V1**: One current complete owned file and its portable identity, disposition,
  metadata, size, and final-byte hash.
- **Removed Artifact V1**: One previously owned output safely removed during the run.
- **Usage Descriptor V1**: Versioned JSON-safe caller guidance referencing current artifact IDs.
- **Diagnostic V1**: Stable machine-readable information or failure context with a `LOOM_` code when
  it represents a public failure.
- **Output Root**: An explicitly configured, identified filesystem boundary under which relative
  artifact paths resolve.
- **Artifact Plan**: A deterministic declarative recipe for one complete output, without write
  capability.
- **Ownership Manifest**: Durable state identifying AssetLoom-owned outputs and their last published
  hashes.
- **Publication Intent**: Recoverable state binding a run's planned outputs, ownership actions, and
  compatibility-relevant inputs until successful completion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In automated runs containing created, updated, unchanged, and removed outputs, 100% of
  expected current and removed artifacts appear exactly once in deterministic result order.
- **SC-002**: Repeating generation with identical inputs produces byte-identical deterministic JSON
  after normalizing presentation whitespace and performs zero artifact content writes.
- **SC-003**: All tested absolute, traversal, symlink/junction, duplicate, case-collision, and unowned
  collision attempts fail before any planned artifact content is published.
- **SC-004**: Sentinel consumer files and repository metadata remain byte-for-byte unchanged across
  every foundation integration test.
- **SC-005**: Every published artifact's reported full digest equals an independently calculated
  SHA-256 of its final bytes, and every reported token is the documented prefix of that digest.
- **SC-006**: Every injected interruption after publication begins is reported as failure, leaves
  detectable recovery state, and converges on an identical retry without claiming partial success.
- **SC-007**: 100% of public failure paths exercised by the feature expose stable `LOOM_` codes and
  retain underlying causes where the runtime supports causes.
- **SC-008**: Architecture checks find zero consumer-file mutation operations in the foundation's
  public planning and publication contracts.

## Assumptions

- Existing configuration composition, cache, manifest, locking, and recovery behavior will be
  incrementally adapted rather than rewritten from scratch.
- Output roots are explicitly identified by configuration or target planning before artifact paths
  are resolved.
- This foundation does not add resource types, web cache-busting policies, CLI presentation changes,
  or workspace package extraction; dependent roadmap features provide those behaviors.
- Expo remains outside scope.
