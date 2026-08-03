# Quickstart: Validate CLI, Documentation, and Packed Packages

## Focused checks

```powershell
yarn vitest run packages/assetloom/tests/cli-v2.test.ts packages/assetloom/tests/cli-result-file.test.ts packages/assetloom/tests/generation-result.test.ts packages/assetloom/tests/package-architecture.test.ts
yarn build
yarn lint
yarn typecheck
```

Expected outcomes: direct result-version-1 JSON, empty stdout on failures,
guarded canonical result files, compatible human/other command behavior, and
complete unchanged repeated catalogs.

## Packed-consumer checks

```powershell
yarn pack:smoke
```

Expected outcomes: five tarballs install without workspace links; public root
types compile and runtime imports execute; the installed CLI runs help, human
generation, JSON generation, result-file output, and unchanged repeat; packed
mutation search is empty.

## Full repository checks

```powershell
yarn install --immutable
yarn build
yarn lint
yarn typecheck
yarn test
yarn pack:smoke
specify version
specify integration status --json
```

Run exact current-source and packed-content forbidden-capability searches, then
final `$speckit-analyze` and `$speckit-converge`. Historical ADR discussion may
name rejected behavior; current source, schemas, exports, READMEs, and
operational guides must not expose it as callable.

Record exact pass counts, the pre-existing Yarn peer warning if it remains, any
platform-only skip, and final `git status --short`. Do not publish, commit,
push, or modify remote resources.
