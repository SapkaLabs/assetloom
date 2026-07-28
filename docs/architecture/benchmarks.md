# Performance baseline

Date: 2026-07-28.

Environment:

- Windows 11 Pro 10.0.26200, x64
- Intel Core i9-14900K, 24 cores / 32 logical processors
- Node.js 26.3.0
- Sharp 0.35.3

The bundled benchmark creates a temporary Android project, plans 24 app-icon
and integration tasks, renders a cold run, then repeats with unchanged inputs
and a warm content cache.

```text
cold generation: 221.14 ms, 24 changed files
warm generation:  19.18 ms,  0 changed files
```

Run the same workload with:

```sh
yarn benchmark
```

This is a development-machine baseline, not a product service-level objective.
Release records should retain the JSON output for each supported CI operating
system and investigate material regressions in both cold and warm paths.
