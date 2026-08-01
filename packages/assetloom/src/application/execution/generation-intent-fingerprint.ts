import type { JsonValue } from '../../domain/catalog/planning.js';
import { compareCodePoints } from '../../domain/ordering.js';
import { sha256 } from '../../storage/hash.js';

export interface GenerationIntentManifestFile {
  readonly path: string;
  readonly sha256: string;
  readonly target: string;
  readonly taskId: string;
}

export interface GenerationIntentOwnedOutput {
  readonly artifactId: string;
  readonly desiredSha256: string;
  readonly destination: string;
  readonly target: string;
}

export interface GenerationIntentAuthoredChange {
  readonly desiredSha256: string;
  readonly destination: string;
}

export interface GenerationIntentReceipt {
  readonly adapter: string;
  readonly artifactId: string;
  readonly destination: string;
  readonly state: JsonValue;
  readonly stateKey: string;
  readonly target: string;
}

export interface PreparedGenerationIntent {
  readonly catalogAuthored: readonly GenerationIntentAuthoredChange[];
  readonly nativeAuthored: readonly GenerationIntentAuthoredChange[];
  readonly nextManifest: readonly GenerationIntentManifestFile[];
  readonly nextReceipts: readonly GenerationIntentReceipt[];
  readonly normalizedConfiguration: string;
  readonly ownedOutputs: readonly GenerationIntentOwnedOutput[];
  readonly configurationSchemaVersion: 2;
  readonly fingerprintVersion: 1;
  readonly selectedTargets: readonly string[];
  readonly targetFilter: string | null;
}

function canonicalJsonValue(value: JsonValue): JsonValue {
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
    catalogAuthored: [...intent.catalogAuthored].sort(byDestination),
    nextReceipts: [...intent.nextReceipts]
      .sort((left, right) =>
        compareCodePoints(
          JSON.stringify([
            left.target,
            left.adapter,
            left.stateKey,
            left.destination,
          ]),
          JSON.stringify([
            right.target,
            right.adapter,
            right.stateKey,
            right.destination,
          ]),
        ),
      )
      .map((receipt) => ({
        ...receipt,
        state: canonicalJsonValue(receipt.state),
      })),
    nativeAuthored: [...intent.nativeAuthored].sort(byDestination),
  };
  return sha256(Buffer.from(JSON.stringify(canonical), 'utf8'));
}
