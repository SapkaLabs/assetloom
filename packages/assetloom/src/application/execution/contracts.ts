import type {
  ArtifactOutputReference,
  CatalogPlannedArtifact,
  IntegrateProjectArtifact,
  JsonValue,
  PublishedIntegrationResult,
} from '../../domain/catalog/planning.js';

export type GeneratedCatalogArtifact = Exclude<
  CatalogPlannedArtifact,
  IntegrateProjectArtifact
>;

export type CatalogArtifactForOperation<
  TOperation extends GeneratedCatalogArtifact['operation'],
> = Extract<GeneratedCatalogArtifact, { readonly operation: TOperation }>;

export interface CatalogContentCache {
  get(key: string): Promise<Uint8Array | undefined>;
  getAlias(key: string): Promise<string | undefined>;
  put(value: Uint8Array): Promise<string>;
  putAlias(key: string, value: Uint8Array): Promise<void>;
}

export interface CatalogMaterializationContext {
  readonly projectRoot: string;
  readonly normalizedConfiguration: string;
  readonly cache: CatalogContentCache;
  readonly outputs: CatalogArtifactOutputResolver;
}

export interface MaterializedCatalogContent {
  readonly content: Uint8Array;
  readonly width?: number;
  readonly height?: number;
}

export interface ResolvedCatalogArtifactOutput
  extends MaterializedCatalogContent {
  readonly artifactId: string;
  readonly destination: string;
  readonly fileName: string;
  readonly publicPath?: string;
  readonly sha256: string;
}

export interface ResolvedCatalogPublication {
  readonly output: ResolvedCatalogArtifactOutput;
  readonly ownedDestinations: readonly string[];
}

export interface CatalogPublicationResolver {
  resolveGenerated(
    artifact: GeneratedCatalogArtifact,
    materialized: MaterializedCatalogContent,
  ): ResolvedCatalogPublication;
  resolveIntegrationResult(
    artifact: IntegrateProjectArtifact,
    result: PublishedIntegrationResult,
    content: Uint8Array,
  ): ResolvedCatalogPublication;
}

export interface CatalogArtifactOutputResolver {
  get(artifactId: string): ResolvedCatalogArtifactOutput;
  resolve(reference: ArtifactOutputReference): string | number | Uint8Array;
}

export interface CatalogArtifactMaterializer<
  TArtifact extends GeneratedCatalogArtifact,
> {
  readonly operation: TArtifact['operation'];
  materialize(
    artifact: TArtifact,
    context: CatalogMaterializationContext,
  ): Promise<MaterializedCatalogContent>;
}

export interface CatalogMaterializerRegistrations {
  readonly 'copy-file'?: CatalogArtifactMaterializer<
    CatalogArtifactForOperation<'copy-file'>
  >;
  readonly 'transform-svg'?: CatalogArtifactMaterializer<
    CatalogArtifactForOperation<'transform-svg'>
  >;
  readonly 'render-image'?: CatalogArtifactMaterializer<
    CatalogArtifactForOperation<'render-image'>
  >;
  readonly 'write-text'?: CatalogArtifactMaterializer<
    CatalogArtifactForOperation<'write-text'>
  >;
}

export interface CatalogArtifactVerifier {
  verify(
    artifact: GeneratedCatalogArtifact,
    output: ResolvedCatalogArtifactOutput,
  ): Promise<void>;
}

export interface StoredIntegrationReceipt {
  readonly adapter: IntegrateProjectArtifact['integration']['adapter'];
  readonly artifactId: string;
  readonly destination: string;
  readonly stateKey: string;
  readonly target: string;
  readonly state: JsonValue;
}

export interface PreparedProjectIntegration {
  readonly content: Uint8Array;
  readonly state: JsonValue;
}

export interface ProjectIntegrationAdapter<
  TArtifact extends IntegrateProjectArtifact = IntegrateProjectArtifact,
> {
  readonly adapter: TArtifact['integration']['adapter'];
  prepare(
    artifact: TArtifact,
    current: Uint8Array | undefined,
    previousState: JsonValue | undefined,
    outputs: CatalogArtifactOutputResolver,
  ): Promise<PreparedProjectIntegration>;
  remove(
    receipt: StoredIntegrationReceipt,
    current: Uint8Array | undefined,
  ): Promise<Uint8Array | undefined>;
  verify(
    artifact: TArtifact,
    current: Uint8Array | undefined,
    receiptState: JsonValue,
    outputs: CatalogArtifactOutputResolver,
  ): Promise<void>;
}

export type IntegrationArtifactForAdapter<
  TAdapter extends IntegrateProjectArtifact['integration']['adapter'],
> = IntegrateProjectArtifact & {
  readonly integration: Extract<
    IntegrateProjectArtifact['integration'],
    { readonly adapter: TAdapter }
  >;
};

export interface ProjectIntegrationAdapterRegistrations {
  readonly 'web-app-manifest'?: ProjectIntegrationAdapter<
    IntegrationArtifactForAdapter<'web-app-manifest'>
  >;
  readonly 'html-head'?: ProjectIntegrationAdapter<
    IntegrationArtifactForAdapter<'html-head'>
  >;
  readonly 'static-web-app-config'?: ProjectIntegrationAdapter<
    IntegrationArtifactForAdapter<'static-web-app-config'>
  >;
}

export interface ProjectIntegrationAdapterRegistry {
  prepare(
    artifact: IntegrateProjectArtifact,
    current: Uint8Array | undefined,
    previousState: JsonValue | undefined,
    outputs: CatalogArtifactOutputResolver,
  ): Promise<PreparedProjectIntegration>;
  remove(
    receipt: StoredIntegrationReceipt,
    current: Uint8Array | undefined,
  ): Promise<Uint8Array | undefined>;
  verify(
    artifact: IntegrateProjectArtifact,
    current: Uint8Array | undefined,
    receiptState: JsonValue,
    outputs: CatalogArtifactOutputResolver,
  ): Promise<void>;
}

export interface ProjectFileSnapshot {
  readonly content: Uint8Array | undefined;
  readonly sha256: string | undefined;
}

export interface ProjectFileGateway {
  inspect(destination: string): Promise<ProjectFileSnapshot>;
  publish(
    destination: string,
    content: Uint8Array,
    expectedSha256: string | undefined,
  ): Promise<'written' | 'unchanged'>;
}
