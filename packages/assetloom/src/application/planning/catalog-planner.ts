import path from 'node:path';
import {
  catalogResources,
  selectCatalogTarget,
} from '../../config/selection.js';
import { LoomError } from '../../domain/errors.js';
import type { CatalogPlannedArtifact } from '../../domain/catalog/planning.js';
import { catalogResourceTargetIds } from '../../domain/catalog/resources.js';
import { compareCodePoints } from '../../domain/ordering.js';
import type { AssetloomConfigurationV2 } from '../../domain/types.js';
import type { PlanningContext } from './contracts.js';
import type { ResourceHandlerRegistry } from './resource-handler-registry.js';

function assertNoCatalogCollisions(
  artifacts: readonly CatalogPlannedArtifact[],
): void {
  const destinations = new Map<string, CatalogPlannedArtifact>();
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

export async function planCatalogResources(
  config: AssetloomConfigurationV2,
  registry: ResourceHandlerRegistry,
  context: PlanningContext,
  targetFilter?: string,
): Promise<readonly CatalogPlannedArtifact[]> {
  const artifacts: CatalogPlannedArtifact[] = [];
  const resources = [...catalogResources(config)].sort(
    ([left], [right]) => compareCodePoints(left, right),
  );
  for (const [resourceId, resource] of resources) {
    for (const target of catalogResourceTargetIds(resource)) {
      selectCatalogTarget(config, target);
    }
    if (
      targetFilter !== undefined &&
      !catalogResourceTargetIds(resource).includes(targetFilter)
    ) {
      continue;
    }
    const planned = await registry.plan(resourceId, resource, context);
    artifacts.push(
      ...planned.filter(
        (artifact) =>
          targetFilter === undefined || artifact.target === targetFilter,
      ),
    );
  }
  artifacts.sort((left, right) =>
    compareCodePoints(left.destination, right.destination),
  );
  assertNoCatalogCollisions(artifacts);
  return artifacts;
}
