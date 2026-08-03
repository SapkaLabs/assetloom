# Quickstart: Validate Web Content Hashing and Descriptors

## Prerequisites

- Dependencies installed with the repository's pinned Yarn release.
- Run commands from the repository root.
- Use a temporary fixture whose web public directory is an explicit AssetLoom output root.

## Focused validation

```powershell
yarn vitest run packages/assetloom/tests/catalog-branding.test.ts packages/assetloom/tests/catalog-foundation.test.ts packages/assetloom/tests/render-cache.test.ts packages/assetloom/tests/usage-descriptors.test.ts
```

Expected outcomes:

- Omitted/`none` policy preserves filenames.
- `filename` uses the final-byte token in filenames.
- `query` preserves filenames and emits `?v=<token>` in result paths and descriptors.
- Full digests match identical final bytes across policies.
- Destination/public-URL/unrelated configuration changes do not invoke rendering again.
- Owned obsolete hashed outputs are removed and reported; unowned lookalikes remain.
- Consumer HTML/config sentinels remain byte-for-byte unchanged.

## Contract and workspace validation

```powershell
yarn build
yarn lint
yarn typecheck
yarn test
yarn pack:smoke
```

Expected outcomes: all focused packages build in dependency order, architecture enforcement remains green, the full test suite passes, and clean tarball consumers resolve the web policy and descriptor exports.

## Manual result inspection

Run the CLI JSON generation smoke fixture under each policy and inspect only the version-1 result:

- `artifacts[*].contentHash.value` is always 64 lowercase SHA-256 characters.
- `contentHash.token` exactly matches the filename/query token where selected.
- `usage[*].artifactIds` resolve in `artifacts`.
- No portable identity contains an absolute machine path.
- A repeated unchanged run reports the complete catalog as `unchanged` and performs zero content writes.
