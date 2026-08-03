# Verification Record: CLI, Compatibility, Documentation, and Package Verification

**Date**: 2026-08-02
**Status**: Complete and converged

## Pre-change baseline

| Check | Command | Outcome |
|---|---|---|
| Dependency integrity | `yarn install --immutable` | PASS with pre-existing `YN0086` peer-dependency warning. |
| Build | `yarn build` | PASS for core, images, native, web, and facade. |
| Lint | `yarn lint` | PASS. |
| Type-check | `yarn typecheck` | PASS, including demo. |
| Tests | `yarn test` | PASS: 24 files, 112 passed, 1 skipped, 113 total. |
| Packed consumer | `yarn pack:smoke` | PASS for five tarballs. |
| Human CLI plan | `node ../../packages/assetloom/lib/cli.js plan -c assetloom.json` from `fixtures/android-native` | PASS. |
| JSON CLI plan | `node ../../packages/assetloom/lib/cli.js --json plan -c assetloom.json` from `fixtures/android-native` | PASS with one parseable `{ ok, plan }` document. |

The first CLI smoke invocation ran from the repository root and correctly failed
`LOOM_SRC_NOT_FOUND` because configuration source paths are resolved from the
configured project root/CWD contract. Rerunning from the fixture root passed;
this was an invocation correction, not a repository baseline failure.

## Baseline surface inventory

- CLI generation still calls legacy `generate`/`generateV2` and projects
  `written`, `unchanged`, and `removed` inside `{ ok, result }`.
- `generateVersioned`, result types, validator, and stable serializer are
  already exported through the facade.
- The five-package pack smoke installs/imports all tarballs and scans runtime
  code, but does not yet compile types or run installed generation.
- Current operational documentation still contains stale Git-ignore and
  project-integration wording that must be corrected; historical ADR language
  remains historical evidence rather than a callable surface.

## Post-change verification

| Check | Command | Outcome |
|---|---|---|
| Dependency integrity | `yarn install --immutable` | PASS with the same `YN0086` peer-dependency warning; no lockfile change was required. |
| Build | `yarn build` | PASS for all five publishable workspaces. |
| Formatting | n/a | SKIPPED: no repository formatting script or formatter configuration is declared. `git diff --check` passed. |
| Lint | `yarn lint` | PASS. |
| Type-check | `yarn typecheck` | PASS for all packages and the demo. |
| Full tests | `yarn test` | PASS: 25 files; 126 passed, 1 skipped, 127 total. |
| Link-boundary detail | `yarn vitest run packages/assetloom/tests/state-path-security.test.ts packages/assetloom/tests/write-boundaries.test.ts --reporter=verbose` | PASS: 16 passed, 1 skipped. The skipped same-root file-link case reports `EPERM` because Windows did not permit creating that file link; directory-link boundary cases passed. |
| Focused CLI/result | `yarn vitest run packages/assetloom/tests/cli-v2.test.ts packages/assetloom/tests/cli-result-file.test.ts packages/assetloom/tests/generation-result.test.ts` | PASS: 3 files, 24 tests. |
| Package architecture | `yarn vitest run packages/assetloom/tests/package-architecture.test.ts` | PASS: 4 tests. |
| Packed clean consumer | `yarn pack:smoke` | PASS for core, images, native, web, and facade tarballs. |

`yarn pack:smoke` verifies the exact installed dependency graph, lockstep
versions, root exports and declarations, absence of packed `workspace:`
protocols, and executable ownership. It installs only the five tarballs into a
temporary fixture, compiles a strict TypeScript consumer against every public
root with `skipLibCheck: false`, executes representative ESM imports, scans
packed JavaScript/declarations/schema/READMEs, and runs the installed facade
CLI through help, human generation, direct JSON generation, atomic
`--result-file`, and unchanged repeat generation. The repeat returned the
complete artifact catalog as `unchanged`, preserved the output modification
time, and the result-file bytes equalled JSON stdout.

The expanded clean-consumer check initially exposed optional web descriptor
fields that conflicted with a declaration index signature. Converting focused
descriptor payload interfaces to structurally JSON-safe type aliases fixed the
downstream declaration error; the final build, type-check, tests, lint, and
pack smoke all pass without weakening `skipLibCheck`.

## Exact forbidden-capability audit

The final exact runtime search covered all five package `src` trees, the public
schema, and all five package manifests for:

```text
integrate-project|update-project|ProjectIntegration|IntegrationReceipt|
ProjectFileGateway|GitIgnoreManager|HtmlHeadAdapter|
StaticWebAppConfigAdapter|WebManifestAdapter|PatchFile|MergeFile|AppendHtml|
UpdateManifest|UpdatePlist|RegisterXcodeResource|IntegrateProjectArtifact
```

Outcome: zero matches. The schema contains zero `manifestPath`, `projectFile`,
`document`, `staticWebApp`, `stable`, or `content-hash` option values. Runtime
sources contain zero `.git/info/exclude` references. The same capability search
over current README and operational documentation, excluding historical ADRs,
research, and the deliberate migration guide, returned zero matches. Packed
content is independently scanned by `yarn pack:smoke` and passed.

`git diff --check` passed. Its only output was Git's existing Windows
LF-to-CRLF advisory for working-tree files; no whitespace errors were found.

## CLI and compatibility outcome

- Both schema versions route generation through `generateVersioned`.
- `assetloom --json generate` emits the canonical `GenerationResultV1`
  directly. JSON failures leave stdout empty and retain stable `LOOM_` error
  documents on stderr.
- `--result-file` is relative to `.assetloom/results`, rejects absolute,
  empty, traversing, NUL-bearing, and link-escaped paths, uses guarded atomic
  write-if-changed behavior, and matches stdout byte-for-byte.
- Human generation derives changed/unchanged/removed counts from the versioned
  catalog. Report and result notices do not contaminate JSON stdout.
- Help/version return 0, runtime failures return 1, and usage failures return
  2. Plan, verify, report, clean, and target filtering remain supported.
- Safe legacy Node projections remain callable but are not the portable
  result authority. Former project mutation cannot be restored through them.

## Spec Kit and repository state before final convergence

- `specify version`: 0.15.1 on Windows/PowerShell.
- `specify integration status --json`: `status: ok`, default/installed
  integration `codex`, zero missing/modified/invalid managed files, no
  findings.
- Branch: `mvp`.
- Working tree: expected migration changes only; 71 modified, 11 deleted, and
  28 untracked entries (110 `git status --short` entries). No commit, push,
  publication, PR, reset, or remote mutation was performed.

## Final Spec Kit gates

`$speckit-analyze` found zero inconsistencies at every severity: 20 functional
requirements plus 8 buildable success criteria map to the 31 tasks (100%
coverage), with zero constitution conflicts, ambiguities, duplications,
placeholders, or unmapped tasks.

`$speckit-converge` checked those requirements, 17 acceptance scenarios, all
plan/structure decisions, and all seven constitutional principles against the
implementation. It found zero `missing`, `partial`, `contradicts`, or
`unrequested` gaps and appended no tasks. Before final bookkeeping, the
pre/post `tasks.md` SHA-256 was identically
`0C39A5F24ED6DA4E404A8D4A3C87531E8C5024A4B8695228647DC07247C9E17C`.
After T031 was checked, final analysis remained clean and a second convergence
pass left the fully closed file unchanged at
`27FA3FE842105A49CC1A6D939FE54309E737380211E74AD9590835C4053308A3`.

All five dependency-ordered feature directories are implemented and report
converged:

1. `001-publish-describe-foundation` — 35 tasks complete (including its
   implemented convergence tasks).
2. `002-remove-consumer-mutation` — 49 tasks complete; recorded clean
   convergence with no appended tasks.
3. `003-extract-workspace-packages` — 17 tasks complete; recorded clean
   convergence with no appended tasks.
4. `004-web-hashing-descriptors` — 24 tasks complete; clean convergence left
   `tasks.md` byte-for-byte unchanged.
5. `005-cli-docs-package-verification` — 31 tasks complete; clean convergence
   left `tasks.md` byte-for-byte unchanged.

## Remaining environmental risks

- The Windows environment refused creation of one same-root file symlink with
  `EPERM`, so that single test skipped. Directory symlink/junction escape tests
  and the result-file link-escape cases passed. The skipped case remains a
  platform/privilege verification item, not a product regression.
- Yarn retains the pre-existing `YN0086` peer-dependency warning. Dependency
  resolution, build, tests, and tarball installation are otherwise green.
- macOS/Xcode and Android Gradle platform builds were not rerun in this Windows
  migration session. Their recorded fixture evidence remains in
  `docs/release-readiness.md`; hosted platform CI is still required before an
  npm release.
- No packages were published and no remote checks were triggered. Release-time
  registry metadata and hosted CI therefore remain deliberate follow-up gates.
