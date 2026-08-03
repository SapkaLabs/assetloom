import type {
  CatalogResourceDefinition,
} from './catalog/resources.js';
import type {
  CatalogTargetConfiguration,
} from './catalog/targets.js';
import type { UsageDescriptorV1 } from './generation-result.js';

export type TargetPlatform = 'android' | 'ios';

export type GenerationOperation =
  | 'render'
  | 'compose'
  | 'copy'
  | 'write-json'
  | 'write-xml';

export type GenerationRenderMode = 'standard' | 'monochrome' | 'tinted';

export interface GenerationTask {
  id: string;
  resourceId: string;
  resourceType: string;
  target: 'android' | 'ios';
  operation: GenerationOperation;
  renderMode?: GenerationRenderMode;
  sourceDependencies: string[];
  width?: number;
  height?: number;
  format?: 'png' | 'webp' | 'json' | 'xml' | 'directory';
  destination: string;
  presetVersion: string;
  usage?: readonly UsageDescriptorV1[];
}

export interface SourceReference {
  source: string;
}

export interface AndroidTargetConfiguration {
  enabled: boolean;
  resourceDirectory: string;
}

export interface IosTargetConfiguration {
  enabled: boolean;
  projectDirectory: string;
  assetCatalogDirectory: string;
}

export interface AppIconResource {
  type: 'app-icon';
  android?: {
    legacy?: SourceReference;
    round?: SourceReference;
    adaptive?: {
      foreground: SourceReference;
      background: { color: string; source?: never } | { source: string; color?: never };
      monochrome?: SourceReference;
    };
  };
  ios?:
    | {
        mode: 'variants';
        light: SourceReference;
        dark?: SourceReference;
        tinted?: SourceReference;
      }
    | {
        mode: 'icon-composer';
        source: string;
        name?: string;
      };
}

export interface NotificationIconResource {
  type: 'notification-icon';
  android: SourceReference & {
    color?: string;
  };
}

export interface SplashAppearance {
  image: string;
  backgroundColor: string;
  imageWidth: number;
}

export interface SplashScreenResource {
  type: 'splash-screen';
  light: SplashAppearance;
  dark?: SplashAppearance;
}

export interface ConfigurationMetadata {
  name: string;
  description?: string;
}

export type ResourceConfiguration =
  | AppIconResource
  | NotificationIconResource
  | SplashScreenResource;

export interface AssetloomConfigurationV1 {
  $schema?: string;
  schemaVersion: 1;
  metadata?: ConfigurationMetadata;
  project: {
    root: string;
  };
  targets: {
    android?: AndroidTargetConfiguration;
    ios?: IosTargetConfiguration;
  };
  resources: Record<string, ResourceConfiguration>;
}

export interface AssetloomV2Targets {
  readonly [targetId: string]:
    | AndroidTargetConfiguration
    | IosTargetConfiguration
    | CatalogTargetConfiguration
    | undefined;
  readonly android?: AndroidTargetConfiguration;
  readonly ios?: IosTargetConfiguration;
}

export interface AssetloomConfigurationV2 {
  readonly $schema?: string;
  readonly schemaVersion: 2;
  readonly metadata?: ConfigurationMetadata;
  readonly project: {
    readonly root: string;
  };
  readonly targets: AssetloomV2Targets;
  readonly resources: Record<
    string,
    ResourceConfiguration | CatalogResourceDefinition
  >;
}

/** The version 1 alias remains the compatibility contract for the native API. */
export type AssetloomConfiguration = AssetloomConfigurationV1;

export type VersionedAssetloomConfiguration =
  | AssetloomConfigurationV1
  | AssetloomConfigurationV2;

export interface ProvenanceEntry {
  readonly file: string;
  readonly configurationIndex: number;
}

export type ConfigurationProvenance = ReadonlyMap<string, ProvenanceEntry>;

export interface LoadedConfiguration<
  TConfiguration extends VersionedAssetloomConfiguration = AssetloomConfigurationV1,
> {
  readonly config: TConfiguration;
  readonly files: readonly string[];
  readonly projectRoot: string;
  readonly provenance: ConfigurationProvenance;
}

export interface GenerationPlan {
  readonly projectRoot: string;
  readonly targets: readonly TargetPlatform[];
  readonly tasks: readonly GenerationTask[];
}

export interface GenerationResult {
  readonly plan: GenerationPlan;
  readonly written: readonly string[];
  readonly unchanged: readonly string[];
  readonly removed: readonly string[];
}

export interface VerificationResult {
  readonly ok: true;
  readonly checked: readonly string[];
  readonly skippedNativeChecks: readonly string[];
}

export type LoadedVersionedConfiguration =
  LoadedConfiguration<VersionedAssetloomConfiguration>;

export type ReportFileStatus =
  | 'valid'
  | 'modified'
  | 'missing'
  | 'untracked'
  | 'invalid';

export interface HtmlReportResult {
  readonly path: string;
  readonly written: boolean;
  readonly healthy: boolean;
  readonly configurationName: string;
  readonly configurationFingerprint: string;
  readonly sources: number;
  readonly outputs: number;
  readonly issues: number;
}
