# AssetLoom CLI

Pass configuration files in merge order with repeated `-c` options. All
commands accept an optional target ID. Global `--json` selects machine output
and `--verbose` adds diagnostic stacks to JSON failures.

```sh
assetloom plan -c assetloom.json [--target <id>]
assetloom generate -c assetloom.json [--target <id>] [--report]
  [--report-output <file>] [--result-file <file>]
assetloom verify -c assetloom.json [--target <id>] [--native]
assetloom clean -c assetloom.json [--target <id>]
assetloom report -c assetloom.json [--target <id>] [-o <file>]
```

Schema version 1 accepts the native target IDs `android` and `ios`. Schema
version 2 accepts any target ID declared in `targets`. Both versions use the
same versioned generation engine and produce the same generation-result
contract. Plan, verify, report, and clean retain their existing command-specific
human and JSON projections.

## Generation output

Human output summarizes changed (`created` plus `updated`), unchanged, and
removed artifacts. It also reports a requested report or result-file path:

```text
Generated 3 changed artifact(s); 12 unchanged; 1 stale owned artifact(s) removed.
Result: .assetloom/results/ci/assets.json (written).
```

`assetloom --json generate` writes exactly one `GenerationResultV1` document
to stdout. It is the same public contract returned by the Node
`generateVersioned` API: the complete current artifact catalog, removed
manifest-owned outputs, typed usage descriptors, and diagnostics. There is no
`ok`/`result` success envelope for generation.

```sh
assetloom --json generate -c assetloom.json > generation-result.json
```

For an atomic state-owned copy, use:

```sh
assetloom --json generate -c assetloom.json \
  --result-file ci/generation-result.json
```

This writes `.assetloom/results/ci/generation-result.json`. The argument must
be a normalized relative path; absolute paths, empty segments, `.`, `..`, NUL,
and symlink/junction escapes fail closed. An unchanged result file is not
rewritten. Its bytes are identical to JSON stdout.

Generation JSON stdout is reserved for the result document. Report notices
and logs go to stderr. On any failure, stdout is empty and JSON stderr uses the
stable error envelope:

```json
{
  "ok": false,
  "error": {
    "name": "LoomError",
    "code": "LOOM_*",
    "message": "...",
    "context": {}
  }
}
```

## Reports and other commands

`--report` writes a self-contained report to the default state path.
`--report-output <file>` selects a project-relative report path and implies
`--report`. The standalone `report` command inspects current AssetLoom-owned
outputs. Neither mode inspects consumer application files.

Generation is idempotent: a second run with identical inputs reports every
current output as `unchanged` and performs zero content writes. `clean` removes
only unchanged files recorded in the ownership manifest. `verify` checks owned
output bytes and resource structure. `--native` additionally invokes available
platform compilers without editing their projects.

## Exit codes

- `0`: success, help, or version output.
- `1`: configuration, planning, generation, publication, verification, or
  ownership failure.
- `2`: invalid CLI usage.

All public failures use stable `LOOM_` codes. Dependency exceptions remain
available as causes where the runtime supports them.
