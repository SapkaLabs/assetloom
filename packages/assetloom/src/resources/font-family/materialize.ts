import { TextEncoder } from 'node:util';
import type {
  CatalogArtifactForOperation,
  CatalogArtifactMaterializer,
  CatalogMaterializationContext,
} from '../../application/execution/contracts.js';
import type { PlannedJsonValue } from '../../domain/catalog/planning.js';

type TextArtifact = CatalogArtifactForOperation<'write-text'>;

function resolveValue(
  value: PlannedJsonValue,
  context: CatalogMaterializationContext,
): unknown {
  if (Array.isArray(value)) {
    return (value as readonly PlannedJsonValue[]).map((item) =>
      resolveValue(item, context),
    );
  }
  if (value !== null && typeof value === 'object') {
    const record = value as { readonly kind?: string };
    if (record.kind === 'artifact-output') {
      return context.outputs.resolve(
        value as Extract<PlannedJsonValue, { readonly kind: 'artifact-output' }>,
      );
    }
    if (record.kind === 'interpolated') {
      const interpolated = value as Extract<PlannedJsonValue, { readonly kind: 'interpolated' }>;
      return interpolated.parts
        .map((part) => typeof part === 'string' ? part : String(context.outputs.resolve(part)))
        .join('');
    }
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, PlannedJsonValue>>)
        .map(([key, item]) => [key, resolveValue(item, context)]),
    );
  }
  return value;
}

export class WriteTextMaterializer
implements CatalogArtifactMaterializer<TextArtifact> {
  readonly operation = 'write-text' as const;

  materialize(
    artifact: TextArtifact,
    context: CatalogMaterializationContext,
  ): Promise<{ readonly content: Uint8Array }> {
    const value = typeof artifact.content === 'string'
      ? artifact.content
      : artifact.content.kind === 'json-template'
        ? `${JSON.stringify(resolveValue(artifact.content.value, context), null, 2)}\n`
        : context.outputs.resolve(artifact.content);
    return Promise.resolve({
      content:
        value instanceof Uint8Array
          ? value
          : new TextEncoder().encode(String(value)),
    });
  }
}
