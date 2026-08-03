import type {
  CatalogPlannedArtifact,
} from '../../domain/catalog/planning.js';
import type {
  CatalogResourceDefinition,
} from '../../domain/catalog/resources.js';
import type { ResolvedSource, SourceDefinition } from '../../domain/catalog/sources.js';
import type { ResolvedCatalogTarget } from '../../domain/catalog/targets.js';

export interface SourceResolver {
  resolve(
    source: SourceDefinition,
    jsonPointer: string,
  ): Promise<readonly ResolvedSource[]>;
}

export interface ValidationContext {
  readonly projectRoot: string;
  readonly normalizedConfiguration: string;
}

export interface PlanningContext extends ValidationContext {
  readonly sourceResolver: SourceResolver;
  resolveTarget(targetId: string): ResolvedCatalogTarget;
}

export interface ResourceHandler<
  TResource extends CatalogResourceDefinition,
> {
  readonly type: TResource['type'];
  validate(resource: TResource, context: ValidationContext): void;
  plan(
    resourceId: string,
    resource: TResource,
    context: PlanningContext,
  ): Promise<readonly CatalogPlannedArtifact[]>;
}
