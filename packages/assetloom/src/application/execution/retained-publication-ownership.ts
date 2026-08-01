import path from 'node:path';
import { LoomError } from '../../domain/errors.js';
import type { AssetloomManifest } from '../../storage/manifest.js';
import type { MaterializedOwnedOutput } from '../../storage/owned-output-lifecycle.js';
import type {
  PreparedProjectFileChange,
} from './project-integration-lifecycle.js';
import type { StoredIntegrationReceipt } from './contracts.js';

function destinationIdentity(destination: string): string {
  return path.resolve(destination).toLocaleLowerCase('en-US');
}

export function assertNoRetainedPublicationOwnershipCollisions(options: {
  readonly authoredChanges: readonly PreparedProjectFileChange[];
  readonly generatedOutputs: readonly MaterializedOwnedOutput[];
  readonly previousManifest: AssetloomManifest;
  readonly previousReceipts: readonly StoredIntegrationReceipt[];
  readonly projectRoot: string;
  readonly selectedTargets: readonly string[];
}): void {
  const selectedTargets = new Set(options.selectedTargets);
  const retainedReceipts = new Map(
    options.previousReceipts
      .filter((receipt) => !selectedTargets.has(receipt.target))
      .map((receipt) => [
        destinationIdentity(path.resolve(options.projectRoot, receipt.destination)),
        receipt,
      ]),
  );
  for (const output of options.generatedOutputs) {
    const retained = retainedReceipts.get(
      destinationIdentity(output.destination),
    );
    if (retained !== undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_COLLISION',
        message:
          'A selected generated output collides with a retained authored destination.',
        context: {
          destination: output.destination,
          retainedArtifactId: retained.artifactId,
          retainedTarget: retained.target,
          taskId: output.artifactId,
          target: output.target,
        },
      });
    }
  }

  const retainedGenerated = new Map(
    Object.entries(options.previousManifest.files)
      .filter(([, entry]) => !selectedTargets.has(entry.target))
      .map(([relative, entry]) => [
        destinationIdentity(path.resolve(options.projectRoot, relative)),
        { entry, relative },
      ]),
  );
  for (const change of options.authoredChanges) {
    const retained = retainedGenerated.get(
      destinationIdentity(change.destination),
    );
    if (retained !== undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_COLLISION',
        message:
          'A selected authored change collides with a retained generated destination.',
        context: {
          destination: change.destination,
          retainedDestination: retained.relative,
          retainedTarget: retained.entry.target,
          retainedTaskId: retained.entry.taskId,
        },
      });
    }
  }
}
