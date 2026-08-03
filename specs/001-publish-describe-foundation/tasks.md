---

description: "Dependency-ordered implementation tasks for the publish-and-describe foundation"
---

# Tasks: Publish-and-Describe Foundation

**Input**: Design documents from `specs/001-publish-describe-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required by the specification and constitution; contract/boundary tests precede code.

**Organization**: Tasks are grouped by independently testable user story.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish reusable fixtures and record the green baseline without changing behavior.

- [X] T001 Record baseline commands and results in specs/001-publish-describe-foundation/quickstart.md
- [X] T002 [P] Add deterministic temporary-project and write-spy helpers in packages/assetloom/tests/helpers/publication-fixture.ts
- [X] T003 [P] Add a public-contract type fixture in packages/assetloom/tests/fixtures/generation-result-v1.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define portable contracts and output-root/path primitives used by every user story.

- [X] T004 Add failing serialization, ordering, and usage-reference contract tests in packages/assetloom/tests/generation-result.test.ts
- [X] T005 Add `GenerationResultV1`, artifact, removal, usage, diagnostic, and JSON-value types plus validators in packages/assetloom/src/domain/generation-result.ts
- [X] T006 Add failing output-root, traversal, absolute-path, duplicate, and case-collision tests in packages/assetloom/tests/write-boundaries.test.ts
- [X] T007 Implement declared output-root registration and normalized relative-path resolution in packages/assetloom/src/application/planning/output-root-registry.ts
- [X] T008 Extend complete-file artifact plan metadata for role/root/relative-path semantics in packages/assetloom/src/domain/catalog/planning.ts
- [X] T009 Export foundation contracts and output-root helpers through packages/assetloom/src/index.ts

**Checkpoint**: Portable domain and bounded path primitives compile; contract tests pass independently.

---

## Phase 3: User Story 1 - Consume a complete generation result (Priority: P1) 🎯 MVP

**Goal**: Return a deterministic V1 catalog containing created, updated, unchanged, removed, usage,
and diagnostic records.

**Independent Test**: Generate a fixture twice and serialize results; both runs contain the complete
catalog, with created then unchanged dispositions, stable ordering, hashes, and valid usage refs.

### Tests for User Story 1

- [X] T010 [US1] Extend packages/assetloom/tests/generation-result.test.ts with created/updated/unchanged/removed and JSON round-trip scenarios
- [X] T011 [US1] Add final-byte SHA-256 and token assertions in packages/assetloom/tests/generation-result.test.ts

### Implementation for User Story 1

- [X] T012 [US1] Extend publication material records with identity, role, root, relative path, media metadata, size, and final digest in packages/assetloom/src/storage/owned-output-lifecycle.ts
- [X] T013 [US1] Return authoritative created/updated/unchanged and removed-owned records from packages/assetloom/src/storage/owned-output-lifecycle.ts
- [X] T014 [US1] Implement deterministic complete-catalog assembly and usage validation in packages/assetloom/src/application/execution/generation-result-builder.ts
- [X] T015 [US1] Carry resolved catalog artifact metadata into owned publication records in packages/assetloom/src/application/execution/catalog-executor.ts
- [X] T016 [US1] Add an authoritative versioned generation entry point while isolating legacy result mapping in packages/assetloom/src/api/generate-v2.ts
- [X] T017 [US1] Export the versioned generation entry point and types in packages/assetloom/src/index.ts

**Checkpoint**: User Story 1 returns a portable complete catalog without requiring CLI changes.

---

## Phase 4: User Story 2 - Publish only complete owned files (Priority: P1)

**Goal**: Enforce explicit roots and reject every predictable boundary/ownership conflict before the
first artifact content write.

**Independent Test**: Run sentinel, collision, traversal, link/junction, duplicate, case-collision,
and stale-cleanup fixtures; only complete owned files under declared roots may change.

### Tests for User Story 2

- [X] T018 [US2] Add sentinel consumer-file and repository-metadata preservation scenarios in packages/assetloom/tests/write-boundaries.test.ts
- [X] T019 [US2] Add unowned-equal-bytes, stale-owned-only, and post-preflight race scenarios in packages/assetloom/tests/write-boundaries.test.ts
- [X] T020 [US2] Add link/junction escape scenarios for output and state roots in packages/assetloom/tests/write-boundaries.test.ts

### Implementation for User Story 2

- [X] T021 [US2] Reject all unowned destinations including equal-byte files during preflight in packages/assetloom/src/storage/owned-output-lifecycle.ts
- [X] T022 [US2] Enforce declared root containment and link-safe destination checks for every prepared output/stale path in packages/assetloom/src/storage/owned-output-lifecycle.ts
- [X] T023 [US2] Validate full prepared publication collisions before beginning durable intent in packages/assetloom/src/api/generate-v2.ts
- [X] T024 [US2] Persist output-root identity with owned manifest entries and fail closed on unsafe legacy entries in packages/assetloom/src/storage/manifest.ts

**Checkpoint**: User Story 2 proves no consumer sentinel or unowned destination can be changed.

---

## Phase 5: User Story 3 - Recover deterministic publication (Priority: P2)

**Goal**: Bind pending recovery to the complete prepared owned publication and never return partial
success.

**Independent Test**: Inject failures after intent creation and across publication/finalization;
identical retries converge while changed inputs/scope fail closed.

### Tests for User Story 3

- [X] T025 [US3] Update recovery fixtures to use complete owned artifacts and assert no partial V1 result in packages/assetloom/tests/generation-recovery.test.ts
- [X] T026 [US3] Add changed-root/path/hash/descriptor intent rejection scenarios in packages/assetloom/tests/generation-recovery.test.ts

### Implementation for User Story 3

- [X] T027 [US3] Include output-root identities, portable paths, final hashes, and usage identities in packages/assetloom/src/application/execution/generation-intent-fingerprint.ts
- [X] T028 [US3] Version and validate the enriched pending intent in packages/assetloom/src/storage/pending-generation-store.ts
- [X] T029 [US3] Clear pending state only after manifest finalization and result validation in packages/assetloom/src/api/generate-v2.ts

**Checkpoint**: Every post-begin failure remains explicitly recoverable and cannot yield a successful result.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T030 Add architecture checks that foundation contracts cannot import integration adapters, project gateways, Sharp, or Commander in packages/assetloom/tests/architecture-foundation.test.ts
- [X] T031 Update public foundation contract documentation in packages/assetloom/README.md
- [X] T032 Run focused quickstart, full build/lint/typecheck/test, and package smoke commands from specs/001-publish-describe-foundation/quickstart.md

---

## Dependencies & Execution Order

- Phase 1 precedes Phase 2.
- Phase 2 blocks all stories.
- US1 defines result records consumed by US2/US3 evidence.
- US2 preflight must complete before US3 fingerprints/persists a publication intent.
- Polish follows all stories.

## Parallel Opportunities

- T002 and T003 affect separate test helper files.
- T004 and T006 create independent contract and boundary test files.
- T025/T026 are sequential because both update the same recovery test file.

## Parallel Example: User Story 2

```text
Task T018: sentinel scenarios in write-boundaries.test.ts
Task T030: architecture checks in architecture-foundation.test.ts after the public contract is stable
```

## Implementation Strategy

Complete the portable contract/root primitives, deliver US1 as the independently consumable MVP,
then harden publication boundaries and recovery. Run the focused tests at each checkpoint and the full
matrix only after all tasks are complete.

## Format Validation

All tasks use checkbox, sequential ID, optional `[P]`, required story label in story phases, imperative
description, and an explicit repository path.

## Phase 7: Convergence

- [X] T033 CRITICAL replace the versioned API's project-integration dependency surface and reject integration/update-project plans before consumer-file inspection in packages/assetloom/src/api/generate-v2.ts per Constitution II/IV and FR-021 (contradicts)
- [X] T034 construct and require declared output roots for v2 cleanup in packages/assetloom/src/api/clean-v2.ts per FR-016–FR-017 (partial)
- [X] T035 normalize manifest output-root ownership before durable fingerprint construction in packages/assetloom/src/api/generate-v2.ts per FR-018–FR-019 (partial)
