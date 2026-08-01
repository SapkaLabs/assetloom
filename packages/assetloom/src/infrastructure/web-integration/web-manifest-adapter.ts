import type {
  JsonValue,
  WebManifestIntegrationRecipe,
} from '../../domain/catalog/planning.js';
import type {
  CatalogArtifactOutputResolver,
  IntegrationArtifactForAdapter,
  PreparedProjectIntegration,
  ProjectIntegrationAdapter,
  StoredIntegrationReceipt,
} from '../../application/execution/contracts.js';
import { LoomError } from '../../domain/errors.js';
import {
  applyManagedJsonFields,
  type JsonObject,
  type ManagedJsonResult,
} from './managed-json.js';
import {
  resolveIntegrationJsonValue,
  type ArtifactReferenceResolver,
} from './artifact-reference-resolver.js';

function jsonObject(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === 'object' &&
    value !== null &&
    !isJsonArray(value)
    ? value
    : undefined;
}

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function resolver(outputs: CatalogArtifactOutputResolver): ArtifactReferenceResolver {
  return (reference) => {
    const value = outputs.resolve(reference);
    if (value instanceof Uint8Array) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'Binary artifact content cannot be embedded in a web manifest.',
        context: { artifactId: reference.artifactId },
      });
    }
    return value;
  };
}

function text(content: Uint8Array | undefined): string {
  return content === undefined ? '{}\n' : Buffer.from(content).toString('utf8');
}

export class WebManifestIntegrationAdapter
  implements
    ProjectIntegrationAdapter<
      IntegrationArtifactForAdapter<'web-app-manifest'>
    >
{
  readonly adapter = 'web-app-manifest' as const;

  apply(
    content: string,
    recipe: WebManifestIntegrationRecipe,
    resolve: ArtifactReferenceResolver,
    previous?: JsonObject,
    destination = 'web manifest',
  ): ManagedJsonResult {
    return applyManagedJsonFields(
      content,
      Object.fromEntries(
        Object.entries(recipe.manifest).map(([key, value]) => [
          key,
          resolveIntegrationJsonValue(value, resolve),
        ]),
      ),
      previous,
      destination,
    );
  }

  prepare(
    artifact: IntegrationArtifactForAdapter<'web-app-manifest'>,
    current: Uint8Array | undefined,
    previousState: JsonValue | undefined,
    outputs: CatalogArtifactOutputResolver,
  ): Promise<PreparedProjectIntegration> {
    const previous = jsonObject(previousState);
    if (previousState !== undefined && previous === undefined) {
      throw new LoomError({
        code: 'LOOM_WRITE_CONFLICT',
        message: 'Stored web manifest integration state is invalid.',
        context: { taskId: artifact.id },
      });
    }
    const result = this.apply(
      text(current),
      artifact.integration,
      resolver(outputs),
      previous,
      artifact.destination,
    );
    return Promise.resolve({
      content: Buffer.from(result.content, 'utf8'),
      state: result.managed,
    });
  }

  remove(
    receipt: StoredIntegrationReceipt,
    current: Uint8Array | undefined,
  ): Promise<Uint8Array | undefined> {
    if (current === undefined) {
      return Promise.resolve(undefined);
    }
    const previous = jsonObject(receipt.state);
    if (previous === undefined) {
      throw new LoomError({
        code: 'LOOM_WRITE_CONFLICT',
        message: 'Stored web manifest integration state is invalid.',
        context: { taskId: receipt.artifactId },
      });
    }
    const result = applyManagedJsonFields(
      text(current),
      {},
      previous,
      receipt.destination,
    );
    return Promise.resolve(Buffer.from(result.content, 'utf8'));
  }

  async verify(
    artifact: IntegrationArtifactForAdapter<'web-app-manifest'>,
    current: Uint8Array | undefined,
    receiptState: JsonValue,
    outputs: CatalogArtifactOutputResolver,
  ): Promise<void> {
    const prepared = await this.prepare(
      artifact,
      current,
      receiptState,
      outputs,
    );
    if (
      current === undefined ||
      !Buffer.from(prepared.content).equals(Buffer.from(current))
    ) {
      throw new LoomError({
        code: 'LOOM_VERIFY_FAILED',
        message: 'Managed web manifest content differs from the generation plan.',
        context: { taskId: artifact.id, destination: artifact.destination },
      });
    }
  }
}
