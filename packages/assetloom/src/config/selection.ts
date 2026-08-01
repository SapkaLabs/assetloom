import { LoomError } from '../domain/errors.js';
import { compareCodePoints } from '../domain/ordering.js';
import type {
  AndroidTargetConfiguration,
  AssetloomConfigurationV1,
  AssetloomConfigurationV2,
  IosTargetConfiguration,
  ResourceConfiguration,
  VersionedAssetloomConfiguration,
} from '../domain/types.js';
import {
  isCatalogResource,
  type CatalogResourceDefinition,
} from '../domain/catalog/resources.js';
import type { CatalogTargetConfiguration } from '../domain/catalog/targets.js';
import { targetId, type TargetId } from '../domain/catalog/targets.js';

export function isVersionOneConfiguration(
  config: VersionedAssetloomConfiguration,
): config is AssetloomConfigurationV1 {
  return config.schemaVersion === 1;
}

export function isVersionTwoConfiguration(
  config: VersionedAssetloomConfiguration,
): config is AssetloomConfigurationV2 {
  return config.schemaVersion === 2;
}

export function isNativeResource(
  resource: ResourceConfiguration | CatalogResourceDefinition,
): resource is ResourceConfiguration {
  return !isCatalogResource(resource);
}

export function catalogResources(
  config: VersionedAssetloomConfiguration,
): ReadonlyArray<readonly [string, CatalogResourceDefinition]> {
  if (config.schemaVersion === 1) {
    return [];
  }
  return Object.entries(config.resources).flatMap(([resourceId, resource]) =>
    isCatalogResource(resource) ? [[resourceId, resource] as const] : [],
  );
}

export function nativeResources(
  config: VersionedAssetloomConfiguration,
): Record<string, ResourceConfiguration> {
  return Object.fromEntries(
    Object.entries(config.resources).filter(
      (entry): entry is [string, ResourceConfiguration] =>
        isNativeResource(entry[1]),
    ),
  );
}

export function nativeTargets(config: VersionedAssetloomConfiguration): {
  readonly android?: AndroidTargetConfiguration;
  readonly ios?: IosTargetConfiguration;
} {
  return {
    ...(config.targets.android === undefined
      ? {}
      : { android: config.targets.android }),
    ...(config.targets.ios === undefined ? {} : { ios: config.targets.ios }),
  };
}

function isCatalogTarget(
  value:
    | AndroidTargetConfiguration
    | IosTargetConfiguration
    | CatalogTargetConfiguration
    | undefined,
): value is CatalogTargetConfiguration {
  return value !== undefined && 'kind' in value;
}

export function selectCatalogTarget(
  config: AssetloomConfigurationV2,
  requestedId: string,
): { readonly id: TargetId; readonly configuration: CatalogTargetConfiguration } {
  const id = targetId(requestedId);
  const candidate = config.targets[requestedId];
  if (!isCatalogTarget(candidate)) {
    throw new LoomError({
      code: 'LOOM_PLAN_TARGET_UNSUPPORTED',
      message: `Unsupported catalog target "${requestedId}".`,
      context: {
        target: requestedId,
        supportedTargets: Object.entries(config.targets)
          .filter(([, value]) => isCatalogTarget(value))
          .map(([key]) => key)
          .sort(compareCodePoints),
      },
    });
  }
  return { id, configuration: candidate };
}

export function catalogTargetIds(
  config: AssetloomConfigurationV2,
): readonly TargetId[] {
  return Object.entries(config.targets)
    .filter(([, value]) => isCatalogTarget(value))
    .map(([id]) => targetId(id))
    .sort(compareCodePoints);
}
