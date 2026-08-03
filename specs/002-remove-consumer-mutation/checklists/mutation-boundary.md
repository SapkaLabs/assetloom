# Requirement Quality Checklist: Consumer-Mutation Boundary

**Purpose**: Validate that the feature requirements are complete, measurable, unambiguous, and ready for implementation.
**Created**: 2026-08-02
**Feature**: [spec.md](../spec.md)

## Product boundary

- [x] CHK001 Does the specification enumerate every prohibited consumer-file behavior rather than relying on a generic “do not mutate” statement? [Completeness, Spec §FR-001–FR-004]
- [x] CHK002 Is the distinction between complete AssetLoom-owned output and consumer application configuration explicit? [Clarity, Spec §FR-007/FR-020]
- [x] CHK003 Are generation, cleanup, verification, and reporting all explicitly covered by the read-only boundary? [Coverage, Spec §US1/FR-014–FR-015]
- [x] CHK004 Does the specification prohibit renamed, deprecated, optional, callback, hook, and plugin escape hatches? [Completeness, Spec §FR-017]
- [x] CHK005 Are repository metadata writes, including both `.git/info/exclude` and `.gitignore`, explicitly forbidden? [Clarity, Spec §FR-003]
- [x] CHK006 Are legacy receipt files required to be ignored instead of interpreted for rollback or cleanup? [Edge case, Spec §FR-013]

## Whole-file ownership and planning

- [x] CHK007 Is a generated web manifest defined as a complete owned artifact subject to normal collision and stale-cleanup rules? [Clarity, Spec §FR-007]
- [x] CHK008 Are identical-byte unowned destinations covered as collisions rather than implicit adoption? [Edge case, Spec §US2.3/Edge Cases]
- [x] CHK009 Are native plans prohibited from containing resource-registration or `update-project` operations? [Clarity, Spec §FR-005]
- [x] CHK010 Are web plans prohibited from containing HTML, manifest-merge, or static-host integration operations? [Clarity, Spec §FR-006]
- [x] CHK011 Is the handling of targets that become descriptor-only after mutation removal acknowledged? [Edge case, Spec §Edge Cases]
- [x] CHK012 Does the plan identify the dependency order for removing planner, executor, API, adapter, and state layers? [Traceability, Plan §Implementation Phases]

## Usage descriptors

- [x] CHK013 Are descriptor versioning, determinism, JSON safety, and artifact-reference validity normative requirements? [Completeness, Spec §FR-008/FR-010]
- [x] CHK014 Are required web descriptor categories and caller-useful fields stated without naming consumer destinations? [Completeness, Spec §FR-009/US2]
- [x] CHK015 Are required native roles, names, portable paths, and manual setup instructions stated? [Completeness, Spec §FR-011/US3]
- [x] CHK016 Is it clear that descriptors are data and cannot contain callbacks, commands, or write operations? [Clarity, Contract §Constraints]
- [x] CHK017 Are descriptor references required to resolve against the complete current result catalog? [Consistency, Spec §SC-003]
- [x] CHK018 Does the data model define where descriptors enter the plan and how execution validates them? [Traceability, Data Model §PlannedUsageDescriptorV1]

## Compatibility and diagnostics

- [x] CHK019 Are former native and web mutation configuration properties explicitly removed rather than ignored? [Clarity, Spec §FR-012]
- [x] CHK020 Do migration failures require stable `LOOM_` codes and preserved dependency causes? [Completeness, Spec §FR-018]
- [x] CHK021 Are non-mutating workflows preserved only where compatible with ownership rules? [Consistency, Spec §FR-016]
- [x] CHK022 Is the absence of removed public imports testable from a clean consumer? [Measurability, Spec §US4.1]
- [x] CHK023 Are historical ADRs distinguished from current runtime and user documentation? [Scope, Spec §Assumptions]
- [x] CHK024 Are no-new-resource-type and Expo exclusions recorded? [Scope, Spec §FR-019]

## Verification quality

- [x] CHK025 Are byte-identical sentinels required for all named consumer and repository file classes? [Measurability, Spec §SC-001]
- [x] CHK026 Is zero forbidden runtime/schema/export/package capability a measurable outcome with explicit exclusions? [Measurability, Spec §SC-002]
- [x] CHK027 Are descriptor type validation, JSON round-trip, determinism, and referential integrity all measurable? [Measurability, Spec §SC-003]
- [x] CHK028 Are both equal-byte and different-byte ownership collision cases required? [Coverage, Spec §SC-004]
- [x] CHK029 Are plan-level absence checks required separately from runtime sentinel checks? [Coverage, Spec §SC-005]
- [x] CHK030 Is compilation without mutation dependencies a stated acceptance measure? [Measurability, Spec §SC-006]
- [x] CHK031 Does verification retain the full build, lint, type-check, test, and package-smoke regression matrix? [Completeness, Spec §SC-007]
- [x] CHK032 Does the quickstart define a reproducible forbidden-capability search over runtime, schema, and package surfaces? [Traceability, Quickstart §Forbidden capability search]

## Notes

- All checklist items are resolved by the specification, plan, design model, contract, or quickstart.
- Implementation completion is tracked separately in `tasks.md`.
