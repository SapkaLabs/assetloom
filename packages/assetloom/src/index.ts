export { clean, generate } from './api/generate.js';
export type { GenerateOptions } from './api/generate.js';
export { createGenerationPlan, parseTarget } from './api/plan.js';
export { createHtmlReport } from './api/report.js';
export type { CreateHtmlReportOptions } from './api/report.js';
export { verify } from './api/verify.js';
export type { VerifyOptions } from './api/verify.js';
export { cleanV2 } from './api/clean-v2.js';
export type { CleanV2Options, CleanV2Result } from './api/clean-v2.js';
export { generateV2 } from './api/generate-v2.js';
export type {
  GenerateV2Dependencies,
  GenerateV2Options,
  GenerateV2Result,
} from './api/generate-v2.js';
export { createCatalogReport } from './api/report-v2.js';
export type {
  CatalogReportResult,
  CreateCatalogReportOptions,
} from './api/report-v2.js';
export { verifyV2 } from './api/verify-v2.js';
export type { VerifyV2Options } from './api/verify-v2.js';
export {
  clearAbandonedProjectLockRecoveryClaim,
  inspectProjectLockRecoveryClaim,
} from './api/lock-recovery.js';
export type {
  ProjectLockRecoveryClaim,
  ProjectLockRecoveryClaimClearResult,
  ProjectLockRecoveryClaimInspection,
} from './storage/lock.js';
export {
  loadConfiguration,
  loadVersionedConfiguration,
} from './config/load.js';
export type { LoadConfigurationOptions } from './config/load.js';
export { normalizeConfiguration } from './config/normalize.js';
export {
  catalogTargetIds,
  catalogResources,
  isNativeResource,
  isVersionOneConfiguration,
  isVersionTwoConfiguration,
  nativeResources,
  nativeTargets,
  selectCatalogTarget,
} from './config/selection.js';
export { mergeConfigurations } from './config/merge.js';
export type {
  ConfigurationDocument,
  MergeResult,
} from './config/merge.js';
export { asLoomError, LoomError } from './domain/errors.js';
export type {
  LoomErrorCode,
  LoomErrorOptions,
} from './domain/errors.js';
export type {
  AppIconResource,
  AndroidTargetConfiguration,
  AssetloomConfiguration,
  AssetloomConfigurationV1,
  AssetloomConfigurationV2,
  AssetloomV2Targets,
  ConfigurationMetadata,
  ConfigurationProvenance,
  GenerationOperation,
  GenerationPlan,
  GenerationRenderMode,
  GenerationResult,
  GenerationTask,
  IosTargetConfiguration,
  HtmlReportResult,
  LoadedConfiguration,
  LoadedVersionedConfiguration,
  NotificationIconResource,
  ProvenanceEntry,
  ResourceConfiguration,
  ReportFileStatus,
  SourceReference,
  SplashAppearance,
  SplashScreenResource,
  TargetPlatform,
  VerificationResult,
  VersionedAssetloomConfiguration,
} from './domain/types.js';
export type {
  ArtifactOutputReference,
  ArtifactPublication,
  ArtifactPublicPath,
  CatalogOperation,
  CatalogPlannedArtifact,
  CopyFileArtifact,
  HtmlHeadElement,
  HtmlHeadIntegrationRecipe,
  ImageInput,
  ImageRecipe,
  IntegrationJsonValue,
  IntegrationValue,
  IntegrateProjectArtifact,
  JsonValue,
  ProjectIntegrationRecipe,
  RenderImageArtifact,
  RasterImageRecipe,
  StaticWebAppConfigIntegrationRecipe,
  StaticWebAppRoute,
  TransformSvgArtifact,
  WebManifestIntegrationRecipe,
  WriteTextArtifact,
} from './domain/catalog/planning.js';
export {
  catalogResourceTargetIds,
  isCatalogResource,
} from './domain/catalog/resources.js';
export type {
  CatalogResourceDefinition,
  CatalogResourceType,
  FileResourceOutput,
  FilesResource,
  FontFaceDefinition,
  FontFamilyOutput,
  FontFamilyResource,
  FontFormat,
  FontStyle,
  ForegroundScalePolicy,
  ImageFit,
  ImageOutputFormat,
  ImageVariantOutput,
  ImageVariantsResource,
  AndroidImageDensity,
  IosImageScale,
  NativeImageAssetsResource,
  SvgComponentNamingPolicy,
  SvgComponentOutput,
  SvgComponentsResource,
  SvgRuntime,
  StaticWebAppIntegrationConfiguration,
  WebAppBrandingResource,
  WebBrandManifestMetadata,
  WebBrandNamingPolicy,
  WebBrandSeoMetadata,
} from './domain/catalog/resources.js';
export type {
  FileSourceDefinition,
  GlobSourceDefinition,
  PackageSourceDefinition,
  ResolvedSource,
  SourceDefinition,
} from './domain/catalog/sources.js';
export { targetId } from './domain/catalog/targets.js';
export type {
  CatalogTargetConfiguration,
  DirectoryTargetConfiguration,
  ReactNativeAppTargetConfiguration,
  ReactNativeLibraryTargetConfiguration,
  ResolvedCatalogTarget,
  TargetId,
  TargetKind,
  WebAppTargetConfiguration,
} from './domain/catalog/targets.js';
export {
  createCompositeGenerationPlan,
} from './application/planning/composite-planner.js';
export type {
  CompositeGenerationPlan,
  CompositePlannedArtifact,
} from './application/planning/composite-planner.js';
export type {
  PlanningContext,
  ResourceHandler,
  SourceResolver,
  ValidationContext,
} from './application/planning/contracts.js';
export { ResourceHandlerRegistry } from './application/planning/resource-handler-registry.js';
export type { ResourceHandlers } from './application/planning/resource-handler-registry.js';
export {
  createDefaultCatalogRuntime,
} from './infrastructure/composition/default-catalog-runtime.js';
export type {
  DefaultCatalogRuntime,
} from './infrastructure/composition/default-catalog-runtime.js';
