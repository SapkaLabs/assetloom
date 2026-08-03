import type { JsonSafeValue } from '../../domain/generation-result.js';
import { compareCodePoints } from '../../domain/ordering.js';
import { sha256 } from '../../storage/hash.js';

export interface GenerationIntentManifestFile {
  readonly outputRootId?: string;
  readonly outputRootPath?: string;
  readonly path: string;
  readonly sha256: string;
  readonly target: string;
  readonly taskId: string;
}

export interface GenerationIntentOwnedOutput {
  readonly artifactId: string;
  readonly desiredSha256: string;
  readonly destination: string;
  readonly hashToken: string;
  readonly outputRootId: string;
  readonly outputRootPath: string;
  readonly relativePath: string;
  readonly resourceId: string;
  readonly role: string;
  readonly target: string;
}

export interface GenerationIntentUsageDescriptor {
  readonly artifactIds: readonly string[];
  readonly kind: string;
  readonly payload: JsonSafeValue;
  readonly targetId: string;
  readonly version: 1;
}

export interface PreparedGenerationIntent {
  readonly nextManifest: readonly GenerationIntentManifestFile[];
  readonly normalizedConfiguration: string;
  readonly ownedOutputs: readonly GenerationIntentOwnedOutput[];
  readonly configurationSchemaVersion: 1 | 2;
  readonly fingerprintVersion: 2;
  readonly selectedTargets: readonly string[];
  readonly targetFilter: string | null;
  readonly usage: readonly GenerationIntentUsageDescriptor[];
}

function canonicalJsonValue(value: JsonSafeValue): JsonSafeValue {
  if (Array.isArray(value)) {
    return value.map(canonicalJsonValue);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareCodePoints(left, right))
      .map(([key, child]) => [key, canonicalJsonValue(child)]),
  );
}

function byDestination(
  left: { readonly destination: string },
  right: { readonly destination: string },
): number {
  return compareCodePoints(left.destination, right.destination);
}

export function generationIntentFingerprint(
  intent: PreparedGenerationIntent,
): string {
  const canonical = {
    fingerprintVersion: intent.fingerprintVersion,
    configurationSchemaVersion: intent.configurationSchemaVersion,
    normalizedConfiguration: intent.normalizedConfiguration,
    targetFilter: intent.targetFilter,
    selectedTargets: [...intent.selectedTargets].sort(compareCodePoints),
    nextManifest: [...intent.nextManifest].sort((left, right) =>
      compareCodePoints(left.path, right.path),
    ),
    ownedOutputs: [...intent.ownedOutputs].sort(byDestination),
    usage: [...intent.usage]
      .sort((left, right) =>
        compareCodePoints(
          JSON.stringify([left.targetId, left.kind, left.version, left.artifactIds]),
          JSON.stringify([right.targetId, right.kind, right.version, right.artifactIds]),
        ),
      )
      .map((descriptor) => ({
        ...descriptor,
        artifactIds: [...descriptor.artifactIds].sort(compareCodePoints),
        payload: canonicalJsonValue(descriptor.payload),
      })),
  };
  return sha256(Buffer.from(JSON.stringify(canonical), 'utf8'));
}
