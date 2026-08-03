# Implementation Plan: CLI, Compatibility, Documentation, and Package Verification

**Branch**: `mvp` | **Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-cli-docs-package-verification/spec.md`

## Summary

Route both supported configuration versions of CLI generation through `generateVersioned`, emit direct canonically serialized `GenerationResultV1` in JSON mode, derive human summaries from artifact dispositions, and add an atomic `--result-file` copy guarded beneath `.assetloom/results`. Retain safe legacy Node exports as explicitly non-authoritative compatibility surfaces. Expand clean-tarball smoke verification to compile public imports and run installed human/JSON/result-file/idempotency flows. Finish root/package/CLI/configuration/architecture/migration documentation and run the complete repository/Spec Kit verification matrix.

## Technical Context

**Language/Version**: TypeScript 6.0 on Node.js 22.12 or newer, ECMAScript modules

**Primary Dependencies**: Commander 15; `@sapkalabs/assetloom-core` stable result serializer; existing bounded state guard and atomic writer; npm/Yarn pack/install tooling

**Storage**: Generated artifacts beneath configured output roots; optional result JSON beneath `.assetloom/results`; existing ownership manifest, cache, and recovery state

**Testing**: Vitest unit/integration tests; TypeScript clean-consumer compilation; installed CLI smoke; workspace architecture and packed-content scans

**Target Platform**: Cross-platform Node library and CLI on Windows, macOS, and Linux

**Project Type**: Five-package library workspace plus executable facade

**Performance Goals**: Unchanged second generation performs zero artifact and result-file content writes; packed smoke completes locally without remote publication

**Constraints**: Direct result-version-1 JSON; stdout purity; stable `LOOM_` failures; result path traversal/link rejection; canonical deterministic serialization; no consumer-project mutation

**Scale/Scope**: One facade CLI, five packed workspaces, all current documentation and migration guidance; no new resource type or remote operation

## Constitution Check

*GATE: Passed before research and re-checked after design.*

- **Publish-and-describe**: PASS. Generation JSON and result files reproduce the complete returned catalog; neither configures consumers.
- **Consumer projects read-only**: PASS. Result files are explicit state-root outputs; migration examples assign all HTML/native integration to callers.
- **Bounded writes / recovery**: PASS. Result paths are relative beneath `.assetloom/results`, link-guarded, and atomic write-if-changed; artifact publication remains unchanged.
- **Declarative planning / package graph**: PASS. No new planner operation or dependency edge; Commander stays in the facade.
- **Determinism / result versioning**: PASS. CLI and files use the public canonical validator/serializer without timestamps or absolute identities.
- **Compatibility / errors**: PASS. Safe commands and exports remain; the deliberate JSON break is documented; failures retain stable codes/causes.
- **Verification**: PASS. Direct API/CLI/file equality, stream capture, path attacks, installed tarballs, types, CLI idempotency, docs, and forbidden scans are automated or explicitly checked.

Post-design re-check: PASS. The result-file contract remains dedicated state rather than a generated artifact or consumer write, and packed verification creates only disposable local fixtures.

## Project Structure

### Documentation (this feature)

```text
specs/005-cli-docs-package-verification/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── cli-generation-result-v1.md
├── checklists/
└── tasks.md
```

### Source Code (repository root)

```text
packages/assetloom/
├── src/cli/
│   ├── output.ts
│   ├── program.ts
│   └── result-file.ts
├── tests/
│   ├── cli-v2.test.ts
│   └── cli-result-file.test.ts
├── scripts/pack-smoke.mjs
└── README.md

packages/{assetloom-core,assetloom-images,assetloom-native,assetloom-web}/README.md
README.md
docs/
├── cli.md
├── configuration.md
├── migration-publish-and-describe.md
├── roadmap.md
└── architecture/*.md
```

**Structure Decision**: Keep command composition and Commander only in the facade. Add one focused CLI result-file module so state-root validation and atomic serialization are testable without broadening core. Reuse the public core result validator/serializer through the facade's existing result re-export. Extend the existing pack-smoke script rather than creating a second packaging system.

## Implementation Phases

1. **CLI contract tests**: update schema-v1/v2 JSON expectations, stream assertions, authoritative Node equality, no-op catalogs, and human summaries before runtime changes.
2. **Authoritative generation composition**: use `generateVersioned` for both schemas, direct stable JSON printing, report/result-file logging discipline, and disposition-based human summaries.
3. **Guarded result files**: add relative-path normalization, `.assetloom/results` containment/link guard, atomic write-if-changed, and focused attack/failure tests.
4. **Compatibility and migration docs**: document safe retained APIs versus authoritative surfaces, every removed mutation/config behavior, before/after flows, caller-owned web/native setup, ownership, hashing, and package graph.
5. **Packed consumer expansion**: validate tarball contents/exports/types, compile imports, run installed CLI human/JSON/result-file/repeat scenarios, and scan current packed material.
6. **Final repository audit**: full checks, exact command record, forbidden search, Spec Kit analysis, implement/converge loop, and final working-tree summary.

## Complexity Tracking

No constitution violation or exception is required.
