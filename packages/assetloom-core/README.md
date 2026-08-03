# `@sapkalabs/assetloom-core`

Resource-neutral contracts and deterministic publication primitives for
AssetLoom. The public root exports `GenerationResultV1`, portable artifact and
diagnostic types, the JSON-safe versioned usage envelope, validation and stable
serialization, SHA-256 hashing, and bounded output-root path contracts.

Core owns configuration composition, planning/execution orchestration,
content-addressed state, ownership manifests, atomic publication, recovery,
and stable errors as those pieces are extracted. It has no Sharp, Commander,
image, web, native, or platform-project dependency.

```js
import {
  sha256,
  stableGenerationResultJson,
  validateGenerationResultV1,
} from '@sapkalabs/assetloom-core';
```

All artifact paths are normalized root-relative identities. Final artifact
hashes are SHA-256 values over published bytes. Runtime publication is
whole-file only: an unowned collision is rejected, and stale cleanup is
limited to manifest-owned files.

Current applications normally use the composed `@sapkalabs/assetloom` facade.
Core is suitable for custom resource-neutral composition; it provides no CLI
and no escape hatch for consumer-file mutation.
