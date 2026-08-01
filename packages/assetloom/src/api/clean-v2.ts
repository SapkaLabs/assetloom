import path from 'node:path';
import type { ProjectIntegrationAdapterRegistry } from '../application/execution/contracts.js';
import { ProjectIntegrationLifecycle } from '../application/execution/project-integration-lifecycle.js';
import { LoomError } from '../domain/errors.js';
import type { LoadedVersionedConfiguration } from '../domain/types.js';
import { GitIgnoreManager } from '../storage/gitignore-manager.js';
import { IntegrationReceiptStore, integrationReceiptId } from '../storage/integration-receipt-store.js';
import { ProjectLock } from '../storage/lock.js';
import { ManifestStore } from '../storage/manifest.js';
import { OwnedOutputLifecycle } from '../storage/owned-output-lifecycle.js';
import { FileSystemProjectFileGateway } from '../storage/project-file-gateway.js';
import { ProjectStatePathGuard } from '../storage/state-path-guard.js';
import { PendingGenerationStore } from '../storage/pending-generation-store.js';

export interface CleanV2Options {
  readonly integrationAdapters: ProjectIntegrationAdapterRegistry;
  readonly target?: string;
}

export interface CleanV2Result {
  readonly removed: readonly string[];
  readonly unchangedIntegrations: readonly string[];
  readonly updatedIntegrations: readonly string[];
}

export async function cleanV2(
  loaded: LoadedVersionedConfiguration,
  options: CleanV2Options,
): Promise<CleanV2Result> {
  if (
    options.target !== undefined &&
    !/^[A-Za-z][A-Za-z0-9_-]*$/.test(options.target)
  ) {
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
    await new PendingGenerationStore(
      stateDirectory,
      statePaths,
    ).assertNoPending('clean');
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
    const selectedTargets =
      options.target === undefined
        ? [
            ...new Set([
              ...Object.values(manifest.files).map((entry) => entry.target),
              ...Object.values(receiptDocument.receipts).map(
                (receipt) => receipt.target,
              ),
            ]),
          ].sort()
        : [options.target];
    const files = new FileSystemProjectFileGateway(loaded.projectRoot);
    const integrationSession = await new ProjectIntegrationLifecycle(
      loaded.projectRoot,
      options.integrationAdapters,
      files,
    ).open([], Object.values(receiptDocument.receipts), selectedTargets);
    const preparedIntegrations = integrationSession.finalize();
    const ownedLifecycle = new OwnedOutputLifecycle(loaded.projectRoot);
    const preparedOwned = await ownedLifecycle.prepare(
      [],
      manifest,
      selectedTargets,
    );

    const ownedResult = await ownedLifecycle.publish(preparedOwned);
    const integrationResult = await integrationSession.publish(
      preparedIntegrations,
    );
    await manifestStore.save(preparedOwned.manifest);
    await receiptStore.save({
      version: 1,
      receipts: Object.fromEntries(
        preparedIntegrations.receipts.map((receipt) => [
          integrationReceiptId(receipt),
          receipt,
        ]),
      ),
    });
    await new GitIgnoreManager(loaded.projectRoot).update(
      Object.keys(preparedOwned.manifest.files).map((relative) =>
        path.resolve(loaded.projectRoot, relative),
      ),
    );
    return {
      removed: ownedResult.removed,
      unchangedIntegrations: integrationResult.unchanged,
      updatedIntegrations: integrationResult.written,
    };
  } finally {
    await lock.release();
  }
}
