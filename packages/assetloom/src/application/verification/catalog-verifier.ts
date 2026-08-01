import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CatalogPlannedArtifact,
  IntegrateProjectArtifact,
} from '../../domain/catalog/planning.js';
import { LoomError } from '../../domain/errors.js';
import { compareCodePoints } from '../../domain/ordering.js';
import type { AssetloomManifest } from '../../storage/manifest.js';
import { sha256 } from '../../storage/hash.js';
import type {
  CatalogArtifactVerifier,
  ProjectFileGateway,
  ProjectIntegrationAdapterRegistry,
  ResolvedCatalogArtifactOutput,
  StoredIntegrationReceipt,
} from '../execution/contracts.js';
import type { PreparedCatalogExecution } from '../execution/catalog-executor.js';

export interface CatalogVerificationResult {
  readonly checked: readonly string[];
}

export interface CatalogVerifierOptions {
  readonly artifacts: readonly CatalogPlannedArtifact[];
  readonly execution: PreparedCatalogExecution;
  readonly files: ProjectFileGateway;
  readonly integrations: ProjectIntegrationAdapterRegistry;
  readonly manifest: AssetloomManifest;
  readonly projectRoot: string;
  readonly receipts: readonly StoredIntegrationReceipt[];
  readonly selectedTargets: readonly string[];
  readonly structuralVerifiers?: readonly CatalogArtifactVerifier[];
}

function relative(projectRoot: string, destination: string): string {
  return path.relative(projectRoot, destination).split(path.sep).join('/');
}

function integrationReceipt(
  artifact: IntegrateProjectArtifact,
  projectRoot: string,
  receipts: readonly StoredIntegrationReceipt[],
): StoredIntegrationReceipt | undefined {
  const destination = relative(projectRoot, artifact.destination);
  return receipts.find(
    (receipt) =>
      receipt.adapter === artifact.integration.adapter &&
      receipt.destination === destination &&
      receipt.stateKey === artifact.integration.stateKey &&
      receipt.target === artifact.target,
  );
}

async function readOwnedOutput(
  expected: ResolvedCatalogArtifactOutput,
): Promise<Uint8Array> {
  try {
    return await readFile(expected.destination);
  } catch (cause) {
    throw new LoomError({
      code: 'LOOM_VERIFY_FAILED',
      message: 'A planned catalog output is missing.',
      cause,
      context: {
        destination: expected.destination,
        taskId: expected.artifactId,
      },
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
      const content = await readOwnedOutput({
        artifactId: owned.artifactId,
        content: owned.content,
        destination: owned.destination,
        fileName: path.basename(owned.destination),
        sha256: sha256(owned.content),
      });
      const digest = sha256(content);
      const entry = options.manifest.files[relativePath];
      if (
        entry === undefined ||
        entry.sha256 !== digest ||
        entry.sha256 !== sha256(owned.content) ||
        entry.taskId !== owned.artifactId ||
        entry.target !== owned.target
      ) {
        throw new LoomError({
          code: 'LOOM_VERIFY_FAILED',
          message: 'A generated catalog output does not match its manifest entry.',
          context: { destination: owned.destination, taskId: owned.artifactId },
        });
      }
      checked.push(owned.destination);
    }

    const selectedTargets = new Set(options.selectedTargets);
    const unexpected = Object.entries(options.manifest.files).find(
      ([relativePath, entry]) =>
        selectedTargets.has(entry.target) && !expectedManifestPaths.has(relativePath),
    );
    if (unexpected !== undefined) {
      throw new LoomError({
        code: 'LOOM_VERIFY_FAILED',
        message: 'The manifest contains an unexpected output for a selected target.',
        context: { destination: path.resolve(options.projectRoot, unexpected[0]) },
      });
    }

    for (const artifact of options.artifacts) {
      if (artifact.operation === 'integrate-project') {
        const receipt = integrationReceipt(
          artifact,
          options.projectRoot,
          options.receipts,
        );
        if (receipt === undefined) {
          throw new LoomError({
            code: 'LOOM_VERIFY_FAILED',
            message: 'A planned project integration has no ownership receipt.',
            context: { destination: artifact.destination, taskId: artifact.id },
          });
        }
        const current = await options.files.inspect(artifact.destination);
        await options.integrations.verify(
          artifact,
          current.content,
          receipt.state,
          options.execution.outputs,
        );
        checked.push(artifact.destination);
        continue;
      }

      const expected = outputById.get(artifact.id);
      if (expected === undefined) {
        throw new LoomError({
          code: 'LOOM_INTERNAL',
          message: 'A generated catalog artifact has no resolved output.',
          context: { taskId: artifact.id },
        });
      }
      const actualContent = await readOwnedOutput(expected);
      const actual = { ...expected, content: actualContent };
      for (const verifier of options.structuralVerifiers ?? []) {
        await verifier.verify(artifact, actual);
      }
    }

    const plannedIntegrationKeys = new Set(
      options.artifacts
        .filter(
          (artifact): artifact is IntegrateProjectArtifact =>
            artifact.operation === 'integrate-project',
        )
        .map((artifact) =>
          JSON.stringify([
            artifact.target,
            artifact.integration.adapter,
            artifact.integration.stateKey,
            relative(options.projectRoot, artifact.destination),
          ]),
        ),
    );
    const unexpectedReceipt = options.receipts.find(
      (receipt) =>
        selectedTargets.has(receipt.target) &&
        !plannedIntegrationKeys.has(
          JSON.stringify([
            receipt.target,
            receipt.adapter,
            receipt.stateKey,
            receipt.destination,
          ]),
        ),
    );
    if (unexpectedReceipt !== undefined) {
      throw new LoomError({
        code: 'LOOM_VERIFY_FAILED',
        message: 'An unexpected project-integration receipt exists for a selected target.',
        context: {
          destination: path.resolve(
            options.projectRoot,
            unexpectedReceipt.destination,
          ),
          taskId: unexpectedReceipt.artifactId,
        },
      });
    }

    return { checked: [...new Set(checked)].sort(compareCodePoints) };
  }
}
