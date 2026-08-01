import { LoomError } from '../../domain/errors.js';
import { compareCodePoints } from '../../domain/ordering.js';
import { sha256 } from '../../storage/hash.js';
import type {
  HtmlHeadElement,
  HtmlHeadIntegrationRecipe,
  JsonValue,
} from '../../domain/catalog/planning.js';
import type {
  CatalogArtifactOutputResolver,
  IntegrationArtifactForAdapter,
  PreparedProjectIntegration,
  ProjectIntegrationAdapter,
  StoredIntegrationReceipt,
} from '../../application/execution/contracts.js';
import {
  resolveIntegrationValue,
  type ArtifactReferenceResolver,
} from './artifact-reference-resolver.js';

function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;');
}

function renderElement(
  element: HtmlHeadElement,
  resolve: ArtifactReferenceResolver,
): string {
  const attributes = Object.entries(element.attributes ?? {})
    .sort(([left], [right]) => compareCodePoints(left, right))
    .map(
      ([name, value]) =>
        ` ${name}="${escapeAttribute(resolveIntegrationValue(value, resolve))}"`,
    )
    .join('');
  if (element.element === 'title') {
    return `<title${attributes}>${escapeText(
      element.text === undefined
        ? ''
        : resolveIntegrationValue(element.text, resolve),
    )}</title>`;
  }
  return `<${element.element}${attributes}>`;
}

function markerKey(value: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) {
    throw new LoomError({
      code: 'LOOM_PLAN_INVALID',
      message: 'HTML integration state key is invalid.',
      context: { stateKey: value },
    });
  }
  return value;
}

function resolver(outputs: CatalogArtifactOutputResolver): ArtifactReferenceResolver {
  return (reference) => {
    const value = outputs.resolve(reference);
    if (value instanceof Uint8Array) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'Binary artifact content cannot be embedded in HTML metadata.',
        context: { artifactId: reference.artifactId },
      });
    }
    return value;
  };
}

function requiredText(
  content: Uint8Array | undefined,
  destination: string,
): string {
  if (content === undefined) {
    throw new LoomError({
      code: 'LOOM_WRITE_CONFLICT',
      message: 'HTML integration requires an existing project document.',
      context: { destination },
    });
  }
  return Buffer.from(content).toString('utf8');
}

interface LocatedManagedBlock {
  readonly after: number;
  readonly block: string;
  readonly start: number;
}

interface HtmlHeadIntegrationState {
  readonly managedBlockSha256: string;
  readonly stateKey: string;
}

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function integrationState(
  value: JsonValue | undefined,
): HtmlHeadIntegrationState | undefined {
  return typeof value === 'object' &&
    value !== null &&
    !isJsonArray(value) &&
    typeof value['stateKey'] === 'string' &&
    typeof value['managedBlockSha256'] === 'string' &&
    /^[0-9a-f]{64}$/u.test(value['managedBlockSha256'])
    ? {
        stateKey: value['stateKey'],
        managedBlockSha256: value['managedBlockSha256'],
      }
    : undefined;
}

function legacyStateKey(value: JsonValue | undefined): string | undefined {
  return typeof value === 'object' &&
    value !== null &&
    !isJsonArray(value) &&
    typeof value['stateKey'] === 'string' &&
    value['managedBlockSha256'] === undefined
    ? value['stateKey']
    : undefined;
}

function locateManagedBlock(
  content: string,
  stateKey: string,
): LocatedManagedBlock | undefined {
  const key = markerKey(stateKey);
  const startMarker = `<!-- assetloom:${key}:start -->`;
  const endMarker = `<!-- assetloom:${key}:end -->`;
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 && end === -1) {
    return undefined;
  }
  if (
    start === -1 ||
    end < start ||
    content.indexOf(startMarker, start + startMarker.length) !== -1 ||
    content.indexOf(endMarker, end + endMarker.length) !== -1
  ) {
    throw new LoomError({
      code: 'LOOM_WRITE_CONFLICT',
      message: 'The managed HTML head block is malformed.',
      context: { stateKey: key },
    });
  }
  const after = end + endMarker.length;
  return {
    start,
    after,
    block: content.slice(start, after),
  };
}

function blockHash(block: string): string {
  return sha256(Buffer.from(block, 'utf8'));
}

export class HtmlHeadIntegrationAdapter
  implements ProjectIntegrationAdapter<IntegrationArtifactForAdapter<'html-head'>>
{
  readonly adapter = 'html-head' as const;

  apply(
    content: string,
    recipe: HtmlHeadIntegrationRecipe,
    resolve: ArtifactReferenceResolver,
  ): string {
    const key = markerKey(recipe.stateKey);
    const start = `<!-- assetloom:${key}:start -->`;
    const end = `<!-- assetloom:${key}:end -->`;
    const located = locateManagedBlock(content, key);

    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const block = [
      start,
      ...recipe.elements.map((element) => renderElement(element, resolve)),
      end,
    ].join(eol);
    if (located !== undefined) {
      return `${content.slice(0, located.start)}${block}${content.slice(located.after)}`;
    }
    const closingHead = content.search(/<\/head>/i);
    if (closingHead === -1) {
      throw new LoomError({
        code: 'LOOM_WRITE_CONFLICT',
        message: 'HTML project file does not contain a closing head element.',
      });
    }
    return `${content.slice(0, closingHead)}${block}${eol}${content.slice(closingHead)}`;
  }

  removeManagedBlock(
    content: string,
    stateKey: string,
    expectedBlockSha256?: string,
  ): string {
    const key = markerKey(stateKey);
    const located = locateManagedBlock(content, key);
    if (located === undefined) {
      return content;
    }
    if (
      expectedBlockSha256 === undefined ||
      blockHash(located.block) !== expectedBlockSha256
    ) {
      throw new LoomError({
        code: 'LOOM_WRITE_CONFLICT',
        message: 'Refusing to remove an externally modified HTML head block.',
        context: { stateKey: key },
      });
    }
    const withFollowingEol = content.startsWith('\r\n', located.after)
      ? located.after + 2
      : content.startsWith('\n', located.after)
        ? located.after + 1
        : located.after;
    return `${content.slice(0, located.start)}${content.slice(withFollowingEol)}`;
  }

  prepare(
    artifact: IntegrationArtifactForAdapter<'html-head'>,
    current: Uint8Array | undefined,
    previousState: JsonValue | undefined,
    outputs: CatalogArtifactOutputResolver,
  ): Promise<PreparedProjectIntegration> {
    const currentText = requiredText(current, artifact.destination);
    const content = this.apply(
      currentText,
      artifact.integration,
      resolver(outputs),
    );
    const currentBlock = locateManagedBlock(
      currentText,
      artifact.integration.stateKey,
    );
    const desiredBlock = locateManagedBlock(
      content,
      artifact.integration.stateKey,
    );
    if (desiredBlock === undefined) {
      throw new LoomError({
        code: 'LOOM_INTERNAL',
        message: 'Prepared HTML integration has no managed block.',
        context: { taskId: artifact.id },
      });
    }
    const previous = integrationState(previousState);
    const legacyKey = legacyStateKey(previousState);
    if (
      previousState !== undefined &&
      previous === undefined &&
      legacyKey === undefined
    ) {
      throw new LoomError({
        code: 'LOOM_WRITE_CONFLICT',
        message: 'Stored HTML integration state is invalid.',
        context: { taskId: artifact.id },
      });
    }
    if (
      (previous !== undefined &&
        previous.stateKey !== artifact.integration.stateKey) ||
      (legacyKey !== undefined && legacyKey !== artifact.integration.stateKey)
    ) {
      throw new LoomError({
        code: 'LOOM_WRITE_CONFLICT',
        message: 'Stored HTML integration state key does not match the plan.',
        context: { taskId: artifact.id },
      });
    }
    if (currentBlock !== undefined) {
      const currentHash = blockHash(currentBlock.block);
      const alreadyPublishedDesiredBlock =
        currentBlock.block === desiredBlock.block;
      if (
        (previous !== undefined &&
          currentHash !== previous.managedBlockSha256 &&
          !alreadyPublishedDesiredBlock) ||
        (previous === undefined && !alreadyPublishedDesiredBlock)
      ) {
        throw new LoomError({
          code: 'LOOM_WRITE_CONFLICT',
          message: 'Refusing to replace an externally modified HTML head block.',
          context: { taskId: artifact.id, destination: artifact.destination },
        });
      }
    }
    return Promise.resolve({
      content: Buffer.from(content, 'utf8'),
      state: {
        stateKey: artifact.integration.stateKey,
        managedBlockSha256: blockHash(desiredBlock.block),
      },
    });
  }

  remove(
    receipt: StoredIntegrationReceipt,
    current: Uint8Array | undefined,
  ): Promise<Uint8Array | undefined> {
    if (current === undefined) {
      return Promise.resolve(undefined);
    }
    const state = integrationState(receipt.state);
    return Promise.resolve(
      Buffer.from(
        this.removeManagedBlock(
          Buffer.from(current).toString('utf8'),
          receipt.stateKey,
          state?.managedBlockSha256,
        ),
        'utf8',
      ),
    );
  }

  async verify(
    artifact: IntegrationArtifactForAdapter<'html-head'>,
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
        message: 'Managed HTML head content differs from the generation plan.',
        context: { taskId: artifact.id, destination: artifact.destination },
      });
    }
  }
}
