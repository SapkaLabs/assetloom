# `@sapkalabs/assetloom`

Assetloom generates deterministic Android and iOS application resources from
SVG, PNG, or WebP source artwork. It is designed for native projects and bare
React Native projects.

## CLI

Pass configuration files in merge order; later values override earlier values.
`null` deletes a value, objects merge recursively, and arrays replace earlier
arrays.

```sh
assetloom plan -c config/base.assetloom.json -c config/brand.assetloom.json
assetloom generate -c config/base.assetloom.json -c config/brand.assetloom.json
assetloom verify -c config/base.assetloom.json -c config/brand.assetloom.json
assetloom clean -c config/base.assetloom.json -c config/brand.assetloom.json
```

Filter generation or verification with `--target android` or `--target ios`.
Use `--json` for machine-readable output and `--verbose` to include diagnostic
stacks for failures.

Generation owns only paths recorded in `.assetloom/manifest.json`. Unchanged
content is not rewritten, and cleanup refuses to remove an owned path whose
content was changed outside Assetloom.

The JSON Schema is exported as `@sapkalabs/assetloom/schema`.

Workspace documentation:

- [`docs/configuration.md`](../../docs/configuration.md)
- [`docs/error-codes.md`](../../docs/error-codes.md)
- [`docs/architecture/architecture.md`](../../docs/architecture/architecture.md)
