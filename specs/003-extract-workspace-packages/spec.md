# Feature Specification: Extract Focused Workspace Packages

**Feature Branch**: `mvp`
**Created**: 2026-08-02
**Status**: Draft
**Input**: Extract AssetLoom into the constitutionally required core, images, native, web, and executable/facade workspaces with enforced one-way dependencies.

## User Scenarios & Testing

### User Story 1 - Consume focused public packages (Priority: P1)

As a Node caller, I can install only the AssetLoom capabilities I need and import every supported symbol through a declared package export.

**Independent Test**: Pack all five workspaces, install them in a clean fixture, import their public entry points, and execute representative contract/helper calls.

**Acceptance Scenarios**:

1. Core exposes resource-neutral result, planning, hashing, ownership, recovery, and diagnostic contracts without loading Sharp, Commander, web, or native code.
2. Images exposes generic image inspection/materialization primitives and depends only on core plus its image implementation dependencies.
3. Native exposes native presets, roles, validators, planner-facing contracts, and typed usage descriptors and depends only on core and images.
4. Web exposes web presets, public-path/hash policy contracts, and typed usage descriptors and depends only on core and images.
5. The executable/facade composes all focused packages and retains the `assetloom` binary.

### User Story 2 - Enforce architectural boundaries (Priority: P1)

As a maintainer, invalid dependencies, cycles, private source imports, misplaced CLI code, or undeclared exports fail an automated check.

**Independent Test**: Run the architecture test against manifests and source imports; intentionally modeled forbidden edges are rejected.

**Acceptance Scenarios**:

1. The allowed dependency graph is exactly core <- images <- {native, web} <- facade, with native/web also depending directly on core.
2. Core has no Sharp, Commander, native, web, or image-specific dependency/import.
3. No package imports another package's private `src` path.
4. CLI command definitions and the executable entry point exist only in `@sapkalabs/assetloom`.
5. Every public entry point is declared in the owning manifest's exports.

### User Story 3 - Preserve safe behavior through extraction (Priority: P2)

As an existing non-mutating caller, builds, generation, verification, cleanup, reporting, and public facade imports continue to work after package extraction.

**Independent Test**: Run the existing full matrix plus clean packed-consumer smoke tests against the workspace graph.

## Requirements

- **FR-001**: The workspace MUST contain `@sapkalabs/assetloom-core`, `@sapkalabs/assetloom-images`, `@sapkalabs/assetloom-native`, `@sapkalabs/assetloom-web`, and `@sapkalabs/assetloom`.
- **FR-002**: All packages MUST use version `0.2.0` initially and the repository's Yarn workspace conventions.
- **FR-003**: Core MUST remain resource-neutral and MUST NOT depend on Sharp, Commander, native, web, or image implementation.
- **FR-004**: Images MAY depend on core; native and web MAY depend on core and images; facade MAY depend on all four; no other internal edge is permitted.
- **FR-005**: No dependency cycle may exist.
- **FR-006**: Cross-package imports MUST use declared package exports and MUST NOT reference another package's private source paths.
- **FR-007**: All package public entry points MUST be declared through `exports` with JavaScript and declaration targets.
- **FR-008**: CLI commands, Commander, and the binary MUST exist only in the facade package.
- **FR-009**: Native/web packages MUST expose planners/presets/validators or focused planning helpers and strongly typed descriptors, not CLI commands.
- **FR-010**: Images MUST own reusable image format/dimension/recipe/inspection contracts and Sharp-backed implementation entry points.
- **FR-011**: The facade MUST compose/re-export the focused public surface without a dependency cycle.
- **FR-012**: No vague common/general/utils workspace or speculative plugin abstraction may be introduced.
- **FR-013**: Existing safe Node and CLI workflows MUST remain supported.
- **FR-014**: All five packages MUST build, type-check, pack, install, and import from a clean consumer.
- **FR-015**: Architecture enforcement MUST inspect both manifests and source imports.

## Success Criteria

- **SC-001**: The architecture test reports exactly five public AssetLoom workspaces and zero forbidden edges/cycles/private imports.
- **SC-002**: Core's dependency and source scan contains zero Sharp, Commander, native, web, or image implementation references.
- **SC-003**: A clean fixture installs all five tarballs and imports every declared public root successfully.
- **SC-004**: Full build, lint, type-check, tests, and pack smoke pass with no regression in safe generation behavior.
- **SC-005**: All package versions are lockstep and all public entry points resolve through exports.

## Assumptions

- Extraction is incremental: proven facade internals may remain as compatibility orchestration while public contracts and focused implementations move behind workspace entry points.
- No new resource type or plugin system is introduced.
- Expo remains outside scope.
