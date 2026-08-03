import { LoomError } from '../../domain/errors.js';
import type {
  CatalogMaterializationContext,
  CatalogMaterializerRegistrations,
  GeneratedCatalogArtifact,
  MaterializedCatalogContent,
} from './contracts.js';

export class CatalogMaterializerRegistry {
  readonly #materializers: CatalogMaterializerRegistrations;

  constructor(materializers: CatalogMaterializerRegistrations) {
    this.#materializers = Object.freeze({ ...materializers });
  }

  async materialize(
    artifact: GeneratedCatalogArtifact,
    context: CatalogMaterializationContext,
  ): Promise<MaterializedCatalogContent> {
    switch (artifact.operation) {
      case 'copy-file': {
        const materializer = this.#materializers['copy-file'];
        this.#assertRegistered(materializer, artifact);
        return materializer.materialize(artifact, context);
      }
      case 'transform-svg': {
        const materializer = this.#materializers['transform-svg'];
        this.#assertRegistered(materializer, artifact);
        return materializer.materialize(artifact, context);
      }
      case 'render-image': {
        const materializer = this.#materializers['render-image'];
        this.#assertRegistered(materializer, artifact);
        return materializer.materialize(artifact, context);
      }
      case 'write-text': {
        const materializer = this.#materializers['write-text'];
        this.#assertRegistered(materializer, artifact);
        return materializer.materialize(artifact, context);
      }
    }
  }

  #assertRegistered<TMaterializer>(
    materializer: TMaterializer | undefined,
    artifact: GeneratedCatalogArtifact,
  ): asserts materializer is TMaterializer {
    if (materializer === undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: `No catalog materializer is registered for "${artifact.operation}".`,
        context: { taskId: artifact.id, operation: artifact.operation },
      });
    }
  }
}
