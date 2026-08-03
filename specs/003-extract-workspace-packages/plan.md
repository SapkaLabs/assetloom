# Implementation Plan: Extract Focused Workspace Packages

**Branch**: `mvp` | **Date**: 2026-08-02 | **Spec**: [spec.md](spec.md)

## Summary

Create four focused workspaces beside the executable facade, make core's result and hashing surface authoritative, expose concrete image/native/web helpers and contracts, compose them from the facade, and enforce the exact dependency/import/export graph. Build and pack in topological order and install all tarballs in a clean consumer.

## Technical Context

**Language/Version**: TypeScript 6.0.3, Node >=22.12, ESM/NodeNext
**Package manager**: Yarn 4 workspaces
**Dependencies**: Sharp only in images; Commander only in facade
**Testing**: Vitest plus Node architecture/pack smoke scripts
**Constraints**: no cycles/private source imports; lockstep 0.2.0; no new resource type/plugin abstraction

## Constitution Check

| Gate | Status |
|---|---|
| Core resource-neutral | PASS |
| Allowed graph only | PASS |
| CLI only in facade | PASS |
| Native/web describe rather than mutate | PASS |
| Declared exports and packed evidence | PASS |

## Workspace Structure

```text
packages/
├── assetloom-core/      # results, JSON safety, hashing, neutral artifact contracts
├── assetloom-images/    # image recipes, inspection, renderer compatibility
├── assetloom-native/    # native roles/presets/descriptors/planner helpers
├── assetloom-web/       # web presets/public paths/hash policies/descriptors
└── assetloom/           # CLI, facade, compatibility orchestration
```

## Extraction Sequence

1. Scaffold manifests, TypeScript configs, public roots, and topological root scripts.
2. Move/copy proven neutral contracts to core and make facade result/hash modules re-export core.
3. Add concrete image inspection and recipe API in images.
4. Move typed descriptor ownership and focused helper APIs to native/web; consume them from facade types.
5. Add graph/import/export architecture tests and clean-consumer five-tarball smoke.
6. Run install, all-package build/type/lint/test, existing regression, and pack checks.

Compatibility orchestration remains in the facade only where moving it would couple package extraction to unrelated behavioral changes. New public ownership is focused and facade imports use package exports.
