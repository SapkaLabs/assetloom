# Generation Result V1 Contract

```ts
interface GenerationResultV1 {
  readonly resultVersion: 1;
  readonly targets: readonly string[];
  readonly artifacts: readonly PublishedArtifactV1[];
  readonly removed: readonly RemovedArtifactV1[];
  readonly usage: readonly UsageDescriptorV1[];
  readonly diagnostics: readonly DiagnosticV1[];
}

interface PublishedArtifactV1 {
  readonly artifactId: string;
  readonly resourceId: string;
  readonly targetId: string;
  readonly role: string;
  readonly outputRootId: string;
  readonly relativePath: string;
  readonly publicPath?: string;
  readonly disposition: 'created' | 'updated' | 'unchanged';
  readonly mediaType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sizeBytes: number;
  readonly contentHash: {
    readonly algorithm: 'sha256';
    readonly value: string;
    readonly token: string;
  };
}

interface RemovedArtifactV1 {
  readonly artifactId: string;
  readonly targetId: string;
  readonly outputRootId: string;
  readonly relativePath: string;
  readonly disposition: 'removed';
  readonly contentHash: {
    readonly algorithm: 'sha256';
    readonly value: string;
  };
}

interface UsageDescriptorV1<TPayload extends JsonValue = JsonValue> {
  readonly kind: string;
  readonly version: 1;
  readonly targetId: string;
  readonly artifactIds: readonly string[];
  readonly payload: TPayload;
}

interface DiagnosticV1 {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly context?: Readonly<Record<string, JsonValue>>;
}
```

## Serialization and ordering

- Paths are relative, `/`-separated, contain no `.`/`..` segments, and are never absolute.
- SHA-256 values are 64 lowercase hexadecimal characters.
- Arrays use the stable ordering described in the data model and do not depend on object insertion,
  locale, discovery order, or publication timing.
- Optional properties are omitted rather than serialized as `undefined`.
- Result version 1 is additive only where optional fields retain existing meaning; incompatible
  semantic or schema changes require a new result version.

## Success and failure

A `GenerationResultV1` represents only complete successful publication. Public failures throw or
reject with a stable `LOOM_` error and preserve the original cause. Interrupted publication leaves a
pending intent and does not return a partial result.
