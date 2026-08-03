import path from 'node:path';
import { CatalogExecutor } from '../application/execution/catalog-executor.js';
import type { CatalogMaterializerRegistry } from '../application/execution/catalog-materializer-registry.js';
import type { CatalogArtifactVerifier } from '../application/execution/contracts.js';
import { createCompositeGenerationPlan } from '../application/planning/composite-planner.js';
import type { PlanningContext } from '../application/planning/contracts.js';
import type { ResourceHandlerRegistry } from '../application/planning/resource-handler-registry.js';
import { CatalogVerifier } from '../application/verification/catalog-verifier.js';
import { catalogTargetIds, nativeResources, nativeTargets } from '../config/selection.js';
import type { LoadedConfiguration, LoadedVersionedConfiguration, VerificationResult } from '../domain/types.js';
import { ContentCache } from '../storage/cache.js';
import { FileSystemCatalogPublicationResolver } from '../storage/catalog-publication-resolver.js';
import { ProjectLock } from '../storage/lock.js';
import { ManifestStore } from '../storage/manifest.js';
import { PendingGenerationStore } from '../storage/pending-generation-store.js';
import { ProjectStatePathGuard } from '../storage/state-path-guard.js';
import { verify as verifyNativeV1 } from '../verification/index.js';

export interface VerifyV2Options {
  readonly materializers: CatalogMaterializerRegistry;
  readonly native?: boolean;
  readonly planningContext: PlanningContext;
  readonly resourceHandlers: ResourceHandlerRegistry;
  readonly structuralVerifiers?: readonly CatalogArtifactVerifier[];
  readonly target?: string;
}

function nativeLoadedConfiguration(loaded: LoadedVersionedConfiguration): LoadedConfiguration {
  if (loaded.config.schemaVersion === 1) return { ...loaded, config: loaded.config };
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

function selectedCatalogTargets(loaded: LoadedVersionedConfiguration, target?: string): readonly string[] {
  if (loaded.config.schemaVersion === 1) return [];
  const configured = catalogTargetIds(loaded.config);
  return target === undefined ? configured : configured.filter((candidate) => candidate === target);
}

export async function verifyV2(
  loaded: LoadedVersionedConfiguration,
  options: VerifyV2Options,
): Promise<VerificationResult> {
  const plan = await createCompositeGenerationPlan(
    loaded, options.resourceHandlers, options.planningContext, options.target,
  );
  const stateDirectory = path.join(loaded.projectRoot, '.assetloom');
  const statePaths = new ProjectStatePathGuard(loaded.projectRoot, stateDirectory);
  const lock = new ProjectLock(stateDirectory, statePaths);
  await lock.acquire();
  try {
    await new PendingGenerationStore(stateDirectory, statePaths).assertNoPending('verify');
    const manifest = await new ManifestStore(loaded.projectRoot, stateDirectory, {
      fileOrdering: 'code-point', statePaths,
    }).load();
    const execution = await new CatalogExecutor({
      cache: new ContentCache(stateDirectory, statePaths),
      materializers: options.materializers,
      normalizedConfiguration: options.planningContext.normalizedConfiguration,
      projectRoot: loaded.projectRoot,
      publications: new FileSystemCatalogPublicationResolver(),
    }).prepare(plan.catalogArtifacts);
    const catalog = await new CatalogVerifier().verify({
      artifacts: plan.catalogArtifacts,
      execution,
      manifest,
      projectRoot: loaded.projectRoot,
      selectedTargets: selectedCatalogTargets(loaded, options.target),
      ...(options.structuralVerifiers === undefined ? {} : { structuralVerifiers: options.structuralVerifiers }),
    });
    const nativeTarget = options.target === 'android' || options.target === 'ios' ? options.target : undefined;
    const native = plan.nativeTasks.length === 0
      ? { ok: true as const, checked: [], skippedNativeChecks: [] }
      : await verifyNativeV1(nativeLoadedConfiguration(loaded), {
          ...(nativeTarget === undefined ? {} : { target: nativeTarget }),
          ...(options.native === undefined ? {} : { native: options.native }),
        });
    return {
      ok: true,
      checked: [...native.checked, ...catalog.checked],
      skippedNativeChecks: native.skippedNativeChecks,
    };
  } finally {
    await lock.release();
  }
}
