import path from 'node:path';
import { CatalogExecutor } from '../application/execution/catalog-executor.js';
import type { CatalogMaterializerRegistry } from '../application/execution/catalog-materializer-registry.js';
import type { NativeTaskExecutor } from '../application/execution/native-execution.js';
import type { ProjectIntegrationAdapterRegistry } from '../application/execution/contracts.js';
import { ProjectIntegrationLifecycle } from '../application/execution/project-integration-lifecycle.js';
import { assertNoRetainedPublicationOwnershipCollisions } from '../application/execution/retained-publication-ownership.js';
import { generationIntentFingerprint } from '../application/execution/generation-intent-fingerprint.js';
import {
  createCompositeGenerationPlan,
  type CompositeGenerationPlan,
} from '../application/planning/composite-planner.js';
import type { PlanningContext } from '../application/planning/contracts.js';
import type { ResourceHandlerRegistry } from '../application/planning/resource-handler-registry.js';
import { nativeResources, nativeTargets } from '../config/selection.js';
import { normalizeConfiguration } from '../config/normalize.js';
import { LoomError } from '../domain/errors.js';
import { compareCodePoints } from '../domain/ordering.js';
import type { LoadedConfiguration, LoadedVersionedConfiguration } from '../domain/types.js';
import { DefaultNativeTaskExecutor } from '../infrastructure/execution/native-task-executor.js';
import { SharpRenderer } from '../renderers/sharp-renderer.js';
import { ContentCache } from '../storage/cache.js';
import { FileSystemCatalogPublicationResolver } from '../storage/catalog-publication-resolver.js';
import { GitIgnoreManager } from '../storage/gitignore-manager.js';
import {
  IntegrationReceiptStore,
  integrationReceiptId,
} from '../storage/integration-receipt-store.js';
import { ProjectLock } from '../storage/lock.js';
import { ManifestStore, type AssetloomManifest } from '../storage/manifest.js';
import {
  OwnedOutputLifecycle,
  type MaterializedOwnedOutput,
} from '../storage/owned-output-lifecycle.js';
import { FileSystemProjectFileGateway } from '../storage/project-file-gateway.js';
import { ProjectStatePathGuard } from '../storage/state-path-guard.js';
import { PendingGenerationStore } from '../storage/pending-generation-store.js';
import { sha256 } from '../storage/hash.js';

export interface GenerateV2Dependencies {
  readonly integrationAdapters: ProjectIntegrationAdapterRegistry;
  readonly materializers: CatalogMaterializerRegistry;
  readonly nativeExecutor?: NativeTaskExecutor;
  readonly planningContext: PlanningContext;
  readonly resourceHandlers: ResourceHandlerRegistry;
}

export interface GenerateV2Options extends GenerateV2Dependencies {
  readonly target?: string;
}

export interface GenerateV2Result {
  readonly plan: CompositeGenerationPlan;
  readonly removed: readonly string[];
  readonly unchanged: readonly string[];
  readonly written: readonly string[];
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

function assertPublicationDestinations(
  owned: readonly { readonly destination: string }[],
  authored: readonly { readonly destination: string }[],
): void {
  const destinations = new Map<string, string>();
  for (const output of [...owned, ...authored]) {
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

function portableRelativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

function intendedManifestEntries(
  projectRoot: string,
  outputs: readonly MaterializedOwnedOutput[],
  previous: AssetloomManifest,
  selectedTargets: readonly string[],
): readonly {
  readonly path: string;
  readonly sha256: string;
  readonly target: string;
  readonly taskId: string;
}[] {
  const selectedTargetSet = new Set(selectedTargets);
  const files = new Map(
    Object.entries(previous.files)
      .filter(([, entry]) => !selectedTargetSet.has(entry.target))
      .map(([relativePath, entry]) => [relativePath, entry]),
  );
  for (const output of outputs) {
    files.set(portableRelativePath(projectRoot, output.destination), {
      sha256: sha256(output.content),
      target: output.target,
      taskId: output.artifactId,
    });
  }
  return [...files]
    .sort(([left], [right]) => compareCodePoints(left, right))
    .map(([relativePath, entry]) => ({ path: relativePath, ...entry }));
}

function normalizedGenerationConfiguration(
  loaded: LoadedVersionedConfiguration,
): string {
  return normalizeConfiguration({
    ...loaded.config,
    project: { root: '$PROJECT_ROOT' },
  });
}

export async function generateV2(
  loaded: LoadedVersionedConfiguration,
  options: GenerateV2Options,
): Promise<GenerateV2Result> {
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
    const manifestStore = new ManifestStore(
      loaded.projectRoot,
      stateDirectory,
      { fileOrdering: 'code-point', statePaths },
    );
    const receiptStore = new IntegrationReceiptStore(
      loaded.projectRoot,
      stateDirectory,
      statePaths,
    );
    const [previousManifest, previousReceiptDocument] = await Promise.all([
      manifestStore.load(),
      receiptStore.load(),
    ]);
    const files = new FileSystemProjectFileGateway(loaded.projectRoot);
    const integrationArtifacts = plan.catalogArtifacts.filter(
      (artifact) => artifact.operation === 'integrate-project',
    );
    const integrationSession = await new ProjectIntegrationLifecycle(
      loaded.projectRoot,
      options.integrationAdapters,
      files,
    ).open(
      integrationArtifacts,
      Object.values(previousReceiptDocument.receipts),
      plan.targets,
    );
    const cache = new ContentCache(stateDirectory, statePaths);
    const nativeExecutor =
      options.nativeExecutor ??
      new DefaultNativeTaskExecutor(new SharpRenderer(cache), files);
    const [native, catalog] = await Promise.all([
      nativeExecutor.prepare(
        plan.nativeTasks,
        nativeLoadedConfiguration(loaded),
      ),
      new CatalogExecutor({
        cache,
        integrations: integrationSession,
        materializers: options.materializers,
        normalizedConfiguration: options.planningContext.normalizedConfiguration,
        projectRoot: loaded.projectRoot,
        publications: new FileSystemCatalogPublicationResolver(),
      }).prepare(plan.catalogArtifacts),
    ]);
    const allOwned = [...native.ownedOutputs, ...catalog.ownedOutputs];
    const allAuthored = [
      ...native.integrations,
      ...catalog.integrations.changes,
    ];
    assertPublicationDestinations(allOwned, allAuthored);
    assertNoRetainedPublicationOwnershipCollisions({
      authoredChanges: allAuthored,
      generatedOutputs: allOwned,
      previousManifest,
      previousReceipts: Object.values(previousReceiptDocument.receipts),
      projectRoot: loaded.projectRoot,
      selectedTargets: plan.targets,
    });
    const nextReceiptDocument = {
      version: 1 as const,
      receipts: Object.fromEntries(
        catalog.integrations.receipts.map((receipt) => [
          integrationReceiptId(receipt),
          receipt,
        ]),
      ),
    };
    const intentFingerprint = generationIntentFingerprint({
      fingerprintVersion: 1,
      configurationSchemaVersion: 2,
      normalizedConfiguration: normalizedGenerationConfiguration(loaded),
      targetFilter: options.target ?? null,
      selectedTargets: plan.targets,
      nextManifest: intendedManifestEntries(
        loaded.projectRoot,
        allOwned,
        previousManifest,
        plan.targets,
      ),
      ownedOutputs: allOwned.map((output) => ({
        artifactId: output.artifactId,
        destination: portableRelativePath(
          loaded.projectRoot,
          output.destination,
        ),
        desiredSha256: sha256(output.content),
        target: output.target,
      })),
      catalogAuthored: catalog.integrations.changes.map((change) => ({
        destination: portableRelativePath(
          loaded.projectRoot,
          change.destination,
        ),
        desiredSha256: sha256(change.content),
      })),
      nextReceipts: catalog.integrations.receipts.map((receipt) => ({
        adapter: receipt.adapter,
        artifactId: receipt.artifactId,
        destination: receipt.destination,
        state: receipt.state,
        stateKey: receipt.stateKey,
        target: receipt.target,
      })),
      nativeAuthored: native.integrations.map((change) => ({
        destination: portableRelativePath(
          loaded.projectRoot,
          change.destination,
        ),
        desiredSha256: sha256(change.content),
      })),
    });
    const pendingIntent = {
      version: 1,
      fingerprint: intentFingerprint,
      selectedTargets: plan.targets,
    } as const;
    if (pending !== undefined) {
      await pendingStore.begin(pendingIntent);
      pendingIntentValidated = true;
    }

    const ownedLifecycle = new OwnedOutputLifecycle(loaded.projectRoot);
    const preparedOwned = await ownedLifecycle.prepare(
      allOwned,
      previousManifest,
      plan.targets,
    );
    if (pending === undefined) {
      await pendingStore.begin(pendingIntent);
    }

    const ownedResult = await ownedLifecycle.publish(preparedOwned);
    await manifestStore.save(preparedOwned.manifest);

    const catalogIntegrationResult = await integrationSession.publish(
      catalog.integrations,
    );
    await receiptStore.save(nextReceiptDocument);

    const nativeWritten: string[] = [];
    const nativeUnchanged: string[] = [];
    for (const change of native.integrations) {
      const disposition = await files.publish(
        change.destination,
        change.content,
        change.expectedSha256,
      );
      (disposition === 'written' ? nativeWritten : nativeUnchanged).push(
        change.destination,
      );
    }

    await new GitIgnoreManager(loaded.projectRoot).update(
      Object.keys(preparedOwned.manifest.files).map((relative) =>
        path.resolve(loaded.projectRoot, relative),
      ),
    );
    await pendingStore.clear(intentFingerprint);

    return {
      plan,
      written: [
        ...ownedResult.written,
        ...catalogIntegrationResult.written,
        ...nativeWritten,
      ],
      unchanged: [
        ...ownedResult.unchanged,
        ...catalogIntegrationResult.unchanged,
        ...nativeUnchanged,
      ],
      removed: ownedResult.removed,
    };
    } catch (cause) {
      if (!pendingIntentValidated && pending !== undefined) {
        throw pendingStore.recoveryRequiredForPreparation(
          pending,
          cause,
          options.target,
        );
      }
      throw cause;
    }
  } finally {
    await lock.release();
  }
}
