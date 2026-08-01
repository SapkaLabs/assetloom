import { TextEncoder } from 'node:util';
import type {
  CatalogArtifactForOperation,
  CatalogArtifactMaterializer,
  CatalogMaterializationContext,
} from '../../application/execution/contracts.js';

type TextArtifact = CatalogArtifactForOperation<'write-text'>;

export class WriteTextMaterializer
implements CatalogArtifactMaterializer<TextArtifact> {
  readonly operation = 'write-text' as const;

  materialize(
    artifact: TextArtifact,
    context: CatalogMaterializationContext,
  ): Promise<{ readonly content: Uint8Array }> {
    const value =
      typeof artifact.content === 'string'
        ? artifact.content
        : context.outputs.resolve(artifact.content);
    return Promise.resolve({
      content:
        value instanceof Uint8Array
          ? value
          : new TextEncoder().encode(String(value)),
    });
  }
}
