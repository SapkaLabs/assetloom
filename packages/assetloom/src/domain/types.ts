export type TargetPlatform = 'android' | 'ios';

export type GenerationOperation =
  | 'render'
  | 'compose'
  | 'copy'
  | 'write-json'
  | 'write-xml'
  | 'update-project';

export interface GenerationTask {
  id: string;
  resourceId: string;
  resourceType: string;
  target: 'android' | 'ios';
  operation: GenerationOperation;
  sourceDependencies: string[];
  width?: number;
  height?: number;
  format?: 'png' | 'webp' | 'json' | 'xml' | 'directory';
  destination: string;
  presetVersion: string;
}

export interface SourceReference {
  source: string;
}

export interface AndroidTargetConfiguration {
  enabled: boolean;
  resourceDirectory: string;
  manifestPath: string;
}

export interface IosTargetConfiguration {
  enabled: boolean;
  projectDirectory: string;
  projectFile: string;
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

export type ResourceConfiguration =
  | AppIconResource
  | NotificationIconResource
  | SplashScreenResource;

export interface AssetloomConfiguration {
  $schema?: string;
  schemaVersion: 1;
  project: {
    root: string;
  };
  targets: {
    android?: AndroidTargetConfiguration;
    ios?: IosTargetConfiguration;
  };
  resources: Record<string, ResourceConfiguration>;
}

export interface ProvenanceEntry {
  readonly file: string;
  readonly configurationIndex: number;
}

export type ConfigurationProvenance = ReadonlyMap<string, ProvenanceEntry>;

export interface LoadedConfiguration {
  readonly config: AssetloomConfiguration;
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
