import path from 'node:path';
import { CatalogExecutor } from '../application/execution/catalog-executor.js';
import type { CatalogMaterializerRegistry } from '../application/execution/catalog-materializer-registry.js';
import type {
  CatalogArtifactVerifier,
  ProjectIntegrationAdapterRegistry,
} from '../application/execution/contracts.js';
import { ProjectIntegrationLifecycle } from '../application/execution/project-integration-lifecycle.js';
import { createCompositeGenerationPlan } from '../application/planning/composite-planner.js';
import type { PlanningContext } from '../application/planning/contracts.js';
import type { ResourceHandlerRegistry } from '../application/planning/resource-handler-registry.js';
import { CatalogVerifier } from '../application/verification/catalog-verifier.js';
import {
  catalogTargetIds,
  nativeResources,
  nativeTargets,
} from '../config/selection.js';
import type {
  LoadedConfiguration,
  LoadedVersionedConfiguration,
  VerificationResult,
} from '../domain/types.js';
import { ContentCache } from '../storage/cache.js';
import { FileSystemCatalogPublicationResolver } from '../storage/catalog-publication-resolver.js';
import { IntegrationReceiptStore } from '../storage/integration-receipt-store.js';
import { ProjectLock } from '../storage/lock.js';
import { ManifestStore } from '../storage/manifest.js';
import { FileSystemProjectFileGateway } from '../storage/project-file-gateway.js';
import { ProjectStatePathGuard } from '../storage/state-path-guard.js';
import { PendingGenerationStore } from '../storage/pending-generation-store.js';
import { verify as verifyNativeV1 } from '../verification/index.js';

export interface VerifyV2Options {
  readonly integrationAdapters: ProjectIntegrationAdapterRegistry;
  readonly materializers: CatalogMaterializerRegistry;
  readonly native?: boolean;
  readonly planningContext: PlanningContext;
  readonly resourceHandlers: ResourceHandlerRegistry;
  readonly structuralVerifiers?: readonly CatalogArtifactVerifier[];
  readonly target?: string;
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

function selectedCatalogTargets(
  loaded: LoadedVersionedConfiguration,
  target: string | undefined,
): readonly string[] {
  if (loaded.config.schemaVersion === 1) {
    return [];
  }
  const configured = catalogTargetIds(loaded.config);
  if (target === undefined) {
    return configured;
  }
  return configured.some((configuredTarget) => configuredTarget === target)
    ? [target]
    : [];
}

export async function verifyV2(
  loaded: LoadedVersionedConfiguration,
  options: VerifyV2Options,
): Promise<VerificationResult> {
  const plan = await createCompositeGenerationPlan(
    loaded,
    options.resourceHandlers,
    options.planningContext,
    options.target,
  );
  const stateDirectory = path.join(loaded.projectRoot, '.assetloom');
  const statePaths = new ProjectStatePathGuard(loaded.projectRoot, stateDirectory);
  const lock = new ProjectLock(stateDirectory, statePaths);
  await lock.acquire();
  try {
    await new PendingGenerationStore(
      stateDirectory,
      statePaths,
    ).assertNoPending('verify');
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
    const [manifest, receiptDocument] = await Promise.all([
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
      Object.values(receiptDocument.receipts),
      plan.targets,
    );
    const catalogExecution = await new CatalogExecutor({
      cache: new ContentCache(stateDirectory, statePaths),
      integrations: integrationSession,
      materializers: options.materializers,
      normalizedConfiguration: options.planningContext.normalizedConfiguration,
      projectRoot: loaded.projectRoot,
      publications: new FileSystemCatalogPublicationResolver(),
    }).prepare(plan.catalogArtifacts);
    const catalogResult = await new CatalogVerifier().verify({
      artifacts: plan.catalogArtifacts,
      execution: catalogExecution,
      files,
      integrations: options.integrationAdapters,
      manifest,
      projectRoot: loaded.projectRoot,
      receipts: Object.values(receiptDocument.receipts),
      selectedTargets: selectedCatalogTargets(loaded, options.target),
      ...(options.structuralVerifiers === undefined
        ? {}
        : { structuralVerifiers: options.structuralVerifiers }),
    });

    let nativeResult: VerificationResult = {
      ok: true,
      checked: [],
      skippedNativeChecks: [],
    };
    if (plan.nativeTasks.length > 0) {
      const nativeTarget =
        options.target === 'android' || options.target === 'ios'
          ? options.target
          : undefined;
      nativeResult = await verifyNativeV1(nativeLoadedConfiguration(loaded), {
        ...(nativeTarget === undefined ? {} : { target: nativeTarget }),
        ...(options.native === undefined ? {} : { native: options.native }),
      });
    }
    return {
      ok: true,
      checked: [...nativeResult.checked, ...catalogResult.checked],
      skippedNativeChecks: nativeResult.skippedNativeChecks,
    };
  } finally {
    await lock.release();
  }
}
