# Data Model: CLI, Compatibility, Documentation, and Package Verification

## CliGenerationResultV1

The CLI generation success root is exactly `GenerationResultV1`:

- `resultVersion: 1`
- deterministic selected `targets`
- complete current `artifacts` catalog
- stale owned `removed` entries
- typed versioned `usage` descriptors
- stable `diagnostics`

No `ok`, `result`, `written`, or machine-specific path wrapper is added. Artifact `disposition` supplies created/updated/unchanged status.

## ResultFileRequest

| Field | Type | Rules |
|---|---|---|
| `configuredPath` | string | Non-empty relative normalized path; no NUL, absolute form, or `..` segment. |
| `stateRoot` | absolute internal path | Always `<project>/.assetloom`. |
| `resultRoot` | absolute internal path | Always `<stateRoot>/results`. |
| `destination` | guarded absolute internal path | Resolved beneath `resultRoot`; link/junction escape rejected. |
| `content` | bytes | Canonical stable result JSON including trailing newline. |
| `disposition` | `written \| unchanged` | Atomic writer comparison outcome; human display only. |

The result file is not added to artifact ownership or `GenerationResultV1`.

State transition:

1. Artifact generation succeeds and produces a validated result.
2. Validate the configured result path syntactically.
3. Resolve beneath `.assetloom/results` and guard the full path.
4. Atomically write only when bytes differ.
5. If validation or writing fails, return a stable command failure and do not print success JSON.
6. On success, print direct result JSON or the human summary.

## CliStreams

### JSON success

- stdout: exactly canonical result JSON.
- stderr: optional information for explicitly requested report/result side outputs; otherwise empty.
- exit: 0.

### JSON failure

- stdout: empty.
- stderr: one JSON error document with `ok: false` and stable `LOOM_` code.
- exit: 1 or 2 according to runtime versus usage failure.

### Human success

- stdout: disposition counts and optional report/result path.
- stderr: empty unless an informational/warning condition requires it.

## CompatibilitySurface

| Surface | Status | Guidance |
|---|---|---|
| `generateVersioned` / `GenerationResultV1` | authoritative | Use for portable publish-and-describe automation. |
| `generate` | retained legacy | Safe schema-v1 compatibility; changed-list result is not the portable catalog. |
| `generateV2` | retained legacy | Safe compatibility; prefer versioned result. |
| plan/verify/report/clean | retained | Continue to use; no consumer mutation. |
| project integration/update adapters | removed | Replace with usage descriptors and caller-owned setup. |

## PackedConsumerFixture

- Five local tarball paths.
- Clean npm manifest and installed dependency graph with no workspace links.
- TypeScript public-import probe.
- Text source, directory target, and schema-version-2 configuration.
- Installed CLI executable.
- Captured human stdout/stderr, direct JSON result, result-file JSON, and repeated-run result.
- Packed capability-search evidence across JavaScript, declarations, manifests, schema, and current README files.
