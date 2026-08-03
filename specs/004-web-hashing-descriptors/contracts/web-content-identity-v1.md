# Web Content Identity Contract V1

## Configuration

```ts
type WebCacheBustPolicy = 'none' | 'filename' | 'query';

interface WebBrandNamingPolicy {
  readonly strategy: WebCacheBustPolicy;
  readonly hashLength?: number; // 8..64; 12 when omitted for hashed policies
  readonly fallbackFavicon?: string;
  readonly fallbackManifest?: string;
}
```

`WebAppBrandingResource.naming` is optional. Omission is equivalent to `{ strategy: 'none' }`.

## Published result

The existing `GenerationResultV1` remains result version 1. Each web artifact follows:

```ts
interface PublishedArtifactV1 {
  readonly artifactId: string;
  readonly outputRootId: string;
  readonly relativePath: string;
  readonly publicPath?: string;
  readonly disposition: 'created' | 'updated' | 'unchanged';
  readonly contentHash: {
    readonly algorithm: 'sha256';
    readonly value: string; // full final-byte digest
    readonly token: string; // exact browser token for filename/query
  };
}
```

Policy mapping:

| Policy | Filesystem path | Returned public path | Token |
|---|---|---|---|
| `none` | Configured stable filename | Configured stable public path | Full digest |
| `filename` | `<name>.<token>.<ext>` | Path to hash-bearing filename | Configured digest prefix |
| `query` | Configured stable filename | `<stable-path>?v=<token>` | Configured digest prefix |

All normalized result filesystem paths use `/` separators and remain relative to `outputRootId`. No absolute path is part of portable artifact identity.

## Usage descriptors

```ts
interface WebHtmlLinkPayloadV1 {
  readonly rel: string;
  readonly href: string;
  readonly type?: string;
  readonly sizes?: string;
  readonly purpose?: string;
}
```

The existing version-1 descriptor envelope supplies `kind`, `version`, `targetId`, `artifactIds`, and `payload`. Every artifact ID must resolve in the same result's complete catalog. `href` reflects the final resolved public path, including filename or query tokens. Descriptors are data only; AssetLoom never locates or modifies caller HTML.

## Errors

- Invalid token lengths fail before publication with a stable `LOOM_` configuration or planning code.
- Legacy `stable` and `content-hash` configuration values produce actionable migration diagnostics.
- Collision, ownership, recovery, and boundary failures retain their existing stable public codes and causes.
