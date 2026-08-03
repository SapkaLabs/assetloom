import type { VersionedAssetloomConfiguration } from '../domain/types.js';
import { compareCodePoints } from '../domain/ordering.js';

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodePoints(left, right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function normalizeConfiguration(
  config: VersionedAssetloomConfiguration,
): string {
  return JSON.stringify(stableValue(config));
}
