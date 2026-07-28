# Workstream ownership

The implementation workstreams are:

- Orchestrator — phase sequencing, contracts, repository-local state.
- Platform Research Agent — official Android and Apple sources.
- Configuration Agent — merging, provenance, schema, path validation.
- Core and Planner Agent — domain types, task graph, collision detection.
- Rendering Agent — safe decoding and deterministic raster output.
- Android Agent — resource presets, manifest integration, Gradle verification.
- iOS Agent — catalogs, Icon Composer passthrough, Xcode verification.
- Storage Agent — cache, manifest, locking, atomic writes, cleanup, ignores.
- CLI Agent — commands, target filters, human and JSON diagnostics.
- Demo Application Agent — bare React Native native projects and artwork.
- Quality Agent — tests, CI, determinism, package validation.

Each workstream owns its matching directory, but public contract changes require
an architecture decision record.
