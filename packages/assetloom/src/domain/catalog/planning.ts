import type {
  CatalogResourceType,
  ImageFit,
  ImageOutputFormat,
  SvgRuntime,
} from './resources.js';
import type { TargetId } from './targets.js';
import type { UsageDescriptorV1 } from '../generation-result.js';

export interface ArtifactPublicPath {
  readonly publicDirectory: string;
  readonly publicBasePath: string;
}

export interface StableArtifactPublication {
  readonly mode: 'stable';
  readonly publicPath?: ArtifactPublicPath;
  readonly queryContentHash?: {
    readonly parameter: 'v';
    readonly hashLength: number;
  };
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
  /** Portable semantic role exposed in generation results. */
  readonly role?: string;
  /** Explicit publication-root identity; inferred only by compatibility planners. */
  readonly outputRootId?: string;
  /** Normalized root-relative output path; inferred only by compatibility planners. */
  readonly relativePath?: string;
  /** Optional media type for the final complete output. */
  readonly mediaType?: string;
  /** Declarative caller guidance resolved only from planned artifact outputs. */
  readonly usage?: readonly PlannedUsageDescriptorV1[];
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
  readonly content: string | ArtifactOutputReference | JsonArtifactTemplate;
  readonly encoding: 'utf8';
}

export interface InterpolatedArtifactString {
  readonly kind: 'interpolated';
  readonly parts: readonly (string | ArtifactOutputReference)[];
}

export type PlannedUsageScalar =
  | ArtifactOutputReference
  | InterpolatedArtifactString;

export type PlannedJsonValue =
  | null
  | boolean
  | number
  | string
  | ArtifactOutputReference
  | InterpolatedArtifactString
  | readonly PlannedJsonValue[]
  | { readonly [key: string]: PlannedJsonValue };

export interface JsonArtifactTemplate {
  readonly kind: 'json-template';
  readonly value: PlannedJsonValue;
}

export interface PlannedUsageDescriptorV1
  extends Omit<UsageDescriptorV1, 'payload'> {
  readonly payload: PlannedJsonValue;
}

export type CatalogPlannedArtifact =
  | CopyFileArtifact
  | TransformSvgArtifact
  | RenderImageArtifact
  | WriteTextArtifact;

export type CatalogOperation = CatalogPlannedArtifact['operation'];
