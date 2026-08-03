# Tasks: Remove Consumer-Project Mutation

**Input**: Design documents in `specs/002-remove-consumer-mutation/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/usage-descriptors-v1.md`

**Tests**: Required by the constitution and feature specification. Test tasks precede the behavior they constrain.

## Phase 1: Setup and inventory

**Purpose**: Freeze the forbidden surface and establish focused test files.

- [x] T001 Record the complete mutation runtime/schema/export inventory in `specs/002-remove-consumer-mutation/research.md`
- [x] T002 [P] Add a source/schema/public-export forbidden-capability assertion in `packages/assetloom/tests/architecture-foundation.test.ts`
- [x] T003 [P] Add consumer and repository byte-sentinel test scaffolding in `packages/assetloom/tests/consumer-boundary.test.ts`
- [x] T004 [P] Add typed descriptor contract and referential-integrity test scaffolding in `packages/assetloom/tests/usage-descriptors.test.ts`

---

## Phase 2: Foundational descriptor model

**Purpose**: Provide mutation-free declarative data before changing planners.

- [x] T005 Extend planned complete artifacts/tasks with JSON-safe usage metadata in `packages/assetloom/src/domain/catalog/planning.ts` and `packages/assetloom/src/domain/types.ts`
- [x] T006 [P] Define strongly typed deterministic web descriptor contracts/builders in `packages/assetloom/src/domain/web-usage.ts`
- [x] T007 [P] Define strongly typed deterministic native descriptor contracts/builders in `packages/assetloom/src/domain/native-usage.ts`
- [x] T008 Validate, de-duplicate, sort, and resolve planned descriptors in `packages/assetloom/src/application/execution/generation-result-builder.ts` and `packages/assetloom/src/domain/generation-result.ts`
- [x] T009 Export only caller-safe descriptor contracts from `packages/assetloom/src/index.ts`
- [x] T010 Run focused descriptor/result tests and type-check, recording the checkpoint in `specs/002-remove-consumer-mutation/tasks.md`

**Checkpoint**: Planners can describe integration without callbacks, destinations, or write operations.

---

## Phase 3: User Story 2 - Consume web usage descriptors (Priority: P1)

**Goal**: Publish complete web-owned resources and return typed caller integration data.

**Independent Test**: Generate branding beside sentinel HTML/manifest/static configuration, assert only owned outputs change, and resolve every descriptor to current artifacts.

### Tests for User Story 2

- [x] T011 [US2] Replace web adapter/merge expectations with complete-manifest and descriptor expectations in `packages/assetloom/tests/catalog-branding.test.ts`
- [x] T012 [P] [US2] Add unowned equal/different-byte manifest collision and stale owned-manifest cleanup cases in `packages/assetloom/tests/consumer-boundary.test.ts`
- [x] T013 [P] [US2] Add icon-link, manifest-link, SEO/head, and static-host descriptor serialization cases in `packages/assetloom/tests/usage-descriptors.test.ts`

### Implementation for User Story 2

- [x] T014 [US2] Remove project-integration recipes/artifacts from the catalog planning union in `packages/assetloom/src/domain/catalog/planning.ts`
- [x] T015 [US2] Replace web integration plans with whole manifest artifacts and typed descriptors in `packages/assetloom/src/resources/web-app-branding/handler.ts`
- [x] T016 [US2] Remove consumer document/static-config destinations from web resource types in `packages/assetloom/src/domain/catalog/resources.ts`
- [x] T017 [US2] Remove web mutation fields/definitions from `packages/assetloom/schema/config.schema.json` while retaining complete-manifest and descriptor inputs
- [x] T018 [US2] Simplify catalog planning/materialization tests and fixtures to output-only web plans in `packages/assetloom/tests/catalog-execution.test.ts` and `packages/assetloom/tests/catalog-resources.test.ts`
- [x] T019 [US2] Run web branding, descriptor, ownership-boundary, schema, and type-check tests

**Checkpoint**: Web output and caller guidance are independently usable with no consumer-file destination.

---

## Phase 4: User Story 3 - Consume native usage descriptors (Priority: P1)

**Goal**: Generate complete Android/iOS layouts and describe caller-owned application setup.

**Independent Test**: Plan and generate native assets beside sentinel manifest/Xcode/plist files and assert zero project update tasks or file reads/writes.

### Tests for User Story 3

- [x] T020 [US3] Replace native `update-project` expectations with output-only plan and descriptor expectations in `packages/assetloom/tests/generation.test.ts`
- [x] T021 [P] [US3] Add Android/iOS descriptor JSON and artifact-reference cases in `packages/assetloom/tests/usage-descriptors.test.ts`
- [x] T022 [P] [US3] Add AndroidManifest, Gradle, plist, and pbxproj byte-sentinel cases in `packages/assetloom/tests/consumer-boundary.test.ts`

### Implementation for User Story 3

- [x] T023 [US3] Remove `update-project` from native generation operations and tasks in `packages/assetloom/src/domain/types.ts` and `packages/assetloom/src/planner/index.ts`
- [x] T024 [US3] Attach Android/iOS manual setup descriptors to complete native outputs in `packages/assetloom/src/planner/index.ts`
- [x] T025 [US3] Remove Android manifest and Xcode project mutation serializers from `packages/assetloom/src/targets/android/content.ts` and `packages/assetloom/src/targets/ios/content.ts`
- [x] T026 [US3] Remove former native consumer project-file fields from `packages/assetloom/src/domain/types.ts` and `packages/assetloom/schema/config.schema.json`
- [x] T027 [US3] Simplify native execution and verification to owned outputs only in `packages/assetloom/src/application/execution/native-execution.ts`, `packages/assetloom/src/infrastructure/execution/native-task-executor.ts`, and `packages/assetloom/src/verification/index.ts`
- [x] T028 [US3] Update native configuration fixtures/demos and regression expectations in `packages/assetloom/tests/fixtures`, `apps/demo-react-native`, and `packages/assetloom/tests/icon-composer.test.ts`
- [x] T029 [US3] Run native planning, generation, descriptor, sentinel, schema, and type-check tests

**Checkpoint**: Native resources are complete outputs and all application registration belongs to the caller.

---

## Phase 5: User Story 1 - Runtime never touches consumer applications (Priority: P1)

**Goal**: Remove mutation dependencies from every runtime workflow and delete the forbidden implementation.

**Independent Test**: Run plan/generate/clean/verify/report over all sentinels and scan runtime/schema/exports for zero callable mutation capability.

### Tests for User Story 1

- [x] T030 [US1] Rewrite recovery tests around owned-output publication phases without adapters/receipts/gateways in `packages/assetloom/tests/generation-recovery.test.ts`
- [x] T031 [P] [US1] Replace Git-ignore mutation tests with repository-metadata immutability checks in `packages/assetloom/tests/storage.test.ts` and `packages/assetloom/tests/consumer-boundary.test.ts`
- [x] T032 [P] [US1] Extend plan/generate/clean/verify/report sentinel coverage in `packages/assetloom/tests/consumer-boundary.test.ts`

### Implementation for User Story 1

- [x] T033 [US1] Remove integration sessions/adapters from catalog execution contracts and orchestration in `packages/assetloom/src/application/execution/contracts.ts` and `packages/assetloom/src/application/execution/catalog-executor.ts`
- [x] T034 [US1] Make legacy and versioned generation output-only and mutation-dependency-free in `packages/assetloom/src/api/generate.ts` and `packages/assetloom/src/api/generate-v2.ts`
- [x] T035 [US1] Remove receipt/gateway/adapter handling from cleanup, verification, and reporting in `packages/assetloom/src/api/clean-v2.ts`, `packages/assetloom/src/api/verify-v2.ts`, and `packages/assetloom/src/api/report-v2.ts`
- [x] T036 [US1] Remove integration verification/report model behavior in `packages/assetloom/src/application/verification/catalog-verifier.ts`, `packages/assetloom/src/application/reporting/catalog-report-model.ts`, and `packages/assetloom/src/application/reporting/catalog-report-document.ts`
- [x] T037 [US1] Remove mutation dependencies/registrations from default composition in `packages/assetloom/src/infrastructure/composition/default-catalog-runtime.ts`
- [x] T038 [US1] Delete project integration registry/lifecycle, all web integration adapters, receipt store, project-file gateway, and Git-ignore manager under `packages/assetloom/src/application/execution`, `packages/assetloom/src/infrastructure/web-integration`, and `packages/assetloom/src/storage`
- [x] T039 [US1] Remove all deleted mutation contracts and implementations from public exports in `packages/assetloom/src/index.ts`
- [x] T040 [US1] Run consumer-boundary, recovery, verification/reporting, architecture, and full type-check tests

**Checkpoint**: No public runtime operation can inspect or modify a consumer-owned application file.

---

## Phase 6: User Story 4 - Migrate without hidden compatibility mutation (Priority: P2)

**Goal**: Produce stable migration behavior while keeping valid output-only workflows functional.

**Independent Test**: Validate obsolete configuration fails with a stable code, removed imports are absent from a clean consumer, and valid workflows pass.

### Tests for User Story 4

- [x] T041 [US4] Add migration diagnostic cases for former web/native configuration fields in `packages/assetloom/tests/load.test.ts`
- [x] T042 [P] [US4] Add packed public-export absence assertions to `packages/assetloom/scripts/pack-smoke.mjs`

### Implementation for User Story 4

- [x] T043 [US4] Add migration-oriented stable diagnostics for rejected former mutation options in `packages/assetloom/src/config/load.ts` and `packages/assetloom/src/domain/errors.ts`
- [x] T044 [US4] Remove current mutation guidance from `packages/assetloom/README.md`, demos, and current architecture documentation while retaining historical ADR context
- [x] T045 [US4] Document obsolete receipt retirement and descriptor migration in `specs/002-remove-consumer-mutation/quickstart.md`
- [x] T046 [US4] Run clean-consumer packed smoke, CLI/Node non-mutating regression, schema, and migration diagnostic tests

---

## Phase 7: Verification and cleanup

- [x] T047 Run the exact forbidden-capability search over `packages/assetloom/src`, schema, manifest, and packed contents and record zero matches
- [x] T048 Run `yarn build`, `yarn lint`, `yarn typecheck`, `yarn test`, and `yarn pack:smoke`
- [x] T049 Verify all checklist items and update completed task checkboxes accurately in `specs/002-remove-consumer-mutation/tasks.md`

---

## Dependencies and execution order

- Phase 1 establishes evidence; Phase 2 blocks every planner migration.
- Web (Phase 3) and native (Phase 4) rely on descriptor foundations but are otherwise independently testable.
- Runtime deletion (Phase 5) depends on both planner migrations so no useful behavior is discarded.
- Compatibility work (Phase 6) depends on the final removed schema/export surface.
- Verification (Phase 7) depends on all user stories.
- Within each story, tests are authored before implementation and run at its checkpoint.

## Parallel opportunities

- T002–T004 touch independent tests.
- T006 and T007 define independent descriptor families.
- T012/T013 and T021/T022 are independent test groups.
- T031/T032 and T041/T042 touch independent surfaces.

## Implementation strategy

1. Establish descriptor contracts and tests.
2. Convert web and native planning separately, verifying each boundary.
3. Simplify orchestration and delete the now-unreferenced mutation stack.
4. Add explicit migration diagnostics and package evidence.
5. Run the full matrix and Spec Kit convergence.

## Convergence Status

Converged on 2026-08-02. All 20 functional requirements and 7 success criteria
are implemented and covered by the completed task set. The runtime, schema,
public export, and packed-package capability searches are clean; no convergence
tasks were appended.
