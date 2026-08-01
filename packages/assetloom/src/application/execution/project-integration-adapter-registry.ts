import { LoomError } from '../../domain/errors.js';
import type { IntegrateProjectArtifact, JsonValue } from '../../domain/catalog/planning.js';
import type {
  IntegrationArtifactForAdapter,
  CatalogArtifactOutputResolver,
  PreparedProjectIntegration,
  ProjectIntegrationAdapter,
  ProjectIntegrationAdapterRegistrations,
  ProjectIntegrationAdapterRegistry,
  StoredIntegrationReceipt,
} from './contracts.js';

export class DefaultProjectIntegrationAdapterRegistry
  implements ProjectIntegrationAdapterRegistry
{
  readonly #adapters: ProjectIntegrationAdapterRegistrations;

  constructor(adapters: ProjectIntegrationAdapterRegistrations) {
    this.#adapters = Object.freeze({ ...adapters });
  }

  prepare(
    artifact: IntegrateProjectArtifact,
    current: Uint8Array | undefined,
    previousState: JsonValue | undefined,
    outputs: CatalogArtifactOutputResolver,
  ): Promise<PreparedProjectIntegration> {
    switch (artifact.integration.adapter) {
      case 'web-app-manifest':
        return this.#prepareWith(
          artifact,
          this.#adapters['web-app-manifest'],
          current,
          previousState,
          outputs,
        );
      case 'html-head':
        return this.#prepareWith(
          artifact,
          this.#adapters['html-head'],
          current,
          previousState,
          outputs,
        );
      case 'static-web-app-config':
        return this.#prepareWith(
          artifact,
          this.#adapters['static-web-app-config'],
          current,
          previousState,
          outputs,
        );
    }
  }

  remove(
    receipt: StoredIntegrationReceipt,
    current: Uint8Array | undefined,
  ): Promise<Uint8Array | undefined> {
    const adapter = this.#adapters[receipt.adapter];
    if (adapter === undefined) {
      return Promise.reject(this.#missingAdapter(receipt.adapter, receipt.artifactId));
    }
    return adapter.remove(receipt, current);
  }

  verify(
    artifact: IntegrateProjectArtifact,
    current: Uint8Array | undefined,
    receiptState: JsonValue,
    outputs: CatalogArtifactOutputResolver,
  ): Promise<void> {
    switch (artifact.integration.adapter) {
      case 'web-app-manifest':
        return this.#verifyWith(
          artifact,
          this.#adapters['web-app-manifest'],
          current,
          receiptState,
          outputs,
        );
      case 'html-head':
        return this.#verifyWith(
          artifact,
          this.#adapters['html-head'],
          current,
          receiptState,
          outputs,
        );
      case 'static-web-app-config':
        return this.#verifyWith(
          artifact,
          this.#adapters['static-web-app-config'],
          current,
          receiptState,
          outputs,
        );
    }
  }

  #prepareWith<
    TAdapter extends IntegrateProjectArtifact['integration']['adapter'],
  >(
    artifact: IntegrationArtifactForAdapter<TAdapter>,
    adapter: ProjectIntegrationAdapter<
      IntegrationArtifactForAdapter<TAdapter>
    > | undefined,
    current: Uint8Array | undefined,
    previousState: JsonValue | undefined,
    outputs: CatalogArtifactOutputResolver,
  ): Promise<PreparedProjectIntegration> {
    if (adapter === undefined) {
      return Promise.reject(
        this.#missingAdapter(artifact.integration.adapter, artifact.id),
      );
    }
    return adapter.prepare(artifact, current, previousState, outputs);
  }

  #verifyWith<
    TAdapter extends IntegrateProjectArtifact['integration']['adapter'],
  >(
    artifact: IntegrationArtifactForAdapter<TAdapter>,
    adapter: ProjectIntegrationAdapter<
      IntegrationArtifactForAdapter<TAdapter>
    > | undefined,
    current: Uint8Array | undefined,
    receiptState: JsonValue,
    outputs: CatalogArtifactOutputResolver,
  ): Promise<void> {
    if (adapter === undefined) {
      return Promise.reject(
        this.#missingAdapter(artifact.integration.adapter, artifact.id),
      );
    }
    return adapter.verify(artifact, current, receiptState, outputs);
  }

  #missingAdapter(adapter: string, artifactId: string): LoomError {
    return new LoomError({
      code: 'LOOM_PLAN_INVALID',
      message: `No project-integration adapter is registered for "${adapter}".`,
      context: { adapter, taskId: artifactId },
    });
  }
}
