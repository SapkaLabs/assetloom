import path from 'node:path';
import {
  assertInsideRoot,
  assertSafeDestination,
} from '../config/paths.js';
import { LoomError } from '../domain/errors.js';

/** Guards every v2 state access against path escape and link traversal. */
export class ProjectStatePathGuard {
  readonly #projectRoot: string;
  readonly #stateDirectory: string;

  constructor(projectRoot: string, stateDirectory: string) {
    this.#projectRoot = path.resolve(projectRoot);
    this.#stateDirectory = path.resolve(stateDirectory);
  }

  async assertSafe(candidate: string = this.#stateDirectory): Promise<void> {
    const resolvedCandidate = path.resolve(candidate);
    try {
      assertInsideRoot(this.#projectRoot, this.#stateDirectory);
      assertInsideRoot(this.#stateDirectory, resolvedCandidate);
      await assertSafeDestination(this.#projectRoot, resolvedCandidate);
    } catch (cause) {
      throw new LoomError({
        code: 'LOOM_STATE_PATH_UNSAFE',
        message:
          'Refusing to access Assetloom state through an unsafe path or symbolic link.',
        cause,
        context: {
          projectRoot: this.#projectRoot,
          stateDirectory: this.#stateDirectory,
          statePath: resolvedCandidate,
        },
      });
    }
  }
}
