import type {
  ArtifactOutputReference,
  CatalogPlannedArtifact,
} from '../../domain/catalog/planning.js';

export type GeneratedCatalogArtifact = CatalogPlannedArtifact;

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
  readonly hashToken: string;
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
