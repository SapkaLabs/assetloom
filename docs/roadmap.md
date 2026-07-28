# Roadmap

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

`LoomError`, stable `LOOM_` codes, content cache, manifest, project lock, atomic
writes, safe cleanup, and local Git ignore management.

## Phase 4 — Android resources

Legacy, round, adaptive, monochrome, notification, day/night splash, manifest
integration, and Gradle/AAPT2 compilation.

## Phase 5 — iOS resources

Opaque `.icon` passthrough, light/dark/tinted catalog mode, day/night launch
resources, Xcode integration, and Xcode/actool compilation.

## Phase 6 — bare React Native demo

Base and brand configuration, generated runtime override example, both native
projects, ignored generated files, and second-run no-op proof.

## Phase 7 — hardening

Security review, performance benchmarks, cross-platform CI, determinism,
package validation, documentation, and release-readiness evidence.
