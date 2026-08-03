import type { CatalogPlannedArtifact, PlannedJsonValue } from '../../domain/catalog/planning.js';
import type { JsonSafeValue, UsageDescriptorV1 } from '../../domain/generation-result.js';
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

export interface PreparedCatalogExecution {
  readonly outputs: CatalogArtifactOutputMap;
  readonly ownedOutputs: readonly MaterializedOwnedOutput[];
  readonly resolvedOutputs: readonly ResolvedCatalogArtifactOutput[];
  readonly usage: readonly UsageDescriptorV1[];
}

export interface CatalogExecutorOptions {
  readonly cache: CatalogContentCache;
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

function mediaType(destination: string): string | undefined {
  const extension = destination.split('.').pop()?.toLocaleLowerCase('en-US');
  return (
    {
      css: 'text/css',
      ico: 'image/x-icon',
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
      json: 'application/json',
      png: 'image/png',
      svg: 'image/svg+xml',
      webp: 'image/webp',
      woff: 'font/woff',
      woff2: 'font/woff2',
    } as const
  )[extension ?? ''];
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

    for (const artifact of orderedArtifacts(artifacts)) {
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
        artifact,
        publication.output,
        publication.ownedDestinations,
        ownedOutputs,
      );
    }

    return {
      outputs,
      ownedOutputs,
      resolvedOutputs: outputs.values(),
      usage: artifacts.flatMap((artifact) =>
        (artifact.usage ?? []).map((descriptor) => ({
          ...descriptor,
          artifactIds: [...new Set(descriptor.artifactIds)].sort(compareCodePoints),
          payload: this.#resolveUsageValue(descriptor.payload, outputs),
        })),
      ),
    };
  }

  #resolveUsageValue(
    value: PlannedJsonValue,
    outputs: CatalogArtifactOutputMap,
  ): JsonSafeValue {
    if (Array.isArray(value)) {
      return (value as readonly PlannedJsonValue[]).map((item) =>
        this.#resolveUsageValue(item, outputs),
      );
    }
    if (value !== null && typeof value === 'object') {
      const record = value as { readonly kind?: string };
      if (record.kind === 'artifact-output') {
        const reference = value as Extract<PlannedJsonValue, { readonly kind: 'artifact-output' }>;
        const resolved = outputs.resolve(reference);
        if (resolved instanceof Uint8Array) {
          throw new LoomError({
            code: 'LOOM_PLAN_INVALID',
            message: 'Usage descriptors cannot embed artifact bytes.',
            context: { artifactId: reference.artifactId },
          });
        }
        return resolved;
      }
      if (record.kind === 'interpolated') {
        const interpolated = value as Extract<PlannedJsonValue, { readonly kind: 'interpolated' }>;
        return interpolated.parts
          .map((part) => typeof part === 'string' ? part : String(outputs.resolve(part)))
          .join('');
      }
      return Object.fromEntries(
        Object.entries(value as Readonly<Record<string, PlannedJsonValue>>)
          .sort(([left], [right]) => compareCodePoints(left, right))
          .map(([key, item]) => [key, this.#resolveUsageValue(item, outputs)]),
      );
    }
    return value;
  }

  #appendOwnedOutputs(
    artifact: CatalogPlannedArtifact,
    resolved: ResolvedCatalogArtifactOutput,
    destinations: readonly string[],
    outputs: MaterializedOwnedOutput[],
  ): void {
    const existing = new Set(
      outputs.map((output) =>
        output.destination.toLocaleLowerCase('en-US'),
      ),
    );
    for (const [index, destination] of destinations.entries()) {
      const key = destination.toLocaleLowerCase('en-US');
      if (existing.has(key)) {
        throw new LoomError({
          code: 'LOOM_PLAN_COLLISION',
          message: 'Catalog publications resolve to the same destination.',
          context: { destination, taskId: artifact.id },
        });
      }
      existing.add(key);
      const primary = index === 0;
      const resolvedMediaType = artifact.mediaType ?? mediaType(destination);
      outputs.push({
        artifactId: primary
          ? resolved.artifactId
          : `${resolved.artifactId}:fallback-${index}`,
        resourceId: artifact.resourceId,
        role:
          artifact.role ??
          `${artifact.resourceType}.${artifact.operation}${primary ? '' : '.fallback'}`,
        content: resolved.content,
        destination,
        target: artifact.target,
        ...(primary && artifact.outputRootId !== undefined
          ? { outputRootId: artifact.outputRootId }
          : {}),
        ...(primary && artifact.relativePath !== undefined
          ? { relativePath: artifact.relativePath }
          : {}),
        ...(primary && resolved.publicPath !== undefined
          ? { publicPath: resolved.publicPath }
          : {}),
        ...(resolvedMediaType === undefined
          ? {}
          : { mediaType: resolvedMediaType }),
        ...(resolved.width === undefined ? {} : { width: resolved.width }),
        ...(resolved.height === undefined ? {} : { height: resolved.height }),
        hashToken: resolved.hashToken,
      });
    }
  }
}
