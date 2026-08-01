import { LoomError } from '../../domain/errors.js';
import type { JsonValue } from '../../domain/catalog/planning.js';

export type JsonObject = Readonly<Record<string, JsonValue>>;

export interface ManagedJsonResult {
  readonly content: string;
  readonly managed: JsonObject;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return (
    typeof value === 'object' &&
    Object.values(value).every(isJsonValue)
  );
}

function parseObject(content: string, destination: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isJsonValue(parsed) || !isJsonObject(parsed)) {
      throw new TypeError('The JSON root must be an object.');
    }
    return parsed;
  } catch (cause) {
    throw new LoomError({
      code: 'LOOM_WRITE_CONFLICT',
      message: 'Refusing to integrate an invalid JSON project file.',
      cause,
      context: { destination },
    });
  }
}

function equal(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function applyManagedJsonFields(
  content: string,
  desired: JsonObject,
  previous: JsonObject | undefined,
  destination: string,
): ManagedJsonResult {
  const current = parseObject(content, destination);
  const next: Record<string, JsonValue> = { ...current };

  if (previous !== undefined) {
    for (const [key, previousValue] of Object.entries(previous)) {
      const currentMatchesPrevious = equal(current[key], previousValue);
      const desiredHasKey = Object.hasOwn(desired, key);
      const currentMatchesDesired = desiredHasKey
        ? equal(current[key], desired[key])
        : !Object.hasOwn(current, key);
      if (!currentMatchesPrevious && !currentMatchesDesired) {
        throw new LoomError({
          code: 'LOOM_WRITE_CONFLICT',
          message: 'Refusing to replace a project integration changed after generation.',
          context: { destination, field: key },
        });
      }
      if (!Object.hasOwn(desired, key)) {
        Reflect.deleteProperty(next, key);
      }
    }
  }

  for (const [key, desiredValue] of Object.entries(desired)) {
    if (
      !Object.hasOwn(previous ?? {}, key) &&
      Object.hasOwn(current, key) &&
      !equal(current[key], desiredValue)
    ) {
      throw new LoomError({
        code: 'LOOM_WRITE_CONFLICT',
        message: 'Refusing to replace an unowned project integration.',
        context: { destination, field: key },
      });
    }
    next[key] = desiredValue;
  }

  return {
    content: `${JSON.stringify(next, null, 2)}\n`,
    managed: { ...desired },
  };
}
