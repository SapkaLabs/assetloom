import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertSafeDestination } from '../config/paths.js';
import { LoomError } from '../domain/errors.js';

export type WriteDisposition = 'written' | 'unchanged';

export class AtomicWriter {
  readonly #root: string;

  constructor(root: string) {
    this.#root = path.resolve(root);
  }

  async writeIfChanged(
    destination: string,
    content: Uint8Array,
  ): Promise<WriteDisposition> {
    await assertSafeDestination(this.#root, destination);
    try {
      const current = await readFile(destination);
      if (current.equals(content)) {
        return 'unchanged';
      }
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;
      if (code !== 'ENOENT') {
        throw new LoomError({
          code: 'LOOM_WRITE_FAILED',
          message: `Failed to inspect output "${destination}".`,
          cause: error,
          context: { destination },
        });
      }
    }

    const directory = path.dirname(destination);
    const temporary = path.join(
      directory,
      `.${path.basename(destination)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
    );
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(temporary, content, { flag: 'wx' });
      await rename(temporary, destination);
      return 'written';
    } catch (cause) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw new LoomError({
        code: 'LOOM_ATOMIC_PUBLISH_FAILED',
        message: `Failed to publish output "${destination}" atomically.`,
        cause,
        context: { destination },
      });
    }
  }
}
