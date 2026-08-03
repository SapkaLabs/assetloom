# Typed Usage Descriptor Contracts V1

All contracts extend the generic `UsageDescriptorV1` envelope and are JSON-serializable.

```ts
interface WebHtmlLinkUsageV1 {
  readonly kind: 'web.html-link';
  readonly version: 1;
  readonly targetId: string;
  readonly artifactIds: readonly string[];
  readonly payload: {
    readonly rel: string;
    readonly href: string;
    readonly type?: string;
    readonly sizes?: string;
    readonly purpose?: string;
  };
}

interface WebHeadMetadataUsageV1 {
  readonly kind: 'web.head-metadata';
  readonly version: 1;
  readonly targetId: string;
  readonly artifactIds: readonly string[];
  readonly payload: {
    readonly elements: readonly JsonSafeValue[];
  };
}

interface WebStaticHostGuidanceV1 {
  readonly kind: 'web.static-host-cache';
  readonly version: 1;
  readonly targetId: string;
  readonly artifactIds: readonly string[];
  readonly payload: {
    readonly routes: readonly {
      readonly route: string;
      readonly headers: Readonly<Record<string, string>>;
    }[];
  };
}

interface NativeResourceUsageV1 {
  readonly kind: 'native.resource';
  readonly version: 1;
  readonly targetId: 'android' | 'ios';
  readonly artifactIds: readonly string[];
  readonly payload: {
    readonly platform: 'android' | 'ios';
    readonly role: string;
    readonly name: string;
    readonly relativePaths: readonly string[];
    readonly manualIntegration: readonly string[];
  };
}
```

Descriptors are data only. They contain no consumer file destination, parser, callback, script, or
write instruction executable by AssetLoom.
