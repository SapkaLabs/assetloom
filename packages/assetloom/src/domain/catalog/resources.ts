import type { SourceDefinition } from './sources.js';

export type CatalogResourceType =
  | 'files'
  | 'svg-components'
  | 'image-variants'
  | 'native-image-assets'
  | 'web-app-branding'
  | 'font-family';

export interface FileResourceOutput {
  readonly target: string;
  readonly directory: string;
  readonly path?: string;
}

export interface FilesResource {
  readonly type: 'files';
  readonly source: SourceDefinition;
  readonly outputs: readonly FileResourceOutput[];
}

export type SvgRuntime = 'react-dom' | 'react-native';

export interface SvgComponentNamingPolicy {
  /** Include the complete parent directory when its name starts with this value. */
  readonly parentDirectoryPrefix: string;
  readonly separator: string;
}

export interface SvgComponentOutput {
  readonly target: string;
  readonly directory: string;
  readonly runtime: SvgRuntime;
  readonly preset: string;
  readonly naming?: 'pascal-case' | 'preserve';
  readonly componentNaming?: SvgComponentNamingPolicy;
  readonly generateBarrel?: boolean;
}

export interface SvgComponentsResource {
  readonly type: 'svg-components';
  readonly source: SourceDefinition;
  readonly outputs: readonly SvgComponentOutput[];
}

export type ImageOutputFormat = 'png' | 'webp' | 'jpeg' | 'ico';
export type ImageFit = 'contain' | 'cover' | 'fill' | 'inside' | 'outside';

export interface ImageVariantOutput {
  readonly target: string;
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly format: ImageOutputFormat;
  readonly fit?: ImageFit;
  readonly background?: string;
  readonly quality?: number;
}

export interface ImageVariantsResource {
  readonly type: 'image-variants';
  readonly source: SourceDefinition;
  readonly outputs: readonly ImageVariantOutput[];
}

export interface AndroidImageDensity {
  readonly density: string;
  readonly width: number;
}

export interface IosImageScale {
  readonly scale: '1x' | '2x' | '3x';
  readonly width: number;
}

export interface NativeImageAssetsResource {
  readonly type: 'native-image-assets';
  readonly source: SourceDefinition;
  readonly onNameCollision?: 'error' | 'prefer-output-format';
  readonly output: {
    readonly target: string;
    readonly android?: {
      readonly resourceDirectory: string;
      readonly densities: readonly AndroidImageDensity[];
    };
    readonly ios?: {
      readonly assetCatalogDirectory: string;
      readonly scales: readonly IosImageScale[];
    };
  };
  readonly format: Exclude<ImageOutputFormat, 'ico'>;
  readonly quality?: number;
}

export interface ForegroundScalePolicy {
  readonly default: number;
  readonly overrides?: Readonly<Record<string, number>>;
}

export interface WebBrandNamingPolicy {
  readonly strategy: 'content-hash' | 'stable';
  readonly hashLength?: number;
  readonly fallbackFavicon?: string;
  readonly fallbackManifest?: string;
}

export interface WebBrandManifestMetadata {
  readonly themeColor?: string;
  readonly backgroundColor: string;
  readonly display: string;
}

export interface WebBrandSeoMetadata {
  readonly siteUrl?: string;
  readonly title?: string;
  readonly description?: string;
  readonly canonicalPath?: string;
  readonly robots?: string;
  readonly openGraph?: {
    readonly type: string;
    readonly title?: string;
    readonly description?: string;
    readonly url?: string;
    readonly includeImage?: boolean;
  };
  readonly twitter?: {
    readonly card: string;
    readonly title?: string;
    readonly description?: string;
    readonly includeImage?: boolean;
  };
  readonly colorScheme?: string;
  readonly includeIcons?: boolean;
  readonly includeManifest?: boolean;
}

export interface StaticWebAppIntegrationConfiguration {
  readonly path: string;
  readonly integrateCacheHeaders: boolean;
}

export interface WebAppBrandingResource {
  readonly type: 'web-app-branding';
  readonly preset: string;
  readonly displayName: string;
  readonly shortName: string;
  readonly brandColor: string;
  readonly iconBackgroundColor: string;
  readonly sources: {
    readonly foreground: SourceDefinition;
    readonly background?: SourceDefinition;
    readonly socialPreview?: SourceDefinition;
  };
  readonly output: {
    readonly target: string;
    readonly directory: string;
    readonly manifest?: string;
    readonly document?: string;
  };
  readonly faviconSizes: readonly number[];
  readonly faviconIcoSizes?: readonly number[];
  readonly appleTouchIconSize?: number;
  readonly applicationIconSizes: readonly number[];
  readonly maskableIconSizes?: readonly number[];
  readonly foregroundScales?: {
    readonly favicon?: ForegroundScalePolicy;
    readonly appleTouch?: number;
    readonly application?: number;
    readonly maskable?: number;
  };
  readonly naming: WebBrandNamingPolicy;
  readonly manifest: WebBrandManifestMetadata;
  readonly seo?: WebBrandSeoMetadata;
  readonly staticWebApp?: StaticWebAppIntegrationConfiguration;
  readonly socialPreview?: {
    readonly width: number;
    readonly height: number;
    readonly fit?: ImageFit;
    readonly overlayPreset?: string;
    readonly logoSize?: number;
  };
}

export type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2';
export type FontStyle = 'normal' | 'italic' | 'oblique';

export interface FontFaceDefinition {
  readonly source: SourceDefinition;
  readonly alias: string;
  readonly weight: number;
  readonly style: FontStyle;
  readonly format?: FontFormat;
}

export interface FontFamilyOutput {
  readonly target: string;
  readonly directory?: string;
  readonly stylesheet?: string;
}

export interface FontFamilyResource {
  readonly type: 'font-family';
  readonly family: string;
  readonly faces: readonly FontFaceDefinition[];
  readonly outputs: readonly FontFamilyOutput[];
}

export type CatalogResourceDefinition =
  | FilesResource
  | SvgComponentsResource
  | ImageVariantsResource
  | NativeImageAssetsResource
  | WebAppBrandingResource
  | FontFamilyResource;

export function isCatalogResource(
  resource: { readonly type: string },
): resource is CatalogResourceDefinition {
  return (
    resource.type === 'files' ||
    resource.type === 'svg-components' ||
    resource.type === 'image-variants' ||
    resource.type === 'native-image-assets' ||
    resource.type === 'web-app-branding' ||
    resource.type === 'font-family'
  );
}

export function catalogResourceTargetIds(
  resource: CatalogResourceDefinition,
): readonly string[] {
  switch (resource.type) {
    case 'files':
    case 'svg-components':
    case 'image-variants':
    case 'font-family':
      return resource.outputs.map((output) => output.target);
    case 'native-image-assets':
      return [resource.output.target];
    case 'web-app-branding':
      return [resource.output.target];
  }
}
