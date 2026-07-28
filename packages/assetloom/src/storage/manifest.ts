import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LoomError } from '../domain/errors.js';
import type { TargetPlatform } from '../domain/types.js';
import { AtomicWriter } from './atomic-writer.js';

export interface ManifestFile {
  readonly sha256: string;
  readonly taskId: string;
  readonly target: TargetPlatform;
}

export interface AssetloomManifest {
  readonly version: 1;
  readonly files: Readonly<Record<string, ManifestFile>>;
}

export function emptyManifest(): AssetloomManifest {
  return { version: 1, files: {} };
}

function isManifestFile(value: unknown): value is ManifestFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sha256' in value &&
    typeof value.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    'taskId' in value &&
    typeof value.taskId === 'string' &&
    'target' in value &&
    (value.target === 'android' || value.target === 'ios')
  );
}

function validateManifest(value: unknown): value is AssetloomManifest {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 1 ||
    !('files' in value) ||
    typeof value.files !== 'object' ||
    value.files === null ||
    Array.isArray(value.files)
  ) {
    return false;
  }
  return Object.entries(value.files).every(
    ([relativePath, entry]) =>
      relativePath !== '' &&
      !path.isAbsolute(relativePath) &&
      !relativePath.split('/').includes('..') &&
      isManifestFile(entry),
  );
}

export class ManifestStore {
  readonly #filename: string;
  readonly #writer: AtomicWriter;

  constructor(projectRoot: string, stateDirectory: string) {
    this.#filename = path.join(stateDirectory, 'manifest.json');
    this.#writer = new AtomicWriter(projectRoot);
  }

  get filename(): string {
    return this.#filename;
  }

  async load(): Promise<AssetloomManifest> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#filename, 'utf8'));
      if (!validateManifest(parsed)) {
        throw new LoomError({
          code: 'LOOM_MANIFEST_INVALID',
          message: 'The Assetloom manifest is invalid.',
          context: { manifestPath: this.#filename },
        });
      }
      return parsed;
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;
      if (code === 'ENOENT') {
        return emptyManifest();
      }
      if (error instanceof LoomError) {
        throw error;
      }
      throw new LoomError({
        code: 'LOOM_MANIFEST_READ_FAILED',
        message: 'Failed to read the Assetloom manifest.',
        cause: error,
        context: { manifestPath: this.#filename },
      });
    }
  }

  async save(manifest: AssetloomManifest): Promise<void> {
    try {
      const content = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
      await this.#writer.writeIfChanged(this.#filename, content);
    } catch (cause) {
      if (
        cause instanceof LoomError &&
        cause.code === 'LOOM_WRITE_OUTSIDE_ROOT'
      ) {
        throw cause;
      }
      throw new LoomError({
        code: 'LOOM_MANIFEST_WRITE_FAILED',
        message: 'Failed to write the Assetloom manifest.',
        cause,
        context: { manifestPath: this.#filename },
      });
    }
  }
}
