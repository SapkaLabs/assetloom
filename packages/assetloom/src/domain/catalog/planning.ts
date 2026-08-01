import type {
  CatalogResourceType,
  ImageFit,
  ImageOutputFormat,
  SvgRuntime,
} from './resources.js';
import type { TargetId } from './targets.js';

export interface ArtifactPublicPath {
  readonly publicDirectory: string;
  readonly publicBasePath: string;
}

export interface StableArtifactPublication {
  readonly mode: 'stable';
  readonly publicPath?: ArtifactPublicPath;
}

export interface ContentHashArtifactPublication {
  readonly mode: 'content-hash';
  readonly directory: string;
  readonly logicalName: string;
  readonly extension: string;
  readonly hashLength: number;
  readonly fallbackDestination?: string;
  readonly publicPath?: ArtifactPublicPath;
}

export type ArtifactPublication =
  | StableArtifactPublication
  | ContentHashArtifactPublication;

export interface ArtifactOutputReference {
  readonly kind: 'artifact-output';
  readonly artifactId: string;
  readonly value:
    | 'content'
    | 'destination'
    | 'public-path'
    | 'file-name'
    | 'sha256'
    | 'width'
    | 'height';
}

export interface CatalogArtifactBase {
  readonly id: string;
  readonly resourceId: string;
  readonly resourceType: CatalogResourceType;
  readonly target: TargetId;
  readonly dependsOn: readonly string[];
  readonly sourceDependencies: readonly string[];
  /** Stable logical identity used by planning collision diagnostics. */
  readonly destination: string;
  readonly presetVersion: string;
}

export interface GeneratedCatalogArtifactBase extends CatalogArtifactBase {
  readonly ownership: 'generated';
  readonly publication: ArtifactPublication;
}

export interface CopyFileArtifact extends GeneratedCatalogArtifactBase {
  readonly operation: 'copy-file';
  readonly source: string;
}

export interface TransformSvgArtifact extends GeneratedCatalogArtifactBase {
  readonly operation: 'transform-svg';
  readonly source: string;
  readonly runtime: SvgRuntime;
  readonly preset: string;
  readonly componentName: string;
}

export interface SourceImageInput {
  readonly kind: 'source';
  readonly path: string;
}

export interface InlineSvgImageInput {
  readonly kind: 'inline-svg';
  readonly content: string;
}

export interface ArtifactImageInput {
  readonly kind: 'artifact-output';
  readonly artifactId: string;
}

export type ImageInput =
  | SourceImageInput
  | InlineSvgImageInput
  | ArtifactImageInput;

export interface ResizeImageRecipe {
  readonly kind: 'resize';
  readonly input: ImageInput;
  readonly width?: number;
  readonly height?: number;
  readonly fit: ImageFit;
  readonly background?: string;
}

export interface ImageCompositeLayer {
  readonly input: ImageInput;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly fit: ImageFit;
  readonly blend?: 'over' | 'multiply' | 'screen';
}

export interface CompositeImageRecipe {
  readonly kind: 'composite';
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly background: string;
  };
  readonly layers: readonly ImageCompositeLayer[];
}

export type RasterImageRecipe = ResizeImageRecipe | CompositeImageRecipe;

export interface IcoImageRecipe {
  readonly kind: 'ico';
  readonly images: readonly {
    /** An ephemeral rasterization recipe. ICO members are not published artifacts. */
    readonly recipe: RasterImageRecipe;
  }[];
}

export type ImageRecipe = RasterImageRecipe | IcoImageRecipe;

export interface RenderImageArtifact extends GeneratedCatalogArtifactBase {
  readonly operation: 'render-image';
  readonly width?: number;
  readonly height?: number;
  readonly format: ImageOutputFormat;
  readonly quality?: number;
  readonly recipe: ImageRecipe;
}

export interface WriteTextArtifact extends GeneratedCatalogArtifactBase {
  readonly operation: 'write-text';
  readonly content: string | ArtifactOutputReference;
  readonly encoding: 'utf8';
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface InterpolatedIntegrationString {
  readonly kind: 'interpolated';
  readonly parts: readonly (string | ArtifactOutputReference)[];
}

export type IntegrationValue =
  | string
  | ArtifactOutputReference
  | InterpolatedIntegrationString;

export type IntegrationJsonValue =
  | null
  | boolean
  | number
  | string
  | ArtifactOutputReference
  | InterpolatedIntegrationString
  | readonly IntegrationJsonValue[]
  | { readonly [key: string]: IntegrationJsonValue };

export interface PublishedIntegrationResult {
  readonly resultId: string;
  /** Stable logical output path used when publication is not content-hashed. */
  readonly destination: string;
  readonly publication: ArtifactPublication;
}

export interface WebManifestIntegrationRecipe {
  readonly adapter: 'web-app-manifest';
  readonly stateKey: string;
  readonly manifest: Readonly<Record<string, IntegrationJsonValue>>;
  readonly publishedCopy?: PublishedIntegrationResult;
}

export interface HtmlHeadElement {
  readonly element: 'link' | 'meta' | 'title';
  readonly attributes?: Readonly<Record<string, IntegrationValue>>;
  readonly text?: IntegrationValue;
}

export interface HtmlHeadIntegrationRecipe {
  readonly adapter: 'html-head';
  readonly stateKey: string;
  readonly elements: readonly HtmlHeadElement[];
}

export interface StaticWebAppRoute {
  readonly route: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface StaticWebAppConfigIntegrationRecipe {
  readonly adapter: 'static-web-app-config';
  readonly stateKey: string;
  readonly routes: readonly StaticWebAppRoute[];
}

export type ProjectIntegrationRecipe =
  | WebManifestIntegrationRecipe
  | HtmlHeadIntegrationRecipe
  | StaticWebAppConfigIntegrationRecipe;

export interface IntegrateProjectArtifact extends CatalogArtifactBase {
  readonly operation: 'integrate-project';
  readonly ownership: 'project-integration';
  readonly integration: ProjectIntegrationRecipe;
}

export type CatalogPlannedArtifact =
  | CopyFileArtifact
  | TransformSvgArtifact
  | RenderImageArtifact
  | WriteTextArtifact
  | IntegrateProjectArtifact;

export type CatalogOperation = CatalogPlannedArtifact['operation'];
