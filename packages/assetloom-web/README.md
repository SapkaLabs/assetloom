# `@sapkalabs/assetloom-web`

Web image presets, public-path and cache-policy contracts, token validation,
and typed HTML/head/static-host usage descriptors. Descriptors are caller data;
this package does not inspect or edit HTML, framework source, web manifests, or
host configuration.

It depends on `@sapkalabs/assetloom-core` and
`@sapkalabs/assetloom-images`. The public root exports web presets, typed
descriptor payloads, cache-policy constants, token validation, public-path
resolution, and query helpers. It contains no CLI commands; default composition
belongs to `@sapkalabs/assetloom`.

## Cache-busting policies

`web-app-branding` accepts an optional `naming` policy:

```json
{ "naming": { "strategy": "filename", "hashLength": 12 } }
```

- `none` keeps the configured filename and public path. It is the default when
  `naming` is omitted.
- `filename` publishes `logo.<token>.png`. This is recommended for immutable
  browser caching.
- `query` publishes `logo.png` and returns `logo.png?v=<token>` as its public
  path.

`hashLength` defaults to 12 for hashed policies and must be an integer from 8
through 64. The exact token is a prefix of the full SHA-256 digest of final
encoded output bytes. The generation result always includes the full digest,
including under `none`. A destination path or source-only hash is never used as
browser content identity.

The public helpers expose the same bounds and token behavior:

```js
import {
  appendWebCacheBustQuery,
  webContentHashToken,
} from '@sapkalabs/assetloom-web';

const token = webContentHashToken(fullSha256, 12);
const href = appendWebCacheBustQuery('/assets/logo.png', token);
```

## Caller-owned integration

Typed `web.html-link`, `web.head-metadata`, and `web.static-host-cache`
descriptors reference artifact IDs in the current `GenerationResultV1` catalog.
Their paths already reflect the selected cache policy. The caller decides how
to turn this data into HTML or framework configuration.

When final bytes change under `filename`, AssetLoom publishes and records the
new complete file, then removes the obsolete predecessor only if its ownership
manifest recorded that exact path. Similarly named unowned files are retained.

Legacy `stable` and `content-hash` strategy values were renamed to `none` and
`filename`; invalid legacy values receive a `LOOM_CFG_MIGRATION` diagnostic.
