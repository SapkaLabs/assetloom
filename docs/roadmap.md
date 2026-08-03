# Original delivery roadmap

This roadmap records the original implementation sequence. The current
publish-and-describe migration is tracked separately in
[its architecture roadmap](architecture/publish-and-describe-migration-roadmap.md).
Where the original wording implied application mutation, the current boundary
below supersedes it.

## Phase 0 — native-platform research and architecture

Official Android and Apple research, architecture, ADRs, task graph, and
repository-local implementation state.

## Phase 1 — workspace and package skeleton

Yarn workspace, publishable ESM package, Commander CLI, bare React Native demo,
build, lint, typecheck, tests, and packed-package smoke test.

## Phase 2 — configuration system

Ordered multiple-file merging, null deletion, array replacement, provenance,
JSON Schema, and native target validation.

## Phase 3 — error and storage foundations

`LoomError`, stable `LOOM_` codes, content cache, ownership manifest, project
lock, atomic writes, safe cleanup, and caller-owned repository ignore policy.

## Phase 4 — Android resources

Legacy, round, adaptive, monochrome, notification, day/night splash, typed
caller setup descriptors, and Gradle/AAPT2 compilation of complete outputs.

## Phase 5 — iOS resources

Opaque `.icon` passthrough, light/dark/tinted catalog mode, day/night launch
resources, typed caller setup descriptors, and Xcode/actool compilation of
complete outputs.

## Phase 6 — bare React Native demo

Base and brand configuration, generated runtime override example, both native
projects, caller-configured ignored outputs, and second-run no-op proof.

## Phase 7 — hardening

Security review, performance benchmarks, cross-platform CI, determinism,
package validation, documentation, and release-readiness evidence.
