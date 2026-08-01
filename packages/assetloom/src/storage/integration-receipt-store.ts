import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  StoredIntegrationReceipt,
} from '../application/execution/contracts.js';
import type { JsonValue } from '../domain/catalog/planning.js';
import { LoomError } from '../domain/errors.js';
import { compareCodePoints } from '../domain/ordering.js';
import { AtomicWriter } from './atomic-writer.js';
import { sha256 } from './hash.js';
import type { ProjectStatePathGuard } from './state-path-guard.js';

const TARGET_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const INTEGRATION_ADAPTERS = new Set([
  'html-head',
  'static-web-app-config',
  'web-app-manifest',
]);

export interface IntegrationReceiptDocument {
  readonly version: 1;
  readonly receipts: Readonly<Record<string, StoredIntegrationReceipt>>;
}

export function emptyIntegrationReceipts(): IntegrationReceiptDocument {
  return { version: 1, receipts: {} };
}

export function integrationReceiptId(
  receipt: Pick<
    StoredIntegrationReceipt,
    'adapter' | 'destination' | 'stateKey' | 'target'
  >,
): string {
  return sha256(
    JSON.stringify([
      receipt.target,
      receipt.adapter,
      receipt.stateKey,
      receipt.destination,
    ]),
  );
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value !== 'object') {
    return false;
  }
  return Object.entries(value).every(
    ([key, child]) => key.length > 0 && isJsonValue(child),
  );
}

function isPortableRelativePath(value: string): boolean {
  return (
    value !== '' &&
    !value.includes('\\') &&
    !value.startsWith('/') &&
    !value.endsWith('/') &&
    !path.isAbsolute(value) &&
    !path.posix.isAbsolute(value) &&
    path.posix.normalize(value) === value &&
    value.split('/').every((segment) => segment !== '.' && segment !== '..')
  );
}

function isStoredReceipt(value: unknown): value is StoredIntegrationReceipt {
  return (
    typeof value === 'object' &&
    value !== null &&
    'adapter' in value &&
    typeof value.adapter === 'string' &&
    INTEGRATION_ADAPTERS.has(value.adapter) &&
    'artifactId' in value &&
    typeof value.artifactId === 'string' &&
    value.artifactId.length > 0 &&
    'destination' in value &&
    typeof value.destination === 'string' &&
    isPortableRelativePath(value.destination) &&
    'stateKey' in value &&
    typeof value.stateKey === 'string' &&
    value.stateKey.length > 0 &&
    'target' in value &&
    typeof value.target === 'string' &&
    TARGET_ID_PATTERN.test(value.target) &&
    'state' in value &&
    isJsonValue(value.state)
  );
}

function validateDocument(value: unknown): value is IntegrationReceiptDocument {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 1 ||
    !('receipts' in value) ||
    typeof value.receipts !== 'object' ||
    value.receipts === null ||
    Array.isArray(value.receipts)
  ) {
    return false;
  }
  return Object.entries(value.receipts).every(
    ([id, receipt]) =>
      /^[0-9a-f]{64}$/.test(id) &&
      isStoredReceipt(receipt) &&
      integrationReceiptId(receipt) === id,
  );
}

export class IntegrationReceiptStore {
  readonly #filename: string;
  readonly #statePaths: ProjectStatePathGuard | undefined;
  readonly #writer: AtomicWriter;

  constructor(
    projectRoot: string,
    stateDirectory: string,
    statePaths?: ProjectStatePathGuard,
  ) {
    this.#filename = path.join(stateDirectory, 'integrations.json');
    this.#statePaths = statePaths;
    this.#writer = new AtomicWriter(projectRoot);
  }

  get filename(): string {
    return this.#filename;
  }

  async load(): Promise<IntegrationReceiptDocument> {
    await this.#statePaths?.assertSafe(this.#filename);
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#filename, 'utf8'));
      if (!validateDocument(parsed)) {
        throw new LoomError({
          code: 'LOOM_MANIFEST_INVALID',
          message: 'The Assetloom project-integration receipt file is invalid.',
          context: { integrationReceiptPath: this.#filename },
        });
      }
      return parsed;
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;
      if (code === 'ENOENT') {
        return emptyIntegrationReceipts();
      }
      if (error instanceof LoomError) {
        throw error;
      }
      throw new LoomError({
        code: 'LOOM_MANIFEST_READ_FAILED',
        message: 'Failed to read Assetloom project-integration receipts.',
        cause: error,
        context: { integrationReceiptPath: this.#filename },
      });
    }
  }

  async save(document: IntegrationReceiptDocument): Promise<void> {
    await this.#statePaths?.assertSafe(this.#filename);
    try {
      const receipts = Object.fromEntries(
        Object.entries(document.receipts).sort(([left], [right]) =>
          compareCodePoints(left, right),
        ),
      );
      await this.#writer.writeIfChanged(
        this.#filename,
        Buffer.from(`${JSON.stringify({ version: 1, receipts }, null, 2)}\n`),
      );
    } catch (cause) {
      if (
        cause instanceof LoomError &&
        cause.code === 'LOOM_WRITE_OUTSIDE_ROOT'
      ) {
        throw cause;
      }
      throw new LoomError({
        code: 'LOOM_MANIFEST_WRITE_FAILED',
        message: 'Failed to write Assetloom project-integration receipts.',
        cause,
        context: { integrationReceiptPath: this.#filename },
      });
    }
  }
}
