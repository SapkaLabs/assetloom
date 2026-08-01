import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ProjectFileGateway,
  ProjectFileSnapshot,
} from '../application/execution/contracts.js';
import { assertSafeDestination } from '../config/paths.js';
import { LoomError } from '../domain/errors.js';
import { AtomicWriter } from './atomic-writer.js';
import { sha256 } from './hash.js';

function errorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error
    ? error.code
    : undefined;
}

export class FileSystemProjectFileGateway implements ProjectFileGateway {
  readonly #projectRoot: string;
  readonly #writer: AtomicWriter;

  constructor(projectRoot: string) {
    this.#projectRoot = path.resolve(projectRoot);
    this.#writer = new AtomicWriter(this.#projectRoot);
  }

  async inspect(destination: string): Promise<ProjectFileSnapshot> {
    await assertSafeDestination(this.#projectRoot, destination);
    try {
      const content = await readFile(destination);
      return { content, sha256: sha256(content) };
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        return { content: undefined, sha256: undefined };
      }
      throw new LoomError({
        code: 'LOOM_WRITE_FAILED',
        message: 'Failed to inspect a project-integration destination.',
        cause: error,
        context: { destination },
      });
    }
  }

  async publish(
    destination: string,
    content: Uint8Array,
    expectedSha256: string | undefined,
  ): Promise<'written' | 'unchanged'> {
    const current = await this.inspect(destination);
    if (current.sha256 !== expectedSha256) {
      throw new LoomError({
        code: 'LOOM_WRITE_CONFLICT',
        message: 'Project-integration destination changed after preflight.',
        context: { destination },
      });
    }
    return this.#writer.writeIfChanged(destination, content);
  }
}
