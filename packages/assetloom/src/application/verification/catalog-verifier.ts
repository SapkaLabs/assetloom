import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CatalogPlannedArtifact } from '../../domain/catalog/planning.js';
import { LoomError } from '../../domain/errors.js';
import { compareCodePoints } from '../../domain/ordering.js';
import { sha256 } from '../../storage/hash.js';
import type { AssetloomManifest } from '../../storage/manifest.js';
import type { PreparedCatalogExecution } from '../execution/catalog-executor.js';
import type { CatalogArtifactVerifier, ResolvedCatalogArtifactOutput } from '../execution/contracts.js';

export interface CatalogVerificationResult {
  readonly checked: readonly string[];
}

export interface CatalogVerifierOptions {
  readonly artifacts: readonly CatalogPlannedArtifact[];
  readonly execution: PreparedCatalogExecution;
  readonly manifest: AssetloomManifest;
  readonly projectRoot: string;
  readonly selectedTargets: readonly string[];
  readonly structuralVerifiers?: readonly CatalogArtifactVerifier[];
}

function relative(projectRoot: string, destination: string): string {
  return path.relative(projectRoot, destination).split(path.sep).join('/');
}

async function readOwnedOutput(expected: ResolvedCatalogArtifactOutput): Promise<Uint8Array> {
  try {
    return await readFile(expected.destination);
  } catch (cause) {
    throw new LoomError({
      code: 'LOOM_VERIFY_FAILED',
      message: 'A planned catalog output is missing.',
      cause,
      context: { destination: expected.destination, taskId: expected.artifactId },
    });
  }
}

export class CatalogVerifier {
  async verify(options: CatalogVerifierOptions): Promise<CatalogVerificationResult> {
    const checked: string[] = [];
    const expectedManifestPaths = new Set<string>();
    const outputById = new Map(
      options.execution.resolvedOutputs.map((output) => [output.artifactId, output]),
    );

    for (const owned of options.execution.ownedOutputs) {
      const relativePath = relative(options.projectRoot, owned.destination);
      expectedManifestPaths.add(relativePath);
      const actual = await readOwnedOutput({
        artifactId: owned.artifactId,
        content: owned.content,
        destination: owned.destination,
        fileName: path.basename(owned.destination),
        sha256: sha256(owned.content),
        hashToken: sha256(owned.content),
      });
      const digest = sha256(actual);
      const entry = options.manifest.files[relativePath];
      if (entry === undefined || entry.sha256 !== digest ||
        entry.sha256 !== sha256(owned.content) || entry.taskId !== owned.artifactId ||
        entry.target !== owned.target) {
        throw new LoomError({
          code: 'LOOM_VERIFY_FAILED',
          message: 'A generated catalog output does not match its manifest entry.',
          context: { destination: owned.destination, taskId: owned.artifactId },
        });
      }
      checked.push(owned.destination);
    }

    const selected = new Set(options.selectedTargets);
    const unexpected = Object.entries(options.manifest.files).find(
      ([relativePath, entry]) => selected.has(entry.target) && !expectedManifestPaths.has(relativePath),
    );
    if (unexpected !== undefined) {
      throw new LoomError({
        code: 'LOOM_VERIFY_FAILED',
        message: 'The manifest contains an unexpected output for a selected target.',
        context: { destination: path.resolve(options.projectRoot, unexpected[0]) },
      });
    }

    for (const artifact of options.artifacts) {
      const expected = outputById.get(artifact.id);
      if (expected === undefined) {
        throw new LoomError({
          code: 'LOOM_INTERNAL',
          message: 'A generated catalog artifact has no resolved output.',
          context: { taskId: artifact.id },
        });
      }
      const actual = { ...expected, content: await readOwnedOutput(expected) };
      for (const verifier of options.structuralVerifiers ?? []) {
        await verifier.verify(artifact, actual);
      }
    }
    return { checked: [...new Set(checked)].sort(compareCodePoints) };
  }
}
