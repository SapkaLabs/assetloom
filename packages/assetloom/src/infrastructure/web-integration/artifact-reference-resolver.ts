import { LoomError } from '../../domain/errors.js';
import type {
  ArtifactOutputReference,
  IntegrationJsonValue,
  IntegrationValue,
  JsonValue,
} from '../../domain/catalog/planning.js';

export type ArtifactReferenceResolver = (
  reference: ArtifactOutputReference,
) => string | number;

function isInterpolated(
  value: object,
): value is { readonly kind: 'interpolated'; readonly parts: readonly (string | ArtifactOutputReference)[] } {
  return 'kind' in value && value.kind === 'interpolated' && 'parts' in value;
}

function isArtifactReference(value: object): value is ArtifactOutputReference {
  return (
    'kind' in value &&
    value.kind === 'artifact-output' &&
    'artifactId' in value &&
    typeof value.artifactId === 'string' &&
    'value' in value &&
    typeof value.value === 'string'
  );
}

function isIntegrationArray(
  value: IntegrationJsonValue,
): value is readonly IntegrationJsonValue[] {
  return Array.isArray(value);
}

function isIntegrationObject(
  value: IntegrationJsonValue,
): value is Readonly<Record<string, IntegrationJsonValue>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !isIntegrationArray(value) &&
    !isInterpolated(value) &&
    !isArtifactReference(value)
  );
}

export function resolveIntegrationValue(
  value: IntegrationValue,
  resolve: ArtifactReferenceResolver,
): string {
  if (typeof value === 'string') {
    return value;
  }
  if (isInterpolated(value)) {
    return value.parts
      .map((part) =>
        typeof part === 'string' ? part : String(resolve(part)),
      )
      .join('');
  }
  if (isArtifactReference(value)) {
    return String(resolve(value));
  }
  throw new LoomError({
    code: 'LOOM_PLAN_INVALID',
    message: 'Integration value is not resolvable.',
  });
}

export function resolveIntegrationJsonValue(
  value: IntegrationJsonValue,
  resolve: ArtifactReferenceResolver,
): JsonValue {
  if (isIntegrationArray(value)) {
    return value.map((item) => resolveIntegrationJsonValue(item, resolve));
  }
  if (typeof value === 'object' && value !== null && isInterpolated(value)) {
    return resolveIntegrationValue(value, resolve);
  }
  if (typeof value === 'object' && value !== null && isArtifactReference(value)) {
    if (value.value === 'content') {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'Binary artifact content cannot be embedded in JSON integration.',
        context: { artifactId: value.artifactId },
      });
    }
    return resolve(value);
  }
  if (isIntegrationObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        resolveIntegrationJsonValue(child, resolve),
      ]),
    );
  }
  return value;
}
