import path from 'node:path';
import {
  configuredOutputRootDefinitions,
  OutputRootRegistry,
  type OutputRootDefinition,
} from '../application/planning/output-root-registry.js';
import { LoomError } from '../domain/errors.js';
import type { LoadedVersionedConfiguration } from '../domain/types.js';
import { ProjectLock } from '../storage/lock.js';
import { ManifestStore, type AssetloomManifest } from '../storage/manifest.js';
import { OwnedOutputLifecycle } from '../storage/owned-output-lifecycle.js';
import { PendingGenerationStore } from '../storage/pending-generation-store.js';
import { ProjectStatePathGuard } from '../storage/state-path-guard.js';

export interface CleanV2Options {
  readonly target?: string;
}

export interface CleanV2Result {
  readonly removed: readonly string[];
}

function cleanupOutputRoots(
  loaded: LoadedVersionedConfiguration,
  manifest: AssetloomManifest,
): OutputRootRegistry {
  const definitions = new Map<string, OutputRootDefinition>(
    configuredOutputRootDefinitions(loaded).map((definition) => [definition.outputRootId, definition]),
  );
  for (const entry of Object.values(manifest.files)) {
    if (entry.outputRootId === undefined || entry.outputRootPath === undefined) {
      continue;
    }
    const root = path.resolve(loaded.projectRoot, entry.outputRootPath);
    const previous = definitions.get(entry.outputRootId);
    if (previous !== undefined &&
      (previous.targetId !== entry.target || path.resolve(previous.root) !== root)) {
      throw new LoomError({
        code: 'LOOM_MANIFEST_INVALID',
        message: 'Manifest output-root ownership conflicts with current configuration.',
        context: { outputRootId: entry.outputRootId, target: entry.target },
      });
    }
    definitions.set(entry.outputRootId, {
      outputRootId: entry.outputRootId,
      targetId: entry.target,
      root,
    });
  }
  return new OutputRootRegistry(loaded.projectRoot, [...definitions.values()]);
}

export async function cleanV2(
  loaded: LoadedVersionedConfiguration,
  options: CleanV2Options = {},
): Promise<CleanV2Result> {
  if (options.target !== undefined && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(options.target)) {
    throw new LoomError({
      code: 'LOOM_CLI_USAGE',
      message: `Invalid Assetloom target ID "${options.target}".`,
      context: { target: options.target },
    });
  }
  const stateDirectory = path.join(loaded.projectRoot, '.assetloom');
  const statePaths = new ProjectStatePathGuard(loaded.projectRoot, stateDirectory);
  const lock = new ProjectLock(stateDirectory, statePaths);
  await lock.acquire();
  try {
    await new PendingGenerationStore(stateDirectory, statePaths).assertNoPending('clean');
    const manifestStore = new ManifestStore(loaded.projectRoot, stateDirectory, {
      fileOrdering: 'code-point',
      statePaths,
    });
    const manifest = await manifestStore.load();
    const selectedTargets = options.target === undefined
      ? [...new Set(Object.values(manifest.files).map((entry) => entry.target))].sort()
      : [options.target];
    const lifecycle = new OwnedOutputLifecycle(
      loaded.projectRoot,
      cleanupOutputRoots(loaded, manifest),
    );
    const prepared = await lifecycle.prepare([], manifest, selectedTargets);
    const result = await lifecycle.publish(prepared);
    await manifestStore.save(prepared.manifest);
    return { removed: result.removed };
  } finally {
    await lock.release();
  }
}
