export { clean, generate } from './api/generate.js';
export type { GenerateOptions } from './api/generate.js';
export { createGenerationPlan, parseTarget } from './api/plan.js';
export { createHtmlReport } from './api/report.js';
export type { CreateHtmlReportOptions } from './api/report.js';
export { verify } from './api/verify.js';
export type { VerifyOptions } from './api/verify.js';
export { cleanV2 } from './api/clean-v2.js';
export type { CleanV2Options, CleanV2Result } from './api/clean-v2.js';
export { generateV2, generateVersioned } from './api/generate-v2.js';
export type {
  GenerateV2Dependencies,
  GenerateV2Options,
  GenerateV2Result,
  GenerateVersionedOptions,
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
export {
  isJsonSafeValue,
  isPortableResultPath,
  stableGenerationResultJson,
  validateGenerationResultV1,
} from './domain/generation-result.js';
export type {
  WebHeadMetadataPayloadV1,
  WebHeadMetadataUsageV1,
  WebHtmlLinkPayloadV1,
  WebHtmlLinkUsageV1,
  WebStaticHostPayloadV1,
  WebStaticHostUsageV1,
  WebUsageDescriptorV1,
} from './domain/web-usage.js';
export type {
  NativeResourceUsagePayloadV1,
  NativeResourceUsageV1,
} from './domain/native-usage.js';
export type {
  ContentHashV1,
  DiagnosticV1,
  GenerationResultV1,
  JsonSafeValue,
  PublishedArtifactDisposition,
  PublishedArtifactV1,
  RemovedArtifactV1,
  UsageDescriptorV1,
} from './domain/generation-result.js';
export { OutputRootRegistry } from './application/planning/output-root-registry.js';
export { inspectImage, imageRendererCompatibilityVersion } from '@sapkalabs/assetloom-images';
export type { ImageRecipeV1, InspectedImageV1 } from '@sapkalabs/assetloom-images';
export { assertNativeResourceName, createNativeResourceUsageV1 } from '@sapkalabs/assetloom-native';
export type { NativeImagePresetV1, NativePlatform, NativeSemanticRole } from '@sapkalabs/assetloom-native';
export {
  appendWebCacheBustQuery,
  assertWebHashTokenLength,
  DEFAULT_WEB_CACHE_BUST_POLICY,
  DEFAULT_WEB_HASH_TOKEN_LENGTH,
  MAX_WEB_HASH_TOKEN_LENGTH,
  MIN_WEB_HASH_TOKEN_LENGTH,
  resolveWebPublicPath,
  webContentHashToken,
} from '@sapkalabs/assetloom-web';
export type { WebCacheBustPolicy, WebImagePresetV1 } from '@sapkalabs/assetloom-web';
export type {
  OutputRootDefinition,
  PlannedOutputPath,
  ResolvedOutputPath,
} from './application/planning/output-root-registry.js';
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
  ImageInput,
  ImageRecipe,
  InterpolatedArtifactString,
  JsonArtifactTemplate,
  PlannedJsonValue,
  PlannedUsageDescriptorV1,
  RenderImageArtifact,
  RasterImageRecipe,
  TransformSvgArtifact,
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
  WebStaticHostGuidanceConfiguration,
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
