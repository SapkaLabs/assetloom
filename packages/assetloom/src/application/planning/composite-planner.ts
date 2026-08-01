import path from 'node:path';
import {
  catalogTargetIds,
  nativeResources,
  nativeTargets,
  selectCatalogTarget,
} from '../../config/selection.js';
import { LoomError } from '../../domain/errors.js';
import { compareCodePoints } from '../../domain/ordering.js';
import type { CatalogPlannedArtifact } from '../../domain/catalog/planning.js';
import type {
  GenerationTask,
  LoadedConfiguration,
  LoadedVersionedConfiguration,
  TargetPlatform,
} from '../../domain/types.js';
import { createGenerationPlan } from '../../planner/index.js';
import type { PlanningContext } from './contracts.js';
import { planCatalogResources } from './catalog-planner.js';
import type { ResourceHandlerRegistry } from './resource-handler-registry.js';

export type CompositePlannedArtifact = GenerationTask | CatalogPlannedArtifact;

export interface CompositeGenerationPlan {
  readonly projectRoot: string;
  readonly targets: readonly string[];
  readonly artifacts: readonly CompositePlannedArtifact[];
  readonly nativeTasks: readonly GenerationTask[];
  readonly catalogArtifacts: readonly CatalogPlannedArtifact[];
}

interface NativePlanningPart {
  readonly targets: readonly TargetPlatform[];
  readonly tasks: readonly GenerationTask[];
}

function nativeFilter(value?: string): TargetPlatform | undefined {
  return value === 'android' || value === 'ios' ? value : undefined;
}

function nativeLoadedConfiguration(
  loaded: LoadedVersionedConfiguration,
): LoadedConfiguration {
  if (loaded.config.schemaVersion === 1) {
    return { ...loaded, config: loaded.config };
  }
  return {
    ...loaded,
    config: {
      ...(loaded.config.$schema === undefined
        ? {}
        : { $schema: loaded.config.$schema }),
      schemaVersion: 1,
      ...(loaded.config.metadata === undefined
        ? {}
        : { metadata: loaded.config.metadata }),
      project: loaded.config.project,
      targets: nativeTargets(loaded.config),
      resources: nativeResources(loaded.config),
    },
  };
}

async function planNativePart(
  loaded: LoadedVersionedConfiguration,
  targetFilter?: string,
): Promise<NativePlanningPart> {
  const requestedNativeTarget = nativeFilter(targetFilter);
  if (targetFilter !== undefined && requestedNativeTarget === undefined) {
    return { targets: [], tasks: [] };
  }
  const targets = nativeTargets(loaded.config);
  const hasEnabledNativeTarget =
    targets.android?.enabled === true || targets.ios?.enabled === true;
  if (!hasEnabledNativeTarget && loaded.config.schemaVersion === 2) {
    return { targets: [], tasks: [] };
  }
  const plan = await createGenerationPlan(
    nativeLoadedConfiguration(loaded),
    requestedNativeTarget,
  );
  return { targets: plan.targets, tasks: plan.tasks };
}

function assertNoCompositeCollisions(
  artifacts: readonly CompositePlannedArtifact[],
): void {
  const destinations = new Map<string, CompositePlannedArtifact>();
  for (const artifact of artifacts) {
    const key = path.resolve(artifact.destination).toLocaleLowerCase('en-US');
    const previous = destinations.get(key);
    if (previous !== undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_COLLISION',
        message: 'Multiple generation tasks resolve to the same destination.',
        context: {
          destination: artifact.destination,
          taskIds: [previous.id, artifact.id],
        },
      });
    }
    destinations.set(key, artifact);
  }
}

export async function createCompositeGenerationPlan(
  loaded: LoadedVersionedConfiguration,
  registry: ResourceHandlerRegistry,
  context: PlanningContext,
  targetFilter?: string,
): Promise<CompositeGenerationPlan> {
  if (targetFilter !== undefined && nativeFilter(targetFilter) === undefined) {
    if (loaded.config.schemaVersion === 1) {
      throw new LoomError({
        code: 'LOOM_PLAN_TARGET_UNSUPPORTED',
        message: `Unsupported target "${targetFilter}".`,
        context: {
          target: targetFilter,
          supportedTargets: ['android', 'ios'],
        },
      });
    }
    selectCatalogTarget(loaded.config, targetFilter);
  }
  const nativePart = await planNativePart(loaded, targetFilter);
  const nativeTasks = nativePart.tasks;
  const catalogArtifacts =
    loaded.config.schemaVersion === 1
      ? []
      : await planCatalogResources(
          loaded.config,
          registry,
          context,
          targetFilter,
        );
  const artifacts: CompositePlannedArtifact[] = [
    ...nativeTasks,
    ...catalogArtifacts,
  ];
  artifacts.sort((left, right) =>
    loaded.config.schemaVersion === 1
      ? left.destination.localeCompare(right.destination)
      : compareCodePoints(left.destination, right.destination),
  );
  assertNoCompositeCollisions(artifacts);
  const selectedTargets =
    targetFilter === undefined
      ? [
          ...nativePart.targets,
          ...(loaded.config.schemaVersion === 1
            ? []
            : catalogTargetIds(loaded.config)),
        ]
      : [targetFilter];
  return {
    projectRoot: loaded.projectRoot,
    targets: [...new Set(selectedTargets)].sort(
      loaded.config.schemaVersion === 1 ? undefined : compareCodePoints,
    ),
    artifacts,
    nativeTasks,
    catalogArtifacts,
  };
}
