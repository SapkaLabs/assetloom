# Tasks: Web Content Hashing and Usage Descriptors

**Input**: Design documents from `specs/004-web-hashing-descriptors/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/web-content-identity-v1.md`

**Tests**: Automated tests are mandatory for hashing, cache reuse, descriptors, ownership, boundaries, and determinism.

## Phase 1: Setup and Evidence Baseline

**Purpose**: Freeze the current cache-policy surface and focused test baseline before edits.

- [x] T001 Inventory every legacy `stable`/`content-hash` web policy and render-fingerprint dependency in `packages/assetloom/src`, `packages/assetloom/tests`, examples, and documentation
- [x] T002 Run and record the focused pre-change test baseline for `packages/assetloom/tests/catalog-branding.test.ts`, `packages/assetloom/tests/catalog-foundation.test.ts`, `packages/assetloom/tests/render-cache.test.ts`, and `packages/assetloom/tests/usage-descriptors.test.ts`

---

## Phase 2: Foundational Publication Contracts

**Purpose**: Establish shared policy and publication shapes required by every story.

**Critical**: Complete before story implementation.

- [x] T003 [P] Export the normative `WebCacheBustPolicy`, default policy, token bounds, token helper, and public-path query helper from `packages/assetloom-web/src/index.ts`
- [x] T004 Add optional `none`/`filename`/`query` web naming policy types and query-token publication metadata in `packages/assetloom/src/domain/catalog/resources.ts` and `packages/assetloom/src/domain/catalog/planning.ts`
- [x] T005 Update the optional web naming policy schema, safe token bounds, and hashed-policy conditions in `packages/assetloom/schema/config.schema.json`

**Checkpoint**: Public types and schema can express each policy without changing consumer files.

---

## Phase 3: User Story 1 - Choose an Explicit Web Cache Policy (Priority: P1) 🎯 MVP

**Goal**: Produce stable, filename-token, and query-token artifact/public paths from final encoded bytes.

**Independent Test**: Generate identical web bytes under all policies and compare paths, full digests, and exact tokens.

### Tests for User Story 1

- [x] T006 [P] [US1] Add public web helper and token-bound contract coverage in `packages/assetloom/tests/package-architecture.test.ts`
- [x] T007 [P] [US1] Add final-byte stable/filename/query resolver tests, including identical bytes and token equality, in `packages/assetloom/tests/catalog-foundation.test.ts`
- [x] T008 [US1] Add end-to-end omitted/none/filename/query web branding scenarios in `packages/assetloom/tests/catalog-branding.test.ts`

### Implementation for User Story 1

- [x] T009 [US1] Resolve the full final-byte digest before filename/public-path selection and append query tokens in `packages/assetloom/src/storage/catalog-publication-resolver.ts`
- [x] T010 [US1] Centralize policy defaulting, validation, and publication planning for every web branding artifact in `packages/assetloom/src/resources/web-app-branding/handler.ts`
- [x] T011 [US1] Add actionable migration diagnostics for legacy `stable` and `content-hash` policy values in `packages/assetloom/src/config/load.ts` and `packages/assetloom/tests/load.test.ts`
- [x] T012 [US1] Replace legacy policy values in maintained fixtures and examples under `packages/assetloom/tests`, `examples`, and `demo`

**Checkpoint**: All three policies independently return correct full hashes, exact tokens, destinations, and public paths.

---

## Phase 4: User Story 2 - Reuse Renders Across Publication-Only Changes (Priority: P1)

**Goal**: Key image materialization only by byte-affecting inputs and compatibility versions.

**Independent Test**: Change destination, public URL, and unrelated configuration without increasing renderer work; change byte-affecting inputs and observe distinct materialization when bytes differ.

### Tests for User Story 2

- [x] T013 [US2] Add catalog image cache tests for equivalent bytes at different paths, destinations, public URLs, and unrelated configuration in `packages/assetloom/tests/catalog-render-cache.test.ts`
- [x] T014 [US2] Add source, recipe, quality/format, preset, and renderer-compatibility invalidation cases in `packages/assetloom/tests/catalog-render-cache.test.ts`

### Implementation for User Story 2

- [x] T015 [US2] Build a canonical path-free effective recipe identity with deterministic input positions in `packages/assetloom/src/infrastructure/images/image-materializer.ts`
- [x] T016 [US2] Replace whole-configuration cache participation with ordered input-byte hashes, encoding settings, preset revision, fingerprint revision, and `imageRendererCompatibilityVersion` in `packages/assetloom/src/infrastructure/images/image-materializer.ts`
- [x] T017 [US2] Prove unchanged repeated generation performs zero content writes while returning identical complete results in `packages/assetloom/tests/generation-result.test.ts`

**Checkpoint**: Publication-only changes reuse bytes, while byte-changing renderer inputs cannot collide in the materialization alias.

---

## Phase 5: User Story 3 - Integrate Web Outputs as Caller-Owned Data (Priority: P2)

**Goal**: Resolve typed descriptors to the final policy-aware artifact catalog without touching consumer files.

**Independent Test**: Serialize every descriptor, resolve its artifact IDs, compare its paths with returned artifacts, and compare consumer sentinels byte-for-byte.

### Tests for User Story 3

- [x] T018 [P] [US3] Extend typed descriptor serialization and artifact-reference coverage for filename/query paths in `packages/assetloom/tests/usage-descriptors.test.ts`
- [x] T019 [US3] Extend end-to-end web descriptor, complete manifest, HTML, and consumer-config sentinel assertions in `packages/assetloom/tests/catalog-branding.test.ts`

### Implementation for User Story 3

- [x] T020 [US3] Ensure all web HTML-link, head-metadata, static-host, and manifest references use final resolved artifact public paths in `packages/assetloom/src/resources/web-app-branding/handler.ts`

**Checkpoint**: Descriptors are stable caller-owned data for all policies and every referenced artifact exists in the current catalog.

---

## Phase 6: User Story 4 - Replace Obsolete Hash-Named Outputs Safely (Priority: P2)

**Goal**: Rotate filename-hashed outputs through the ownership manifest and preserve unowned lookalikes.

**Independent Test**: Generate, change final bytes, and prove only the prior manifest-owned hash path is removed and reported.

### Tests for User Story 4

- [x] T021 [US4] Add hash-rotation coverage for removed result entries, manifest-owned predecessors, unowned lookalikes, and preflight collisions in `packages/assetloom/tests/catalog-branding.test.ts`

### Implementation for User Story 4

- [x] T022 [US4] Reconcile filename policy fallback and owned-destination planning with manifest-only stale cleanup in `packages/assetloom/src/resources/web-app-branding/handler.ts` and `packages/assetloom/src/storage/catalog-publication-resolver.ts`

**Checkpoint**: Hash rotation removes no file absent from prior AssetLoom ownership.

---

## Phase 7: Polish and Cross-Cutting Verification

**Purpose**: Document the contract, eliminate old vocabulary, and run the complete feature matrix.

- [x] T023 [P] Document `none` compatibility behavior, recommended immutable `filename`, `query`, token bounds, final-byte hashing, and descriptor use in `packages/assetloom-web/README.md`, `packages/assetloom/README.md`, and `docs/architecture/architecture.md`
- [x] T024 Run the Feature 4 focused tests, build, lint, type-check, full tests, architecture checks, packed-package smoke test, and exact legacy-policy/forbidden-mutation searches from `specs/004-web-hashing-descriptors/quickstart.md`

---

## Dependencies and Execution Order

### Phase Dependencies

- Phase 1 has no dependencies.
- Phase 2 depends on Phase 1 and blocks every user story.
- User Story 1 depends on Phase 2 and establishes final publication identity.
- User Story 2 depends only on Phase 2 and can proceed in parallel with User Story 1 until end-to-end result assertions.
- User Story 3 depends on User Story 1 because descriptors require final policy-aware paths.
- User Story 4 depends on User Story 1 because cleanup requires final filename-hash destinations.
- Phase 7 depends on all stories.

### Parallel Opportunities

- T003 can proceed independently while T004–T005 define facade shapes and schema.
- T006 and T007 target independent contract surfaces.
- T013–T016 can proceed alongside T008–T012 after foundational types exist.
- T018 can proceed independently of T019.
- T023 can begin after public contract names stabilize while final tests run.

## Implementation Strategy

### MVP First

1. Complete foundational policy/publication contracts.
2. Finish User Story 1 and demonstrate all three final-byte policies.
3. Finish User Story 2 before relying on the new policies for performance-sensitive generation.
4. Add descriptor and cleanup stories.
5. Complete documentation and full verification.

### Required Evidence per Increment

- Run the directly affected test files after each implementation phase.
- Run build, lint, and type-check after contract changes.
- Do not mark a task complete until its named file/evidence exists and passes.
- Preserve unrelated work and never weaken ownership, recovery, consumer-boundary, or architecture tests.
