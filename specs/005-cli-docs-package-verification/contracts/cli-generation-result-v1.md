# CLI Generation Result Contract V1

## Command

```text
assetloom [--json] generate -c <file>... [--target <id>]
  [--report] [--report-output <file>]
  [--result-file <relative-state-path>]
```

`--result-file` is relative to `.assetloom/results` and cannot be absolute,
empty, traversing, or link-escaped.

## JSON success

stdout contains one canonical JSON document with this root:

```ts
interface GenerationResultV1 {
  readonly resultVersion: 1;
  readonly targets: readonly string[];
  readonly artifacts: readonly PublishedArtifactV1[];
  readonly removed: readonly RemovedArtifactV1[];
  readonly usage: readonly UsageDescriptorV1[];
  readonly diagnostics: readonly DiagnosticV1[];
}
```

There is no `ok` or `result` success envelope. The result file, when requested,
contains byte-for-byte the canonical stable serialization of the same value.

## JSON failure

stdout is empty. stderr retains the existing error envelope:

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

Verbose mode may add a stack to stderr only.

## Human success

The message reports created plus updated, unchanged, and removed artifact
counts, plus optional result-file and report paths. Wording is not a versioned
machine contract.

## Compatibility

- Plan, verify, report, and clean JSON shapes are unchanged.
- CLI generation JSON is a deliberate breaking change from the old success
  envelope and changed-file arrays.
- `generateVersioned` is authoritative for Node callers. Safe legacy facade
  functions remain callable but do not define this CLI result contract.
