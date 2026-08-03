# Research: Remove Consumer-Project Mutation

## Runtime inventory and disposition

The pre-change inventory included catalog `integrate-project` artifacts, native
`update-project` tasks, HTML-head/web-manifest/static-host adapters, an adapter
registry and lifecycle, a generic project-file gateway, receipt storage,
retained-publication checks tied to receipts, Android manifest and Xcode
serializers, and automatic Git exclude management. Generate, clean, verify,
report, default composition, schemas, exports, tests, demos, and current docs
referenced that surface.

All executable ports, adapters, registrations, receipt readers/writers,
gateways, serializers, and Git metadata writers are deleted. Complete web
manifests now use ordinary output ownership; native and web caller actions use
typed descriptors. Legacy receipt state is inert and former configuration
destinations fail with `LOOM_CFG_MIGRATION`.

## Decision: Attach usage descriptors to declarative plans

Complete-file plan records may carry versioned JSON-safe usage descriptors. Execution aggregates and
de-duplicates descriptors, then the result builder validates artifact references.

**Rationale**: Handlers know semantic intent but still have no write capability. The core result
remains resource-neutral.

**Alternatives considered**: Post-process destinations heuristically (loses semantic roles); callbacks
(forbidden escape hatch); a separate integration phase (recreates the removed boundary).

## Decision: Publish web manifests as whole owned artifacts

When branding requests a manifest, the handler serializes the complete configured manifest as a
deterministic text artifact. Existing unowned destinations always collide.

**Rationale**: A manifest can be a generated resource when AssetLoom owns the whole file; field merge
ownership is unsafe.

**Alternatives considered**: Continue managed-field receipts (forbidden partial ownership); return
manifest JSON only as descriptor (unnecessarily discards a useful complete generated file).

## Decision: Describe HTML, SEO, and static-host setup without destinations

Web descriptors contain caller-ready element or route data but no path to an HTML/static configuration
file. The caller chooses where and how to apply it.

**Rationale**: A destination would imply AssetLoom discovery or mutation authority.

## Decision: Remove native project path fields rather than ignore them

`manifestPath` and `projectFile` are removed from schema/type contracts. `resourceDirectory`,
`projectDirectory`, and `assetCatalogDirectory` remain output roots. Unknown obsolete fields fail
schema validation with stable provenance.

**Rationale**: Silently ignored mutation options hide a breaking migration and can mislead callers.

## Decision: Remove update tasks and return setup descriptors

Android/iOS planners keep complete resource files and bundle metadata but no longer plan manifest or
pbx updates. Descriptors state resource/catalog names and manual application setup.

**Rationale**: Resource layout is AssetLoom's concern; application registration is the caller's.

## Decision: Ignore obsolete receipts at runtime

No runtime operation loads or migrates integration receipts. Migration documentation tells users they
may archive/remove the obsolete state file after confirming no old AssetLoom version is running.

**Rationale**: Reading receipts would retain semantic knowledge and tempt cleanup mutation.

## Decision: Remove consumer-file verification and reporting

Runtime verification/reporting cover sources, planned complete outputs, manifest ownership, hashes,
dimensions, and descriptors only. Native fixture compilation remains an external repository test.

**Rationale**: Runtime semantic inspection of consumer files is forbidden even when read-only.
