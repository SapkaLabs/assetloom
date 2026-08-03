# Implementation Plan: Web Content Hashing and Usage Descriptors

**Branch**: `mvp` | **Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-web-hashing-descriptors/spec.md`

## Summary

Replace the web branding configuration's legacy `stable`/`content-hash` naming vocabulary with optional `none`/`filename`/`query` cache-busting policy, defaulting to `none`. Resolve browser identity from the SHA-256 digest of final materialized bytes, add query-token publication without changing the destination, and let existing planned usage references inherit the resolved public path. Refactor catalog image cache aliases to contain only input-byte hashes, path-free effective recipes, encoder options, the focused images renderer compatibility version, and preset/algorithm versions. Retain the current ownership manifest and bounded two-phase publication so changed filename hashes remove only obsolete owned outputs.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js 20 or newer, ECMAScript modules

**Primary Dependencies**: `@sapkalabs/assetloom-core`, `@sapkalabs/assetloom-images`, Sharp 0.34, Ajv 8

**Storage**: Filesystem content-addressed cache, alias index, ownership manifest, and recoverable pending-generation state beneath `.assetloom`

**Testing**: Vitest unit/integration tests plus repository build, lint, type-check, architecture, and packed-consumer smoke checks

**Target Platform**: Cross-platform Node library and CLI on Windows, macOS, and Linux filesystems

**Project Type**: Deterministic asset compiler, workspace libraries, and CLI

**Performance Goals**: Publication-only or unrelated configuration changes cause zero image renderer invocations; unchanged repeated generation performs zero content writes

**Constraints**: Final-byte SHA-256; 8–64 hexadecimal token characters; `none` compatibility default; deterministic JSON-safe descriptors; no consumer-project mutation; preflight before writes

**Scale/Scope**: Existing `web-app-branding` resource only; no new resource types or plugin abstraction

## Constitution Check

*GATE: Passed before research and re-checked after design.*

- **Publish-and-describe**: PASS. The design changes only complete AssetLoom-owned outputs and returned descriptor data.
- **Consumer projects read-only**: PASS. No HTML, manifest, framework, repository metadata, or project-file mutation port is introduced.
- **Whole-file ownership / bounded publication**: PASS. Final destinations flow through the existing output-root registry, ownership preflight, manifest, and recovery journal.
- **Declarative planning**: PASS. The web handler emits publication metadata and complete-file artifacts; only the publisher writes.
- **Package graph**: PASS. Public web policy helpers remain in `@sapkalabs/assetloom-web`; Sharp behavior remains in images/facade implementation; core remains neutral.
- **Determinism / results**: PASS. Full final-byte digest, exact token, stable ordering, and path-free cache identity are explicit contract requirements.
- **Compatibility / errors**: PASS. `none` is the absent-policy default; removed legacy policy terms receive migration diagnostics; public failures retain `LOOM_` codes.
- **Automated evidence**: PASS. Tests cover all three policies, cache reuse/invalidation, descriptors, ownership cleanup, sentinels, and repeated generation.

Post-design re-check: PASS. The contract and data model contain no forbidden write or dependency edge, and all state transitions preserve preflight and ownership semantics.

## Project Structure

### Documentation (this feature)

```text
specs/004-web-hashing-descriptors/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── web-content-identity-v1.md
├── checklists/
└── tasks.md
```

### Source Code (repository root)

```text
packages/assetloom-web/
└── src/index.ts                         # Public web policies, validation, paths, descriptor types

packages/assetloom/
├── schema/config.schema.json            # Optional none/filename/query configuration contract
├── src/domain/catalog/
│   ├── resources.ts                     # Web resource policy shape
│   └── planning.ts                      # Stable/query and filename publication plans
├── src/infrastructure/images/
│   └── image-materializer.ts            # Path-free, byte-affecting render fingerprint
├── src/resources/web-app-branding/
│   └── handler.ts                       # Policy validation and declarative output plans
├── src/storage/
│   └── catalog-publication-resolver.ts  # Final-byte digest, filename/query resolution
└── tests/
    ├── catalog-branding.test.ts          # End-to-end web policies, descriptors, ownership
    ├── catalog-foundation.test.ts        # Publication-resolution contract
    ├── render-cache.test.ts              # Cache identity and invalidation
    └── usage-descriptors.test.ts         # Stable typed descriptor serialization
```

**Structure Decision**: Extend the focused web package's public policy contract and the existing facade orchestration in place. The publisher remains resource-neutral: it understands generic stable, query-token, and filename-token publication shapes, while web alone chooses those shapes. The image cache refactor stays with the existing Sharp materializer until its proven implementation is extracted further; it consumes the focused images compatibility version through a public package export.

## Implementation Phases

1. **Public policy and schema**: define optional `none`/`filename`/`query` configuration, shared safe token validation, default `none`, and actionable migration errors for legacy values.
2. **Final-content publication**: add query-token metadata to stable publication, compute digest before destination/public-path resolution, and return the exact token used by filename/query policies.
3. **Render identity isolation**: replace whole-configuration and absolute input-path participation with a canonical path-free recipe plus ordered input-byte hashes and compatibility versions.
4. **End-to-end web planning**: route every branding output, complete manifest, and descriptor through one policy-aware publication factory; retain manifest ownership cleanup.
5. **Verification and guidance**: add focused cache/policy/cleanup tests, update web policy documentation, then run full workspace and packed-package checks.

## Complexity Tracking

No constitution violations require an exception.
