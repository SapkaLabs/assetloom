# Tasks: CLI, Compatibility, Documentation, and Package Verification

**Input**: Design documents from `specs/005-cli-docs-package-verification/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/cli-generation-result-v1.md`

**Tests**: This final integration feature requires automated CLI stream, result-file boundary, installed-package, and idempotency evidence.

## Phase 1: Setup and Final-Feature Baseline

**Purpose**: Inventory current compatibility/documentation surfaces and freeze the green pre-change matrix.

- [x] T001 Inventory CLI generation projections, facade exports, package READMEs, operational docs, migration gaps, and current forbidden-capability references in `packages/assetloom/src`, `packages/*/README.md`, `README.md`, and `docs`
- [x] T002 Run and record baseline build, lint, type-check, full tests, pack smoke, CLI human/JSON smoke, and immutable-install warning evidence in `specs/005-cli-docs-package-verification/verification.md`

---

## Phase 2: Foundational CLI Result Infrastructure

**Purpose**: Create reusable output and guarded state-file primitives before command migration.

- [x] T003 Add direct canonical generation-result output and stderr information helpers in `packages/assetloom/src/cli/output.ts`
- [x] T004 Add normalized `.assetloom/results` path validation, state-path guarding, and atomic stable-result write-if-changed in `packages/assetloom/src/cli/result-file.ts`
- [x] T005 [P] Export or reuse only the authoritative public result validator/serializer needed by CLI infrastructure through `packages/assetloom/src/domain/generation-result.ts` and `packages/assetloom/src/index.ts`

**Checkpoint**: CLI composition can print and persist a validated direct result without broadening write scope.

---

## Phase 3: User Story 1 - Consume One Generation Contract Everywhere (Priority: P1) 🎯 MVP

**Goal**: Make Node, CLI JSON, and guarded result files return the same complete result-version-1 value.

**Independent Test**: Compare stable Node, stdout, and result-file serializations for schema versions 1 and 2, including an unchanged repeat and JSON failure streams.

### Tests for User Story 1

- [x] T006 [US1] Update schema-version-1 and schema-version-2 generation JSON assertions from legacy envelopes to direct `GenerationResultV1` in `packages/assetloom/tests/cli-v2.test.ts`
- [x] T007 [US1] Add Node API versus CLI stdout stable-equality, complete unchanged catalog, and zero-content-write evidence in `packages/assetloom/tests/cli-v2.test.ts`
- [x] T008 [US1] Add result-file byte equality, stable rewrite, absolute/empty/traversal/NUL, and symlink/junction escape cases in `packages/assetloom/tests/cli-result-file.test.ts`
- [x] T009 [US1] Add JSON success stdout purity and failure empty-stdout/stable-stderr assertions in `packages/assetloom/tests/cli-v2.test.ts` and `packages/assetloom/tests/cli-result-file.test.ts`

### Implementation for User Story 1

- [x] T010 [US1] Add `--result-file <path>` and route both schema versions through `generateVersioned` in `packages/assetloom/src/cli/program.ts`
- [x] T011 [US1] Emit direct canonical result JSON only after requested result-file/report side effects succeed in `packages/assetloom/src/cli/program.ts`
- [x] T012 [US1] Derive machine output exclusively from `GenerationResultV1` and preserve stable `LOOM_` causes for result-file failures in `packages/assetloom/src/cli/program.ts` and `packages/assetloom/src/cli/result-file.ts`

**Checkpoint**: Direct Node/stdout/file values match and unsafe result-file writes fail closed.

---

## Phase 4: User Story 2 - Retain Useful Human Workflows Without Ambiguity (Priority: P1)

**Goal**: Preserve concise human generation/report/target behavior and other safe commands while using the versioned engine.

**Independent Test**: Run human first/repeat generation, reporting, help/version, target selection, plan, verify, clean, and error exit-code flows.

### Tests for User Story 2

- [x] T013 [US2] Add human created/updated/unchanged/removed summary and optional result/report path assertions in `packages/assetloom/tests/cli-v2.test.ts`
- [x] T014 [US2] Preserve plan, verify, report, clean, target-filter, help/version, and 0/1/2 exit-code coverage in `packages/assetloom/tests/cli-v2.test.ts`
- [x] T015 [US2] Add JSON-plus-report stream separation coverage in `packages/assetloom/tests/cli-v2.test.ts`

### Implementation for User Story 2

- [x] T016 [US2] Build human generation counts from artifact dispositions and removed entries in `packages/assetloom/src/cli/program.ts`
- [x] T017 [US2] Keep report/result side-output notices off JSON stdout while retaining human summaries in `packages/assetloom/src/cli/program.ts` and `packages/assetloom/src/cli/output.ts`
- [x] T018 [US2] Preserve safe non-generation command dispatch and stable exit behavior in `packages/assetloom/src/cli/program.ts`

**Checkpoint**: Human workflows remain usable and no side-output message contaminates JSON stdout.

---

## Phase 5: User Story 3 - Migrate Removed Integration Behavior Confidently (Priority: P1)

**Goal**: Provide complete before/after guidance for APIs, CLI, web, native, configuration, ownership, hashing, and package responsibilities.

**Independent Test**: Validate each after-example against declared exports/configuration and search current guidance for removed callable recommendations.

### Documentation for User Story 3

- [x] T019 [P] [US3] Create before/after Node API, CLI, web HTML, Android, iOS, React Native, removed-capability, and web-policy guidance in `docs/migration-publish-and-describe.md`
- [x] T020 [P] [US3] Document direct generation JSON, result-file bounds, stdout/stderr, human output, exits, and retained command compatibility in `docs/cli.md`
- [x] T021 [P] [US3] Expand schema-version-2 target/resource, web naming policy, output ownership, and caller-responsibility guidance in `docs/configuration.md`
- [x] T022 [US3] Update the root and facade guides with the five-package graph, authoritative Node/CLI contracts, hashing, ownership, migration link, and consumer responsibilities in `README.md` and `packages/assetloom/README.md`
- [x] T023 [P] [US3] Document focused responsibilities, exports, dependencies, and compatibility in `packages/assetloom-core/README.md`, `packages/assetloom-images/README.md`, `packages/assetloom-native/README.md`, and `packages/assetloom-web/README.md`
- [x] T024 [US3] Remove or correct stale current guidance about project integration, Git exclude mutation, and application-file verification in `docs/architecture`, `docs/roadmap.md`, `docs/reporting.md`, and `docs/release-readiness.md`

**Checkpoint**: Current guidance consistently describes publish-and-describe; historical ADRs remain clearly historical.

---

## Phase 6: User Story 4 - Consume Verified Packed Workspaces (Priority: P1)

**Goal**: Prove declarations, exports, dependency graph, package contents, and the installed CLI from tarballs only.

**Independent Test**: Pack/install five tarballs, compile/import public roots, then run installed human/JSON/result-file/repeat generation and packed forbidden scans.

### Verification for User Story 4

- [x] T025 [US4] Extend tarball manifest/export/dependency and packed JavaScript/declaration/schema/README capability scans in `packages/assetloom/scripts/pack-smoke.mjs`
- [x] T026 [US4] Add clean-fixture TypeScript public-root compilation and representative runtime imports in `packages/assetloom/scripts/pack-smoke.mjs`
- [x] T027 [US4] Add installed CLI human generation, direct JSON validation, result-file equality, unchanged repeat, and help smoke in `packages/assetloom/scripts/pack-smoke.mjs`
- [x] T028 [US4] Enforce the expanded package-smoke obligations in `packages/assetloom/tests/package-architecture.test.ts`

**Checkpoint**: The distributable tarballs work without workspace resolution and contain no forbidden current surface.

---

## Phase 7: Final Audit and Verification Record

**Purpose**: Execute every repository-standard and governance gate, record exact evidence, and leave resumable status.

- [x] T029 Run immutable install, build, formatting check if configured, lint, type-check, full unit/integration tests, package/export validation, pack, clean-consumer smoke, CLI human/JSON/result-file/idempotency smoke, and record exact outcomes in `specs/005-cli-docs-package-verification/verification.md`
- [x] T030 Run exact current-source/schema/export/documentation and packed-content forbidden-capability searches and record scopes/results in `specs/005-cli-docs-package-verification/verification.md`
- [x] T031 Record Spec Kit v0.15.1 integration status, final cross-feature analysis outcome, environmental warnings/skips, remaining risks, and final `git status --short` summary in `specs/005-cli-docs-package-verification/verification.md`

---

## Dependencies and Execution Order

### Phase Dependencies

- Phase 1 has no dependency.
- Phase 2 depends on the baseline and blocks CLI stories.
- User Story 1 depends on Phase 2 and defines the machine contract.
- User Story 2 depends on User Story 1's versioned composition.
- User Story 3 can begin after public contract names stabilize in User Story 1.
- User Story 4 depends on completed CLI and documentation package contents.
- Phase 7 depends on all stories; final Spec Kit analysis/convergence follows the recorded implementation checks.

### Parallel Opportunities

- T005 can proceed while result-file infrastructure is built.
- T019–T021 and T023 target separate documentation files.
- T025–T026 can be developed together before installed CLI flow T027.
- Focused CLI tests and documentation can proceed in parallel after the direct contract stabilizes.

## Implementation Strategy

1. Establish the direct contract and guarded result-file MVP.
2. Restore/preserve human and other command compatibility against tests.
3. Complete all migration and package documentation.
4. Expand installed-tarball verification.
5. Run the entire final matrix, final analysis, and convergence; implement any appended tasks and repeat until clean.

Every completed task must have its named file/evidence, preserve unrelated work, and pass its focused checks before marking `[x]`.
