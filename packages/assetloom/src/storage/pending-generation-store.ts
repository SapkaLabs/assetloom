import { randomBytes } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { LoomError } from '../domain/errors.js';
import { compareCodePoints } from '../domain/ordering.js';
import type { ProjectStatePathGuard } from './state-path-guard.js';

export interface PendingGenerationIntent {
  readonly fingerprint: string;
  readonly selectedTargets: readonly string[];
  readonly version: 2;
}

export type PendingGenerationDisposition = 'created' | 'resumed';

function errorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error
    ? error.code
    : undefined;
}

function isPendingGenerationIntent(
  value: unknown,
): value is PendingGenerationIntent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    value.version === 2 &&
    'fingerprint' in value &&
    typeof value.fingerprint === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.fingerprint) &&
    'selectedTargets' in value &&
    Array.isArray(value.selectedTargets) &&
    value.selectedTargets.every(
      (target) =>
        typeof target === 'string' && /^[A-Za-z][A-Za-z0-9_-]*$/u.test(target),
    )
  );
}

export class PendingGenerationStore {
  readonly #filename: string;
  readonly #statePaths: ProjectStatePathGuard;

  constructor(
    stateDirectory: string,
    statePaths: ProjectStatePathGuard,
  ) {
    this.#filename = path.join(stateDirectory, 'pending-generation.json');
    this.#statePaths = statePaths;
  }

  get filename(): string {
    return this.#filename;
  }

  async load(): Promise<PendingGenerationIntent | undefined> {
    await this.#statePaths.assertSafe(this.#filename);
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#filename, 'utf8'));
      if (!isPendingGenerationIntent(parsed)) {
        throw new LoomError({
          code: 'LOOM_GENERATION_INTENT_INVALID',
          message: 'The pending Assetloom generation intent is invalid.',
          context: { pendingGenerationPath: this.#filename },
        });
      }
      return parsed;
    } catch (cause) {
      if (errorCode(cause) === 'ENOENT') {
        return undefined;
      }
      if (cause instanceof LoomError) {
        throw cause;
      }
      throw new LoomError({
        code: 'LOOM_GENERATION_INTENT_INVALID',
        message: 'Failed to read the pending Assetloom generation intent.',
        cause,
        context: { pendingGenerationPath: this.#filename },
      });
    }
  }

  async begin(
    intent: PendingGenerationIntent,
  ): Promise<PendingGenerationDisposition> {
    const existing = await this.load();
    if (existing !== undefined) {
      if (existing.fingerprint === intent.fingerprint) {
        return 'resumed';
      }
      throw this.#recoveryRequired(existing, intent.fingerprint, intent.selectedTargets);
    }
    await this.#write(intent);
    return 'created';
  }

  async assertNoPending(operation: string): Promise<void> {
    const pending = await this.load();
    if (pending !== undefined) {
      throw new LoomError({
        code: 'LOOM_GENERATION_RECOVERY_REQUIRED',
        message:
          'An interrupted Assetloom generation must be recovered before this operation can continue. Rerun generation with the prior configuration and target selection.',
        context: {
          operation,
          pendingFingerprint: pending.fingerprint,
          pendingGenerationPath: this.#filename,
          pendingTargets: pending.selectedTargets,
        },
      });
    }
  }

  recoveryRequiredForPreparation(
    pending: PendingGenerationIntent,
    cause: unknown,
    targetFilter: string | undefined,
  ): LoomError {
    if (
      cause instanceof LoomError &&
      cause.code === 'LOOM_GENERATION_RECOVERY_REQUIRED'
    ) {
      return cause;
    }
    return new LoomError({
      code: 'LOOM_GENERATION_RECOVERY_REQUIRED',
      message:
        'Assetloom could not reconstruct the interrupted generation from the requested inputs. Rerun generation with the prior configuration, sources, and target selection.',
      cause,
      context: {
        pendingFingerprint: pending.fingerprint,
        pendingGenerationPath: this.#filename,
        pendingTargets: pending.selectedTargets,
        requestedTargetFilter: targetFilter ?? null,
      },
    });
  }

  async clear(expectedFingerprint: string): Promise<void> {
    const pending = await this.load();
    if (pending === undefined) {
      return;
    }
    if (pending.fingerprint !== expectedFingerprint) {
      throw this.#recoveryRequired(
        pending,
        expectedFingerprint,
        pending.selectedTargets,
      );
    }
    await this.#statePaths.assertSafe(this.#filename);
    try {
      await rm(this.#filename);
    } catch (cause) {
      throw new LoomError({
        code: 'LOOM_GENERATION_INTENT_WRITE_FAILED',
        message: 'Failed to clear the completed Assetloom generation intent.',
        cause,
        context: { pendingGenerationPath: this.#filename },
      });
    }
  }

  async #write(intent: PendingGenerationIntent): Promise<void> {
    const directory = path.dirname(this.#filename);
    const temporary = path.join(
      directory,
      `.pending-generation.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
    );
    try {
      await this.#statePaths.assertSafe(directory);
      await mkdir(directory, { recursive: true });
      await this.#statePaths.assertSafe(this.#filename);
      await this.#statePaths.assertSafe(temporary);
      const document = {
        version: 2 as const,
        fingerprint: intent.fingerprint,
        selectedTargets: [...intent.selectedTargets].sort(compareCodePoints),
      };
      await writeFile(
        temporary,
        `${JSON.stringify(document, null, 2)}\n`,
        { flag: 'wx' },
      );
      await this.#statePaths.assertSafe(temporary);
      await this.#statePaths.assertSafe(this.#filename);
      await rename(temporary, this.#filename);
    } catch (cause) {
      await this.#statePaths
        .assertSafe(temporary)
        .then(() => rm(temporary, { force: true }))
        .catch(() => undefined);
      if (cause instanceof LoomError) {
        throw cause;
      }
      throw new LoomError({
        code: 'LOOM_GENERATION_INTENT_WRITE_FAILED',
        message: 'Failed to persist the pending Assetloom generation intent.',
        cause,
        context: { pendingGenerationPath: this.#filename },
      });
    }
  }

  #recoveryRequired(
    pending: PendingGenerationIntent,
    requestedFingerprint: string,
    requestedTargets: readonly string[],
  ): LoomError {
    return new LoomError({
      code: 'LOOM_GENERATION_RECOVERY_REQUIRED',
      message:
        'The requested generation differs from an interrupted Assetloom generation. Rerun generation with the prior configuration and target selection before applying new changes.',
      context: {
        pendingFingerprint: pending.fingerprint,
        pendingGenerationPath: this.#filename,
        pendingTargets: pending.selectedTargets,
        requestedFingerprint,
        requestedTargets,
      },
    });
  }
}
