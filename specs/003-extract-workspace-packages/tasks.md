# Tasks: Extract Focused Workspace Packages

## Phase 1: Package scaffolding

- [x] T001 Create manifests/TypeScript configs/public roots for core, images, native, and web under `packages/`
- [x] T002 Update root scripts and facade workspace dependencies for topological all-package checks in `package.json` and `packages/assetloom/package.json`
- [x] T003 Run Yarn install and verify lockfile/workspace integrity

## Phase 2: Focused public ownership

- [x] T004 [US1] Implement authoritative portable result/error/hash contracts in `packages/assetloom-core/src`
- [x] T005 [US1] Make facade result/hash compatibility modules consume core package exports in `packages/assetloom/src`
- [x] T006 [US1] Implement generic image recipe/inspection APIs in `packages/assetloom-images/src`
- [x] T007 [US1] Implement native roles/presets/descriptor builders in `packages/assetloom-native/src`
- [x] T008 [US1] Implement web presets/public-path/cache-policy/descriptor APIs in `packages/assetloom-web/src`
- [x] T009 [US1] Re-export focused package roots through the facade public entry point

## Phase 3: Architecture enforcement

- [x] T010 [US2] Add manifest edge/cycle/version/export assertions in `packages/assetloom/tests/package-architecture.test.ts`
- [x] T011 [US2] Add cross-package private-import and facade-only CLI assertions in `packages/assetloom/tests/package-architecture.test.ts`
- [x] T012 [US2] Expand ESLint/type-check/build scripts to all workspace packages

## Phase 4: Pack and regression evidence

- [x] T013 [US3] Replace pack smoke with five-tarball clean-install/import verification in `packages/assetloom/scripts/pack-smoke.mjs`
- [x] T014 [US3] Add focused package API tests in `packages/assetloom/tests/package-architecture.test.ts`
- [x] T015 [US3] Add concise READMEs for all focused packages and update the root package graph documentation
- [x] T016 Run build, lint, type-check, tests, architecture search, and clean pack smoke
- [x] T017 Mark tasks accurately and run Spec Kit convergence

## Dependencies

Scaffolding precedes public ownership; core precedes images; core/images precede native/web; all focused packages precede facade composition and architecture/pack evidence.

## Convergence Status

Converged on 2026-08-02 with all 17 tasks complete. The five-workspace graph,
exports, import boundaries, lockstep versions, focused APIs, and clean-tarball
consumer smoke are green; no tasks were appended.
