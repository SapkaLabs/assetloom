# Quickstart: Validate the Publish-and-Describe Foundation

## Prerequisites

- Node.js >=22.12
- Corepack/Yarn 4.9.2
- Dependencies installed with `yarn install --immutable`

## Baseline recorded before refactoring

Recorded on 2026-08-02 from branch `mvp` before application-source changes:

| Command | Result |
|---------|--------|
| `yarn install --immutable` | Pass; existing peer-dependency warning only |
| `yarn build` | Pass |
| `yarn lint` | Pass |
| `yarn typecheck` | Pass |
| `yarn test` | Pass: 17 files, 103 tests passed, 2 skipped |
| `yarn pack:smoke` | Pass: clean install/consume fixture |
| `node packages/assetloom/lib/cli.js --help` | Pass |
| `node packages/assetloom/lib/cli.js plan --help` | Pass |

## Focused validation

```sh
yarn workspace @sapkalabs/assetloom test --run tests/generation-result.test.ts tests/write-boundaries.test.ts tests/generation-recovery.test.ts tests/architecture-foundation.test.ts
yarn workspace @sapkalabs/assetloom typecheck
yarn workspace @sapkalabs/assetloom lint
```

Expected outcomes:

- first publication reports created artifacts with final-byte SHA-256;
- an identical second run reports the complete catalog as unchanged and performs zero writes;
- stale manifest-owned files appear in `removed`;
- traversal, link escapes, duplicate/case collisions, and unowned collisions fail before publication;
- sentinel consumer files and repository metadata are byte-identical;
- injected interruption leaves recovery state and an identical retry converges;
- result JSON is deterministic and usage references resolve.

## Repository regression validation

```sh
yarn build
yarn lint
yarn typecheck
yarn test
yarn pack:smoke
```

See [the public contract](contracts/generation-result-v1.md) and [data model](data-model.md) for the
expected portable result shape.
