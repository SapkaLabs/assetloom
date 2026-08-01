import type {
  CatalogPlannedArtifact,
  IntegrateProjectArtifact,
} from '../../domain/catalog/planning.js';
import { LoomError } from '../../domain/errors.js';
import { compareCodePoints } from '../../domain/ordering.js';
import type { MaterializedOwnedOutput } from '../../storage/owned-output-lifecycle.js';
import { CatalogArtifactOutputMap } from './artifact-output-map.js';
import type { CatalogMaterializerRegistry } from './catalog-materializer-registry.js';
import type {
  CatalogContentCache,
  CatalogPublicationResolver,
  ResolvedCatalogArtifactOutput,
} from './contracts.js';
import type {
  PreparedIntegrationPublication,
  ProjectIntegrationSession,
} from './project-integration-lifecycle.js';

export interface PreparedCatalogExecution {
  readonly integrations: PreparedIntegrationPublication;
  readonly outputs: CatalogArtifactOutputMap;
  readonly ownedOutputs: readonly MaterializedOwnedOutput[];
  readonly resolvedOutputs: readonly ResolvedCatalogArtifactOutput[];
}

export interface CatalogExecutorOptions {
  readonly cache: CatalogContentCache;
  readonly integrations: ProjectIntegrationSession;
  readonly materializers: CatalogMaterializerRegistry;
  readonly normalizedConfiguration: string;
  readonly projectRoot: string;
  readonly publications: CatalogPublicationResolver;
}

function orderedArtifacts(
  artifacts: readonly CatalogPlannedArtifact[],
): readonly CatalogPlannedArtifact[] {
  const byId = new Map<string, CatalogPlannedArtifact>();
  for (const artifact of artifacts) {
    if (byId.has(artifact.id)) {
      throw new LoomError({
        code: 'LOOM_PLAN_COLLISION',
        message: 'Multiple catalog artifacts use the same artifact ID.',
        context: { taskId: artifact.id },
      });
    }
    byId.set(artifact.id, artifact);
  }

  const remainingDependencies = new Map<string, Set<string>>();
  const dependants = new Map<string, string[]>();
  for (const artifact of artifacts) {
    const dependencies = new Set(artifact.dependsOn);
    if (dependencies.has(artifact.id)) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'A catalog artifact cannot depend on itself.',
        context: { taskId: artifact.id },
      });
    }
    for (const dependency of dependencies) {
      if (!byId.has(dependency)) {
        throw new LoomError({
          code: 'LOOM_PLAN_INVALID',
          message: 'A catalog artifact depends on an artifact outside the plan.',
          context: { dependency, taskId: artifact.id },
        });
      }
      const consumers = dependants.get(dependency) ?? [];
      consumers.push(artifact.id);
      dependants.set(dependency, consumers);
    }
    remainingDependencies.set(artifact.id, dependencies);
  }

  const ready = artifacts
    .filter((artifact) => artifact.dependsOn.length === 0)
    .map((artifact) => artifact.id)
    .sort(compareCodePoints);
  const result: CatalogPlannedArtifact[] = [];
  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) {
      break;
    }
    const artifact = byId.get(id);
    if (artifact === undefined) {
      throw new LoomError({
        code: 'LOOM_INTERNAL',
        message: 'A catalog artifact disappeared during dependency sorting.',
        context: { taskId: id },
      });
    }
    result.push(artifact);
    for (const dependant of dependants.get(id) ?? []) {
      const dependencies = remainingDependencies.get(dependant);
      dependencies?.delete(id);
      if (dependencies?.size === 0) {
        ready.push(dependant);
        ready.sort(compareCodePoints);
      }
    }
  }
  if (result.length !== artifacts.length) {
    const cyclic = [...remainingDependencies]
      .filter(([, dependencies]) => dependencies.size > 0)
      .map(([id]) => id)
      .sort(compareCodePoints);
    throw new LoomError({
      code: 'LOOM_PLAN_INVALID',
      message: 'The catalog artifact dependency graph contains a cycle.',
      context: { artifacts: cyclic.join(',') },
    });
  }
  return result;
}

function integrationArtifacts(
  artifacts: readonly CatalogPlannedArtifact[],
): readonly IntegrateProjectArtifact[] {
  return artifacts.filter(
    (artifact): artifact is IntegrateProjectArtifact =>
      artifact.operation === 'integrate-project',
  );
}

export class CatalogExecutor {
  readonly #options: CatalogExecutorOptions;

  constructor(options: CatalogExecutorOptions) {
    this.#options = options;
  }

  async prepare(
    artifacts: readonly CatalogPlannedArtifact[],
  ): Promise<PreparedCatalogExecution> {
    const outputs = new CatalogArtifactOutputMap();
    const ownedOutputs: MaterializedOwnedOutput[] = [];
    const integrationDestinations = new Set(
      integrationArtifacts(artifacts).map((artifact) =>
        artifact.destination.toLocaleLowerCase('en-US'),
      ),
    );

    for (const artifact of orderedArtifacts(artifacts)) {
      if (artifact.operation === 'integrate-project') {
        const prepared = await this.#options.integrations.apply(
          artifact,
          outputs,
        );
        const publishedCopy =
          artifact.integration.adapter === 'web-app-manifest'
            ? artifact.integration.publishedCopy
            : undefined;
        if (publishedCopy !== undefined) {
          const publication = this.#options.publications.resolveIntegrationResult(
            artifact,
            publishedCopy,
            prepared.content,
          );
          outputs.add(publication.output);
          const authoredDestinationKey = artifact.destination.toLocaleLowerCase('en-US');
          this.#appendOwnedOutputs(
            artifact.target,
            publication.output.artifactId,
            publication.output.content,
            publication.ownedDestinations.filter(
              (destination) =>
                destination.toLocaleLowerCase('en-US') !== authoredDestinationKey,
            ),
            ownedOutputs,
            integrationDestinations,
          );
        }
        continue;
      }

      const materialized = await this.#options.materializers.materialize(
        artifact,
        {
          projectRoot: this.#options.projectRoot,
          normalizedConfiguration: this.#options.normalizedConfiguration,
          cache: this.#options.cache,
          outputs,
        },
      );
      const publication = this.#options.publications.resolveGenerated(
        artifact,
        materialized,
      );
      outputs.add(publication.output);
      this.#appendOwnedOutputs(
        artifact.target,
        artifact.id,
        publication.output.content,
        publication.ownedDestinations,
        ownedOutputs,
        integrationDestinations,
      );
    }

    return {
      integrations: this.#options.integrations.finalize(),
      outputs,
      ownedOutputs,
      resolvedOutputs: outputs.values(),
    };
  }

  #appendOwnedOutputs(
    target: string,
    artifactId: string,
    content: Uint8Array,
    destinations: readonly string[],
    outputs: MaterializedOwnedOutput[],
    integrationDestinations: ReadonlySet<string>,
  ): void {
    const existing = new Set(
      outputs.map((output) =>
        output.destination.toLocaleLowerCase('en-US'),
      ),
    );
    for (const destination of destinations) {
      const key = destination.toLocaleLowerCase('en-US');
      if (existing.has(key) || integrationDestinations.has(key)) {
        throw new LoomError({
          code: 'LOOM_PLAN_COLLISION',
          message: 'Catalog publications resolve to the same destination.',
          context: { destination, taskId: artifactId },
        });
      }
      existing.add(key);
      outputs.push({ artifactId, content, destination, target });
    }
  }
}
