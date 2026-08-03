import type {
  DiagnosticV1,
  GenerationResultV1,
  PublishedArtifactV1,
  RemovedArtifactV1,
  UsageDescriptorV1,
} from '../../domain/generation-result.js';
import { validateGenerationResultV1 } from '../../domain/generation-result.js';
import { compareCodePoints } from '../../domain/ordering.js';
import type {
  PublishedOwnedOutputRecord,
  RemovedOwnedOutputRecord,
} from '../../storage/owned-output-lifecycle.js';

export interface BuildGenerationResultV1Input {
  readonly targets: readonly string[];
  readonly published: readonly PublishedOwnedOutputRecord[];
  readonly removed: readonly RemovedOwnedOutputRecord[];
  readonly usage: readonly UsageDescriptorV1[];
  readonly diagnostics: readonly DiagnosticV1[];
}

function artifactKey(artifact: PublishedOwnedOutputRecord): string {
  return [
    artifact.targetId,
    artifact.resourceId,
    artifact.role,
    artifact.outputRootId,
    artifact.relativePath,
    artifact.artifactId,
  ].join('\0');
}

function removedKey(artifact: RemovedOwnedOutputRecord): string {
  return [
    artifact.targetId,
    artifact.outputRootId,
    artifact.relativePath,
    artifact.artifactId,
  ].join('\0');
}

function usageKey(descriptor: UsageDescriptorV1): string {
  return [
    descriptor.targetId,
    descriptor.kind,
    String(descriptor.version),
    JSON.stringify(descriptor.artifactIds),
    JSON.stringify(descriptor.payload),
  ].join('\0');
}

function diagnosticKey(diagnostic: DiagnosticV1): string {
  return [diagnostic.severity, diagnostic.code, diagnostic.message].join('\0');
}

function publishedArtifact(record: PublishedOwnedOutputRecord): PublishedArtifactV1 {
  return {
    artifactId: record.artifactId,
    resourceId: record.resourceId,
    targetId: record.targetId,
    role: record.role,
    outputRootId: record.outputRootId,
    relativePath: record.relativePath,
    ...(record.publicPath === undefined ? {} : { publicPath: record.publicPath }),
    disposition: record.disposition,
    ...(record.mediaType === undefined ? {} : { mediaType: record.mediaType }),
    ...(record.width === undefined ? {} : { width: record.width }),
    ...(record.height === undefined ? {} : { height: record.height }),
    sizeBytes: record.sizeBytes,
    contentHash: {
      algorithm: 'sha256',
      value: record.sha256,
      token: record.hashToken,
    },
  };
}

function removedArtifact(record: RemovedOwnedOutputRecord): RemovedArtifactV1 {
  return {
    artifactId: record.artifactId,
    targetId: record.targetId,
    outputRootId: record.outputRootId,
    relativePath: record.relativePath,
    disposition: 'removed',
    contentHash: { algorithm: 'sha256', value: record.sha256 },
  };
}

export function buildGenerationResultV1(
  input: BuildGenerationResultV1Input,
): GenerationResultV1 {
  const result: GenerationResultV1 = {
    resultVersion: 1,
    targets: [...new Set(input.targets)].sort(compareCodePoints),
    artifacts: [...input.published]
      .sort((left, right) => compareCodePoints(artifactKey(left), artifactKey(right)))
      .map(publishedArtifact),
    removed: [...input.removed]
      .sort((left, right) => compareCodePoints(removedKey(left), removedKey(right)))
      .map(removedArtifact),
    usage: [...input.usage].sort((left, right) =>
      compareCodePoints(usageKey(left), usageKey(right)),
    ),
    diagnostics: [...input.diagnostics].sort((left, right) =>
      compareCodePoints(diagnosticKey(left), diagnosticKey(right)),
    ),
  };
  return validateGenerationResultV1(result);
}
