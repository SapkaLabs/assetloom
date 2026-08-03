# Feature Specification: CLI, Compatibility, Documentation, and Package Verification

**Feature Branch**: `mvp`
**Created**: 2026-08-02
**Status**: Draft
**Input**: Complete the CLI/facade migration to the versioned publish-and-describe result, add safe result files, document all compatibility and caller-owned integration changes, and verify packed packages from a clean consumer.

## User Scenarios & Testing

### User Story 1 - Consume one generation contract everywhere (Priority: P1)

As an automation or Node caller, I receive the same deterministic `GenerationResultV1` catalog whether I call the authoritative Node API, run JSON generation, or request a result file.

**Why this priority**: A single portable contract is the central migration outcome and eliminates changed-files-only interpretation.

**Independent Test**: Generate one fixture through the Node API and CLI, parse stdout and a result file, and compare all three values after stable serialization.

**Acceptance Scenarios**:

1. **Given** either supported configuration version, **when** `generate --json` succeeds, **then** stdout contains exactly one JSON document whose root is `GenerationResultV1` and stderr contains only optional logs.
2. **Given** `--result-file <relative-path>`, **when** generation succeeds, **then** the file contains the same versioned result schema and deterministic value as the Node API and JSON stdout.
3. **Given** an unchanged second run, **when** JSON generation succeeds, **then** the complete current catalog is returned with every current artifact marked unchanged and zero content writes.
4. **Given** a generation failure in JSON mode, **when** the CLI exits, **then** stdout is empty and stderr contains a stable `LOOM_` error document.

---

### User Story 2 - Retain useful human workflows without ambiguity (Priority: P1)

As a CLI user, I keep concise human summaries, reports, target filtering, and stable exit codes while generation uses the authoritative publish-and-describe engine.

**Why this priority**: Existing safe workflows must remain usable even though the machine contract changes deliberately.

**Independent Test**: Run human generation, repeated generation, report generation, target selection, errors, help, and version output for supported configuration versions.

**Acceptance Scenarios**:

1. **Given** a successful human generation, **when** output is displayed, **then** it summarizes created/updated, unchanged, and removed owned artifacts and any explicitly requested result/report path.
2. **Given** plan, verify, report, or clean commands, **when** they run, **then** their safe existing behavior and target selection remain available.
3. **Given** invalid CLI usage, **when** the command exits, **then** the exit code remains 2; public runtime failures remain exit code 1; success/help/version remain 0.
4. **Given** JSON mode plus reporting, **when** report information is emitted, **then** it does not contaminate the generation-result JSON on stdout.

---

### User Story 3 - Migrate removed integration behavior confidently (Priority: P1)

As an existing AssetLoom user, I can follow explicit before-and-after Node, CLI, web, Android, iOS, and React Native examples to move from consumer mutation and changed-file summaries to caller-owned usage descriptors and complete results.

**Why this priority**: The breaking removals are unsafe without actionable migration guidance.

**Independent Test**: Follow every documented after-example against public package exports and verify that no example references a removed callable capability or consumer-project write.

**Acceptance Scenarios**:

1. **Given** a legacy Node caller, **when** the guide is followed, **then** it can replace changed-file arrays with the complete versioned artifact, removed, usage, and diagnostics catalogs.
2. **Given** a legacy CLI automation, **when** the guide is followed, **then** it consumes direct result-versioned JSON and can opt into a guarded result file.
3. **Given** web descriptors, **when** the example caller integrates them, **then** caller code updates its own HTML while AssetLoom never locates or modifies that HTML.
4. **Given** native descriptors, **when** the examples are followed, **then** the caller performs Android/iOS/React Native application setup without an AssetLoom project-update operation.
5. **Given** legacy web policy values, **when** configuration is migrated, **then** `stable` becomes `none` and `content-hash` becomes `filename` with `query` documented separately.

---

### User Story 4 - Consume verified packed workspaces (Priority: P1)

As a package consumer, I can install the five packed workspaces into a clean project, import every public root, execute representative APIs, and run the installed CLI in human and JSON modes.

**Why this priority**: Workspace-local success is insufficient if declarations, exports, dependency ranges, package contents, or the executable fail after packing.

**Independent Test**: Pack all five workspaces, install only their tarballs in a fresh fixture, compile/import representative code, generate twice, inspect JSON/result-file outputs, and scan packed runtime/declaration files for forbidden capabilities.

**Acceptance Scenarios**:

1. **Given** packed tarballs, **when** installed without workspace links, **then** all declared public entry points and types resolve.
2. **Given** the installed CLI, **when** human and JSON generation run in the clean fixture, **then** both succeed and JSON validates as result version 1.
3. **Given** repeated installed CLI generation, **when** the second run completes, **then** it returns a complete unchanged catalog and performs no content writes.
4. **Given** packed JavaScript, declarations, manifests, schemas, and documentation, **when** scanned, **then** no forbidden consumer-mutation capability is callable or documented as current behavior.

### Edge Cases

- Result-file paths that are absolute, empty, contain `..`, or escape through a symlink/junction are rejected before the result file is written.
- Result files remain inside AssetLoom's dedicated state root and never become consumer application files or generated artifact ownership entries.
- JSON stdout remains parseable when a report is also requested or a result file is unchanged.
- A result-file write failure is a generation-command failure and preserves the dependency error as its cause.
- Documentation distinguishes historical ADR context from currently callable behavior.
- Packed verification does not execute package lifecycle scripts from untrusted dependencies.

## Requirements

### Functional Requirements

- **FR-001**: The CLI `generate --json` root value MUST be the same `GenerationResultV1` public contract returned by `generateVersioned`, without a success envelope or changed-files-only projection.
- **FR-002**: CLI JSON stdout MUST contain only the generation JSON document; informational/report logs MUST use stderr.
- **FR-003**: JSON generation failures MUST leave stdout empty and emit a stable `LOOM_` error document on stderr.
- **FR-004**: `generate` MUST support `--result-file <relative-path>` and write the same stable serialized result schema.
- **FR-005**: Result files MUST be bounded beneath AssetLoom's dedicated state root, reject absolute/traversal/link escapes, and use guarded atomic write-if-changed behavior.
- **FR-006**: A result-file failure MUST fail the command rather than report generation as wholly successful and MUST preserve its cause.
- **FR-007**: Schema-version-1 and schema-version-2 generation commands MUST use the authoritative versioned generation engine while retaining compatible generated bytes, target filtering, reporting, and human workflows.
- **FR-008**: Human generation output MUST summarize created/updated, unchanged, and removed artifacts using the complete result.
- **FR-009**: Plan, verify, report, and clean behavior MUST remain compatible where it does not conflict with the constitution.
- **FR-010**: Exit codes MUST remain 0 for success/help/version, 1 for public runtime failures, and 2 for usage failures.
- **FR-011**: An unchanged repeated CLI run MUST perform zero content writes and return the complete current artifact catalog as unchanged.
- **FR-012**: The facade MUST continue to export the authoritative result types, validator, stable serializer, loader, runtime composition, and generation API through declared package exports.
- **FR-013**: Valid legacy Node APIs that do not mutate consumer projects MAY remain as documented compatibility surfaces, but MUST NOT be presented as the authoritative portable result API.
- **FR-014**: A migration guide MUST include before/after Node API and CLI examples, web caller-owned HTML integration, native caller-owned setup, removed configuration/API inventory, and web policy renames.
- **FR-015**: Root and individual package documentation MUST describe responsibilities, dependency graph, result contract, ownership/write rules, hashing/cache policies, consumer responsibilities, and compatibility status at the appropriate package scope.
- **FR-016**: All five packages MUST pack, install without workspace links, expose valid JavaScript/declaration exports, and execute representative public APIs in a clean fixture.
- **FR-017**: Packed verification MUST run the installed CLI in human, JSON, result-file, and unchanged-repeat modes against a clean consumer configuration.
- **FR-018**: Packed runtime files, declarations, manifests, schema, and current documentation MUST contain no callable or recommended forbidden consumer-project mutation capability.
- **FR-019**: Full repository install, format if configured, lint, type-check, unit/integration tests, build, package/export validation, pack, clean-consumer smoke, human/JSON CLI smoke, idempotency, forbidden search, final Spec Kit analysis, and convergence MUST be recorded.
- **FR-020**: Failed or skipped checks and pre-existing environmental warnings MUST be distinguished from regressions.

### Key Entities

- **CLI Generation Result**: Direct result-version-1 JSON on stdout and in guarded result files.
- **Result File**: Optional deterministic state-root copy of the generation result, never a consumer application artifact.
- **Compatibility Surface**: A safe retained API/command whose status and replacement guidance are explicit.
- **Migration Guide**: Normative current-behavior transition examples and removed-capability inventory.
- **Packed Consumer Fixture**: Temporary project installed only from the five produced tarballs.
- **Verification Record**: Exact command, outcome, skip/failure reason, and known pre-existing warning.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Node API, CLI stdout, and result-file values compare equal after stable serialization for 100% of supported generation fixtures.
- **SC-002**: JSON-mode success tests observe one parseable result document on stdout and zero non-JSON stdout bytes; failure tests observe zero stdout bytes and a stable error on stderr.
- **SC-003**: Result-file boundary tests reject 100% of absolute, traversal, and link-escape attempts and write 0 files outside `.assetloom`.
- **SC-004**: Repeated-generation tests report 100% of current artifacts as unchanged with zero content writes.
- **SC-005**: Every current migration example imports or invokes only declared public exports and requires 0 AssetLoom writes to consumer application files.
- **SC-006**: All five tarballs install in a clean fixture; representative imports, types, human CLI, JSON CLI, result file, and repeated generation pass with no workspace resolution.
- **SC-007**: Final current-source and packed-content searches find 0 forbidden callable mutation capabilities.
- **SC-008**: Every repository-standard check passes, or an environmental/pre-existing exception is recorded with exact evidence and not misreported as a regression.

## Assumptions

- `--result-file` paths are relative to `.assetloom/results`; this keeps the explicit write within the constitutionally allowed dedicated state root.
- The result file uses the same canonical stable serialization as the public result serializer and includes a trailing newline.
- Generation JSON changes deliberately from the legacy `{ ok, result: { written, unchanged, removed } }` projection to direct `GenerationResultV1`; non-generation JSON commands may retain their existing envelopes.
- Human-readable output remains concise and is not part of the portable deterministic contract.
- Safe legacy functions may remain exported for source compatibility but are documented as legacy; removed consumer-mutation APIs do not return.
- No packages are published, no remote resource is changed, and clean smoke fixtures are temporary local directories.
