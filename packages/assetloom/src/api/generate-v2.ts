import path from 'node:path';
import { CatalogExecutor } from '../application/execution/catalog-executor.js';
import type { CatalogMaterializerRegistry } from '../application/execution/catalog-materializer-registry.js';
import { buildGenerationResultV1 } from '../application/execution/generation-result-builder.js';
import { generationIntentFingerprint } from '../application/execution/generation-intent-fingerprint.js';
import { createCompositeGenerationPlan, type CompositeGenerationPlan } from '../application/planning/composite-planner.js';
import type { PlanningContext } from '../application/planning/contracts.js';
import { configuredOutputRootRegistry } from '../application/planning/output-root-registry.js';
import type { ResourceHandlerRegistry } from '../application/planning/resource-handler-registry.js';
import { nativeResources, nativeTargets } from '../config/selection.js';
import { normalizeConfiguration } from '../config/normalize.js';
import { LoomError } from '../domain/errors.js';
import type { GenerationResultV1, UsageDescriptorV1 } from '../domain/generation-result.js';
import { compareCodePoints } from '../domain/ordering.js';
import type { LoadedConfiguration, LoadedVersionedConfiguration } from '../domain/types.js';
import { DefaultNativeTaskExecutor } from '../infrastructure/execution/native-task-executor.js';
import { SharpRenderer } from '../renderers/sharp-renderer.js';
import { ContentCache } from '../storage/cache.js';
import { FileSystemCatalogPublicationResolver } from '../storage/catalog-publication-resolver.js';
import { sha256 } from '../storage/hash.js';
import { ProjectLock } from '../storage/lock.js';
import { ManifestStore, type AssetloomManifest } from '../storage/manifest.js';
import { OwnedOutputLifecycle, type MaterializedOwnedOutput } from '../storage/owned-output-lifecycle.js';
import { PendingGenerationStore } from '../storage/pending-generation-store.js';
import { ProjectStatePathGuard } from '../storage/state-path-guard.js';

export interface GenerateV2Dependencies {
  readonly materializers: CatalogMaterializerRegistry;
  readonly planningContext: PlanningContext;
  readonly resourceHandlers: ResourceHandlerRegistry;
}

export interface GenerateV2Options extends GenerateV2Dependencies {
  readonly target?: string;
}

export type GenerateVersionedOptions = GenerateV2Options;

export interface GenerateV2Result {
  readonly plan: CompositeGenerationPlan;
  readonly removed: readonly string[];
  readonly unchanged: readonly string[];
  readonly written: readonly string[];
}

interface ExecutedGenerationV2 extends GenerateV2Result {
  readonly result: GenerationResultV1;
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
      ...(loaded.config.$schema === undefined ? {} : { $schema: loaded.config.$schema }),
      schemaVersion: 1,
      ...(loaded.config.metadata === undefined ? {} : { metadata: loaded.config.metadata }),
      project: loaded.config.project,
      targets: nativeTargets(loaded.config),
      resources: nativeResources(loaded.config),
    },
  };
}

function portableRelativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

function assertUniqueDestinations(outputs: readonly MaterializedOwnedOutput[]): void {
  const destinations = new Map<string, string>();
  for (const output of outputs) {
    const key = path.resolve(output.destination).toLocaleLowerCase('en-US');
    const previous = destinations.get(key);
    if (previous !== undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_COLLISION',
        message: 'Multiple prepared publications resolve to the same destination.',
        context: { destination: output.destination, previous },
      });
    }
    destinations.set(key, output.destination);
  }
}

function intendedManifestEntries(
  projectRoot: string,
  outputs: readonly MaterializedOwnedOutput[],
  previous: AssetloomManifest,
  selectedTargets: readonly string[],
) {
  const selected = new Set(selectedTargets);
  const files = new Map(
    Object.entries(previous.files)
      .filter(([, entry]) => !selected.has(entry.target))
      .map(([relativePath, entry]) => [relativePath, entry]),
  );
  for (const output of outputs) {
    files.set(portableRelativePath(projectRoot, output.destination), {
      ...(output.outputRootId === undefined ? {} : { outputRootId: output.outputRootId }),
      ...(output.outputRootPath === undefined ? {} : { outputRootPath: output.outputRootPath }),
      sha256: sha256(output.content),
      target: output.target,
      taskId: output.artifactId,
    });
  }
  return [...files]
    .sort(([left], [right]) => compareCodePoints(left, right))
    .map(([relativePath, entry]) => ({ path: relativePath, ...entry }));
}

function normalizedGenerationConfiguration(loaded: LoadedVersionedConfiguration): string {
  return normalizeConfiguration({ ...loaded.config, project: { root: '$PROJECT_ROOT' } });
}

function nativeMediaType(format: string | undefined): string | undefined {
  return ({
    directory: 'application/vnd.apple.icon-composer',
    json: 'application/json',
    png: 'image/png',
    webp: 'image/webp',
    xml: 'application/xml',
  } as const)[format ?? ''];
}

function deterministicUsage(usage: readonly UsageDescriptorV1[]): readonly UsageDescriptorV1[] {
  const unique = new Map<string, UsageDescriptorV1>();
  for (const descriptor of usage) {
    const normalized = {
      ...descriptor,
      artifactIds: [...new Set(descriptor.artifactIds)].sort(compareCodePoints),
    };
    unique.set(JSON.stringify(normalized), normalized);
  }
  return [...unique.values()].sort((left, right) =>
    compareCodePoints(JSON.stringify(left), JSON.stringify(right)),
  );
}

async function executeGenerationV2(
  loaded: LoadedVersionedConfiguration,
  options: GenerateV2Options,
): Promise<ExecutedGenerationV2> {
  const stateDirectory = path.join(loaded.projectRoot, '.assetloom');
  const statePaths = new ProjectStatePathGuard(loaded.projectRoot, stateDirectory);
  const lock = new ProjectLock(stateDirectory, statePaths);
  await lock.acquire();
  try {
    const pendingStore = new PendingGenerationStore(stateDirectory, statePaths);
    const pending = await pendingStore.load();
    let pendingIntentValidated = pending === undefined;
    try {
      const plan = await createCompositeGenerationPlan(
        loaded,
        options.resourceHandlers,
        options.planningContext,
        options.target,
      );
      const manifestStore = new ManifestStore(loaded.projectRoot, stateDirectory, {
        fileOrdering: 'code-point',
        statePaths,
      });
      const previousManifest = await manifestStore.load();
      const cache = new ContentCache(stateDirectory, statePaths);
      const [native, catalog] = await Promise.all([
        new DefaultNativeTaskExecutor(new SharpRenderer(cache)).prepare(
          plan.nativeTasks,
          nativeLoadedConfiguration(loaded),
        ),
        new CatalogExecutor({
          cache,
          materializers: options.materializers,
          normalizedConfiguration: options.planningContext.normalizedConfiguration,
          projectRoot: loaded.projectRoot,
          publications: new FileSystemCatalogPublicationResolver(),
        }).prepare(plan.catalogArtifacts),
      ]);

      const nativeTasks = new Map(plan.nativeTasks.map((task) => [task.id, task]));
      const nativeOwned = native.ownedOutputs.map((output) => {
        const baseId = output.artifactId.split(':').slice(0, 3).join(':');
        const task = nativeTasks.get(output.artifactId) ?? nativeTasks.get(baseId);
        const resolvedMediaType = nativeMediaType(task?.format);
        return {
          ...output,
          resourceId: task?.resourceId ?? output.artifactId,
          role: `native.${task?.resourceType ?? 'resource'}.${task?.operation ?? 'output'}`,
          ...(resolvedMediaType === undefined ? {} : { mediaType: resolvedMediaType }),
          ...(task?.width === undefined ? {} : { width: task.width }),
          ...(task?.height === undefined ? {} : { height: task.height }),
        };
      });

      const roots = configuredOutputRootRegistry(loaded);
      const ownedLifecycle = new OwnedOutputLifecycle(loaded.projectRoot, roots);
      const normalizedPreviousManifest = await ownedLifecycle.normalizeManifest(previousManifest);
      const allOwned = await Promise.all(
        [...nativeOwned, ...catalog.ownedOutputs].map(async (output) => {
          const identity = await roots.identify(output.target, output.destination);
          const root = roots.definition(identity.outputRootId).root;
          const rootRelative = portableRelativePath(loaded.projectRoot, root);
          return {
            ...output,
            resourceId: output.resourceId ?? output.artifactId,
            role: output.role ?? 'assetloom.output',
            outputRootId: identity.outputRootId,
            outputRootPath: rootRelative === '' ? '.' : rootRelative,
            relativePath: identity.relativePath,
            hashToken: output.hashToken ?? sha256(output.content),
          };
        }),
      );
      assertUniqueDestinations(allOwned);
      const usage = deterministicUsage([...native.usage, ...catalog.usage]);
      const intentFingerprint = generationIntentFingerprint({
        fingerprintVersion: 2,
        configurationSchemaVersion: loaded.config.schemaVersion,
        normalizedConfiguration: normalizedGenerationConfiguration(loaded),
        targetFilter: options.target ?? null,
        selectedTargets: plan.targets,
        nextManifest: intendedManifestEntries(
          loaded.projectRoot,
          allOwned,
          normalizedPreviousManifest,
          plan.targets,
        ),
        ownedOutputs: allOwned.map((output) => ({
          artifactId: output.artifactId,
          destination: portableRelativePath(loaded.projectRoot, output.destination),
          desiredSha256: sha256(output.content),
          hashToken: output.hashToken,
          outputRootId: output.outputRootId,
          outputRootPath: output.outputRootPath,
          relativePath: output.relativePath,
          resourceId: output.resourceId,
          role: output.role,
          target: output.target,
        })),
        usage,
      });
      const pendingIntent = { version: 2, fingerprint: intentFingerprint, selectedTargets: plan.targets } as const;
      if (pending !== undefined) {
        await pendingStore.begin(pendingIntent);
        pendingIntentValidated = true;
      }

      const preparedOwned = await ownedLifecycle.prepare(
        allOwned,
        normalizedPreviousManifest,
        plan.targets,
        { recoverMatchingPendingIntent: pending !== undefined },
      );
      if (pending === undefined) {
        await pendingStore.begin(pendingIntent);
      }
      const ownedResult = await ownedLifecycle.publish(preparedOwned);
      await manifestStore.save(preparedOwned.manifest);
      const result = buildGenerationResultV1({
        targets: plan.targets,
        published: ownedResult.published,
        removed: ownedResult.removedArtifacts,
        usage,
        diagnostics: [],
      });
      await pendingStore.clear(intentFingerprint);
      return {
        plan,
        result,
        written: ownedResult.written,
        unchanged: ownedResult.unchanged,
        removed: ownedResult.removed,
      };
    } catch (cause) {
      if (!pendingIntentValidated && pending !== undefined) {
        throw pendingStore.recoveryRequiredForPreparation(pending, cause, options.target);
      }
      throw cause;
    }
  } finally {
    await lock.release();
  }
}

export async function generateV2(
  loaded: LoadedVersionedConfiguration,
  options: GenerateV2Options,
): Promise<GenerateV2Result> {
  const executed = await executeGenerationV2(loaded, options);
  return {
    plan: executed.plan,
    written: executed.written,
    unchanged: executed.unchanged,
    removed: executed.removed,
  };
}

/** Authoritative portable publish-and-describe Node API. */
export async function generateVersioned(
  loaded: LoadedVersionedConfiguration,
  options: GenerateVersionedOptions,
): Promise<GenerationResultV1> {
  return (await executeGenerationV2(loaded, options)).result;
}
