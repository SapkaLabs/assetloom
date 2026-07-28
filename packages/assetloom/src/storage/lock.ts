import { mkdir, open, rm } from 'node:fs/promises';
import path from 'node:path';
import { LoomError } from '../domain/errors.js';

export class ProjectLock {
  readonly #filename: string;
  #held = false;

  constructor(stateDirectory: string) {
    this.#filename = path.join(stateDirectory, 'lock');
  }

  async acquire(): Promise<void> {
    try {
      await mkdir(path.dirname(this.#filename), { recursive: true });
      const handle = await open(this.#filename, 'wx');
      await handle.writeFile(
        `${JSON.stringify({
          pid: process.pid,
          acquiredAt: new Date().toISOString(),
        })}\n`,
      );
      await handle.close();
      this.#held = true;
    } catch (cause) {
      const code =
        typeof cause === 'object' && cause !== null && 'code' in cause
          ? cause.code
          : undefined;
      if (code === 'EEXIST') {
        throw new LoomError({
          code: 'LOOM_LOCK_ALREADY_HELD',
          message: 'Another Assetloom operation holds the project lock.',
          cause,
          context: { lockFile: this.#filename },
        });
      }
      throw new LoomError({
        code: 'LOOM_LOCK_ACQUIRE_FAILED',
        message: 'Failed to acquire the Assetloom project lock.',
        cause,
        context: { lockFile: this.#filename },
      });
    }
  }

  async release(): Promise<void> {
    if (!this.#held) {
      return;
    }
    await rm(this.#filename, { force: true });
    this.#held = false;
  }
}
