import { LoomError } from '../domain/errors.js';
import type {
  ConfigurationProvenance,
  ProvenanceEntry,
} from '../domain/types.js';

export interface ConfigurationDocument {
  readonly file: string;
  readonly value: Readonly<Record<string, unknown>>;
}

export interface MergeResult {
  readonly value: Record<string, unknown>;
  readonly provenance: ConfigurationProvenance;
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cloneValue(child)]),
    );
  }

  return value;
}

function deleteProvenanceSubtree(
  provenance: Map<string, ProvenanceEntry>,
  pointer: string,
): void {
  for (const key of provenance.keys()) {
    if (key === pointer || key.startsWith(`${pointer}/`)) {
      provenance.delete(key);
    }
  }
}

function recordProvenance(
  value: unknown,
  pointer: string,
  entry: ProvenanceEntry,
  provenance: Map<string, ProvenanceEntry>,
): void {
  provenance.set(pointer, entry);
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      recordProvenance(child, `${pointer}/${index}`, entry, provenance);
    });
  } else if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      recordProvenance(
        child,
        `${pointer}/${escapePointer(key)}`,
        entry,
        provenance,
      );
    }
  }
}

function mergeObject(
  target: Record<string, unknown>,
  source: Readonly<Record<string, unknown>>,
  pointer: string,
  entry: ProvenanceEntry,
  provenance: Map<string, ProvenanceEntry>,
): void {
  for (const [key, sourceValue] of Object.entries(source)) {
    const childPointer = `${pointer}/${escapePointer(key)}`;

    if (sourceValue === null) {
      Reflect.deleteProperty(target, key);
      deleteProvenanceSubtree(provenance, childPointer);
      continue;
    }

    const targetValue = target[key];
    if (isObject(sourceValue) && isObject(targetValue)) {
      provenance.set(childPointer, entry);
      mergeObject(targetValue, sourceValue, childPointer, entry, provenance);
      continue;
    }

    const cloned = cloneValue(sourceValue);
    target[key] = cloned;
    deleteProvenanceSubtree(provenance, childPointer);
    recordProvenance(cloned, childPointer, entry, provenance);
  }
}

export function mergeConfigurations(
  documents: readonly ConfigurationDocument[],
): MergeResult {
  if (documents.length === 0) {
    throw new LoomError({
      code: 'LOOM_CFG_MERGE',
      message: 'At least one Assetloom configuration file is required.',
    });
  }

  try {
    const value: Record<string, unknown> = {};
    const provenance = new Map<string, ProvenanceEntry>();

    documents.forEach((document, configurationIndex) => {
      const entry: ProvenanceEntry = {
        file: document.file,
        configurationIndex,
      };
      provenance.set('', entry);
      mergeObject(value, document.value, '', entry, provenance);
    });

    return { value, provenance };
  } catch (error) {
    if (error instanceof LoomError) {
      throw error;
    }
    throw new LoomError({
      code: 'LOOM_CFG_MERGE',
      message: 'Failed to merge Assetloom configuration files.',
      cause: error,
    });
  }
}
