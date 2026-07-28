import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LoomError } from '../domain/errors.js';
import { sha256 } from './hash.js';

export class ContentCache {
  readonly #directory: string;

  constructor(stateDirectory: string) {
    this.#directory = path.join(stateDirectory, 'cache');
  }

  async get(key: string): Promise<Buffer | undefined> {
    const filename = path.join(this.#directory, key);
    try {
      const value = await readFile(filename);
      if (sha256(value) !== key) {
        throw new LoomError({
          code: 'LOOM_CACHE_CORRUPT',
          message: 'Assetloom cache entry content does not match its key.',
          context: { key, filename },
        });
      }
      return value;
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;
      if (code === 'ENOENT') {
        return undefined;
      }
      if (error instanceof LoomError) {
        throw error;
      }
      throw new LoomError({
        code: 'LOOM_CACHE_READ_FAILED',
        message: 'Failed to read an Assetloom cache entry.',
        cause: error,
        context: { key, filename },
      });
    }
  }

  async getAlias(key: string): Promise<string | undefined> {
    const filename = path.join(this.#directory, key);
    try {
      const value = await readFile(filename, 'ascii');
      if (!/^[0-9a-f]{64}$/.test(value)) {
        throw new LoomError({
          code: 'LOOM_CACHE_CORRUPT',
          message: 'Assetloom cache index contains an invalid content key.',
          context: { key, filename },
        });
      }
      return value;
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;
      if (code === 'ENOENT') {
        return undefined;
      }
      if (error instanceof LoomError) {
        throw error;
      }
      throw new LoomError({
        code: 'LOOM_CACHE_READ_FAILED',
        message: 'Failed to read an Assetloom cache index.',
        cause: error,
        context: { key, filename },
      });
    }
  }

  async put(value: Uint8Array): Promise<string> {
    const key = sha256(value);
    const destination = path.join(this.#directory, key);
    const temporary = `${destination}.${process.pid}.tmp`;
    try {
      await mkdir(this.#directory, { recursive: true });
      try {
        await writeFile(temporary, value, { flag: 'wx' });
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? error.code
            : undefined;
        if (code !== 'EEXIST') {
          throw error;
        }
      }
      try {
        await rename(temporary, destination);
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? error.code
            : undefined;
        if (code !== 'EEXIST' && code !== 'ENOENT') {
          throw error;
        }
        await rm(temporary, { force: true });
      }
      return key;
    } catch (cause) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw new LoomError({
        code: 'LOOM_CACHE_WRITE_FAILED',
        message: 'Failed to write an Assetloom cache entry.',
        cause,
        context: { key, destination },
      });
    }
  }

  async putAlias(key: string, value: Uint8Array): Promise<void> {
    if (!/^[0-9a-f]{64}$/.test(key)) {
      throw new LoomError({
        code: 'LOOM_CACHE_WRITE_FAILED',
        message: 'Refusing to write an invalid Assetloom cache key.',
        context: { key },
      });
    }
    const destination = path.join(this.#directory, key);
    const temporary = `${destination}.${process.pid}.tmp`;
    try {
      await mkdir(this.#directory, { recursive: true });
      await writeFile(temporary, value, { flag: 'wx' });
      await rename(temporary, destination);
    } catch (cause) {
      const code =
        typeof cause === 'object' && cause !== null && 'code' in cause
          ? cause.code
          : undefined;
      if (code === 'EEXIST') {
        await rm(temporary, { force: true });
        return;
      }
      await rm(temporary, { force: true }).catch(() => undefined);
      throw new LoomError({
        code: 'LOOM_CACHE_WRITE_FAILED',
        message: 'Failed to write an Assetloom cache index.',
        cause,
        context: { key, destination },
      });
    }
  }
}
