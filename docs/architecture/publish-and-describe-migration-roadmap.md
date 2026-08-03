# Publish-and-describe architecture migration roadmap

This roadmap decomposes ADR 0006 into dependency-ordered Spec Kit features. Each directory is durable
resumable state and must complete specify, clarify, plan, checklist, tasks, analyze, implement, and
converge before the next dependent feature is implemented.

## 1. Publish-and-describe foundation

Directory: `specs/001-publish-describe-foundation`

Establish resource-neutral artifact plans, bounded whole-file publication, ownership/recovery rules,
`GenerationResultV1`, deterministic complete-catalog semantics, diagnostics, and a JSON-safe usage
envelope. This is first because every later package and migration consumes its contracts.

## 2. Remove consumer mutation

Directory: `specs/002-remove-consumer-mutation`

Inventory and remove native/web project integration operations, adapters, receipts, project-file
gateways, Git exclude mutation, related configuration, and callable exports. Replace useful outcomes
with complete owned artifacts and typed usage descriptors. This depends on feature 1 so removed
mutations have a stable descriptive replacement.

## 3. Extract workspace packages

Directory: `specs/003-extract-workspace-packages`

Extract core, images, native, web, and CLI/facade packages using the ADR dependency graph; declare all
public exports and add architecture enforcement. Extraction follows mutation removal so forbidden
ports are not carried into new public packages.

## 4. Web output hashing and descriptors

Directory: `specs/004-web-hashing-descriptors`

Separate render fingerprints from public final-byte SHA-256 identity, implement `none`, `filename`,
and `query` policies with safe token bounds, return typed web usage descriptors, and safely retire
manifest-owned hash predecessors. This depends on the result and package contracts.

## 5. CLI, compatibility, documentation, and package verification

Directory: `specs/005-cli-docs-package-verification`

Complete facade compatibility decisions, human and JSON CLI presentation, `--result-file`, root and
package documentation, migration examples, packed-package/export checks, and clean-consumer smoke
tests. This final feature integrates the preceding public surfaces and proves their distributable
composition.

## Cross-feature gates

Every feature must preserve green relevant checks after bounded implementation phases. Analysis must
have no unresolved critical or high contradiction before implementation. Convergence runs after
implementation; appended tasks are implemented and convergence repeats until clean. The final
feature additionally runs the full repository verification matrix and a forbidden-capability search.
