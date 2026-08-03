# Research: Workspace Package Extraction

## Decisions

- Use the existing `packages/*` Yarn glob and lockstep `0.2.0` versions.
- Build in dependency order using explicit root scripts; avoid introducing release tooling.
- Make `@sapkalabs/assetloom-core` the authoritative home of `GenerationResultV1`, JSON validation/stable serialization, and SHA-256 helpers; facade compatibility modules re-export it.
- Give images an actual Sharp-backed `inspectImage` API plus resource-neutral recipe contracts.
- Give native/web ownership of their typed usage contracts and focused deterministic builders/presets; facade re-exports these package roots.
- Enforce manifests and static imports with a repository test instead of adding a new build-system dependency.
- Pack all packages and install tarballs together so workspace protocol resolution cannot mask undeclared dependencies.

Rejected: a `common` package; facade re-exports from private source paths; native/web CLI subcommands; a clean-room rewrite of all orchestration in one step.
