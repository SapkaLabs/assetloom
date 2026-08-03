# Implementation Plan: Publish-and-Describe Foundation

**Branch**: `mvp` | **Date**: 2026-08-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-publish-describe-foundation/spec.md`

## Summary

Introduce a resource-neutral versioned result model and a bounded whole-file publisher within the
existing package before workspace extraction. Adapt the existing manifest, state guard, recovery
journal, and materialization pipeline so publication returns deterministic created/updated/unchanged
records plus removed-owned records, validates every destination against a declared output-root
registry, and exposes JSON-safe typed usage envelopes. Preserve current rendering and configuration
behavior while providing compatibility mapping for legacy callers.

## Technical Context

**Language/Version**: TypeScript 6.0.3 on Node.js >=22.12, ESM/NodeNext

**Primary Dependencies**: Existing Node filesystem/crypto primitives, AJV for configuration;
resource/render dependencies remain behind existing materializers and are not part of the new core
contract

**Storage**: Complete generated files beneath declared roots; `.assetloom/manifest.json`,
content-addressed cache, lock, and pending-generation journal beneath the guarded state root

**Testing**: Vitest 4.1.10, TypeScript strict type-check, ESLint 10, packed-package smoke tests

**Target Platform**: Cross-platform Node.js library/CLI on Windows, macOS, and Linux filesystems

**Project Type**: Deterministic asset compiler library with CLI facade

**Performance Goals**: Identical reruns perform zero output content writes; destination-only changes
reuse materialized content; deterministic result construction is linearithmic in artifact count due
to explicit sorting

**Constraints**: Preserve stable `LOOM_` failures and causes; reject unowned collisions before
publication; no consumer-file semantics; no absolute machine paths in portable results; retain
recoverable pending intent on all post-begin failures

**Scale/Scope**: Existing schema v1/v2 plans and tens to hundreds of outputs per invocation; this
feature adds no resource types and does not yet split workspace packages or change CLI presentation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Publish-and-Describe | Result represents complete owned outputs and usage data only | PASS |
| II. Consumer Projects Are Read-Only | New contracts contain no integration/mutation operations | PASS |
| III. Whole-File Ownership and Bounded Publication | Root registry, ownership preflight, and recovery are mandatory | PASS |
| IV. Declarative Planning and Package Boundaries | Existing planners remain declarative; extraction is intentionally deferred | PASS |
| V. Determinism, Results, and Content Identity | Final-byte SHA-256, portable paths, explicit ordering | PASS |
| VI. Errors and Compatibility | Stable codes/causes and compatibility mapper are planned | PASS |
| VII. Automated Boundary Evidence | Contract, boundary, determinism, recovery, and architecture tests are tasks | PASS |

No constitution violation or complexity exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/001-publish-describe-foundation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── generation-result-v1.md
├── checklists/
│   ├── requirements.md
│   └── foundation.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/assetloom/
├── src/
│   ├── api/
│   │   └── generate-v2.ts                 # return the versioned result
│   ├── application/
│   │   ├── execution/
│   │   │   ├── generation-result-builder.ts
│   │   │   ├── generation-intent-fingerprint.ts
│   │   │   └── contracts.ts               # declarative/materialization contracts only
│   │   └── planning/
│   │       └── output-root-registry.ts
│   ├── domain/
│   │   ├── generation-result.ts            # portable public V1 contract
│   │   └── catalog/planning.ts             # complete-file plan metadata
│   ├── storage/
│   │   ├── manifest.ts
│   │   ├── owned-output-lifecycle.ts
│   │   ├── pending-generation-store.ts
│   │   └── state-path-guard.ts
│   └── index.ts
└── tests/
    ├── generation-result.test.ts
    ├── write-boundaries.test.ts
    ├── generation-recovery.test.ts
    └── architecture-foundation.test.ts
```

**Structure Decision**: Implement the resource-neutral foundation in the current publishable package
so behavior can be proven without mixing it with workspace moves. Files are deliberately shaped for
later extraction into `@sapkalabs/assetloom-core`. `OwnedOutputLifecycle` is the single bounded
whole-file publisher for this incremental feature; existing storage and recovery code is adapted
incrementally. Consumer-mutation types remain only until feature 2 removes them; architecture tests
for this feature ensure the new result/root/publisher surface cannot depend on those legacy ports.

## Phase 0: Research Decisions

See [research.md](research.md). Key decisions are an identified output-root registry, a two-stage
prepare/publish lifecycle, disposition capture at the publisher boundary, portable root-relative
paths, final-byte hashes, stable code-point ordering, and a narrow legacy-result compatibility map.

## Phase 1: Design and Contracts

See [data-model.md](data-model.md), [generation-result-v1.md](contracts/generation-result-v1.md), and
[quickstart.md](quickstart.md). The post-design constitution re-check remains PASS: every write has a
declared owner/root, results are versioned and deterministic, and recovery state remains explicit.

## Implementation Phases

1. Add contract tests and the public V1 result/domain model.
2. Add output-root registration and boundary validation with path/link/collision tests.
3. Adapt owned publication to return dispositions, sizes, hashes, and stale-removal records.
4. Build deterministic complete results and integrate them into `generateV2` while retaining a
   narrow legacy mapper for non-conflicting callers.
5. Extend recovery and sentinel tests, export the new contract, and run focused then full checks.

## Complexity Tracking

No constitution exceptions.
