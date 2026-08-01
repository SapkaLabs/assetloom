import type { ArtifactOutputReference } from '../../domain/catalog/planning.js';
import { LoomError } from '../../domain/errors.js';
import type {
  CatalogArtifactOutputResolver,
  ResolvedCatalogArtifactOutput,
} from './contracts.js';

export class CatalogArtifactOutputMap implements CatalogArtifactOutputResolver {
  readonly #outputs = new Map<string, ResolvedCatalogArtifactOutput>();

  add(output: ResolvedCatalogArtifactOutput): void {
    if (this.#outputs.has(output.artifactId)) {
      throw new LoomError({
        code: 'LOOM_PLAN_COLLISION',
        message: 'Multiple catalog outputs use the same artifact ID.',
        context: { taskId: output.artifactId },
      });
    }
    this.#outputs.set(output.artifactId, output);
  }

  get(artifactId: string): ResolvedCatalogArtifactOutput {
    const output = this.#outputs.get(artifactId);
    if (output === undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'A catalog artifact references an output that is not available.',
        context: { artifactId },
      });
    }
    return output;
  }

  resolve(reference: ArtifactOutputReference): string | number | Uint8Array {
    const output = this.get(reference.artifactId);
    switch (reference.value) {
      case 'content':
        return output.content;
      case 'destination':
        return output.destination;
      case 'public-path':
        if (output.publicPath !== undefined) {
          return output.publicPath;
        }
        break;
      case 'file-name':
        return output.fileName;
      case 'sha256':
        return output.sha256;
      case 'width':
        if (output.width !== undefined) {
          return output.width;
        }
        break;
      case 'height':
        if (output.height !== undefined) {
          return output.height;
        }
        break;
    }
    throw new LoomError({
      code: 'LOOM_PLAN_INVALID',
      message: `Artifact output "${reference.value}" is not available.`,
      context: {
        artifactId: reference.artifactId,
        outputValue: reference.value,
      },
    });
  }

  values(): readonly ResolvedCatalogArtifactOutput[] {
    return [...this.#outputs.values()];
  }
}
