import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { assertSafeDestination } from '../config/paths.js';
import { LoomError } from '../domain/errors.js';
import { compareCodePoints } from '../domain/ordering.js';
import { AtomicWriter } from './atomic-writer.js';
import { sha256 } from './hash.js';
import type {
  AssetloomManifest,
  ManifestFile,
} from './manifest.js';

export interface MaterializedOwnedOutput {
  readonly artifactId: string;
  readonly content: Uint8Array;
  readonly destination: string;
  readonly target: string;
}

export interface StaleOwnedOutput {
  readonly absolutePath: string;
  readonly entry: ManifestFile;
  readonly relativePath: string;
}

export interface PreparedMaterializedOwnedOutput extends MaterializedOwnedOutput {
  readonly expectedSha256: string | undefined;
}

export interface PreparedOwnedOutputPublication {
  readonly manifest: AssetloomManifest;
  readonly outputs: readonly PreparedMaterializedOwnedOutput[];
  readonly stale: readonly StaleOwnedOutput[];
}

export interface OwnedOutputPublicationResult {
  readonly written: readonly string[];
  readonly unchanged: readonly string[];
  readonly removed: readonly string[];
}

function portableRelativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

function errorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error
    ? error.code
    : undefined;
}

export class OwnedOutputLifecycle {
  readonly #projectRoot: string;
  readonly #writer: AtomicWriter;

  constructor(projectRoot: string) {
    this.#projectRoot = path.resolve(projectRoot);
    this.#writer = new AtomicWriter(this.#projectRoot);
  }

  async prepare(
    outputs: readonly MaterializedOwnedOutput[],
    previous: AssetloomManifest,
    selectedTargets: readonly string[],
  ): Promise<PreparedOwnedOutputPublication> {
    const selectedTargetSet = new Set(selectedTargets);
    const selectedFiles: Record<string, ManifestFile> = {};
    const preparedOutputs: PreparedMaterializedOwnedOutput[] = [];
    const destinations = new Set<string>();
    const retainedEntries = Object.entries(previous.files).filter(
      ([, entry]) => !selectedTargetSet.has(entry.target),
    );
    const retainedByDestination = new Map(
      retainedEntries.map(([relative, entry]) => [
        relative.toLocaleLowerCase('en-US'),
        { entry, relative },
      ]),
    );

    for (const output of outputs) {
      await assertSafeDestination(this.#projectRoot, output.destination);
      if (!selectedTargetSet.has(output.target)) {
        throw new LoomError({
          code: 'LOOM_PLAN_INVALID',
          message: 'A materialized output is outside the selected target scope.',
          context: {
            destination: output.destination,
            target: output.target,
            taskId: output.artifactId,
          },
        });
      }
      const relative = portableRelativePath(
        this.#projectRoot,
        output.destination,
      );
      const collisionKey = relative.toLocaleLowerCase('en-US');
      const retainedOwner = retainedByDestination.get(collisionKey);
      if (retainedOwner !== undefined) {
        throw new LoomError({
          code: 'LOOM_PLAN_COLLISION',
          message:
            'A selected output destination is already owned by a retained target.',
          context: {
            destination: output.destination,
            retainedDestination: retainedOwner.relative,
            retainedTarget: retainedOwner.entry.target,
            target: output.target,
            taskId: output.artifactId,
          },
        });
      }
      if (destinations.has(collisionKey)) {
        throw new LoomError({
          code: 'LOOM_PLAN_COLLISION',
          message: 'Multiple materialized outputs resolve to the same destination.',
          context: { destination: output.destination },
        });
      }
      destinations.add(collisionKey);

      const expectedSha256 = await this.#assertWritable(
        output,
        previous,
        relative,
      );
      preparedOutputs.push({ ...output, expectedSha256 });
      selectedFiles[relative] = {
        sha256: sha256(output.content),
        taskId: output.artifactId,
        target: output.target,
      };
    }

    const retainedFiles = Object.fromEntries(retainedEntries);
    const nextFiles = Object.fromEntries(
      Object.entries({ ...retainedFiles, ...selectedFiles }).sort(
        ([left], [right]) => compareCodePoints(left, right),
      ),
    );
    const stale = Object.entries(previous.files)
      .filter(
        ([relative, entry]) =>
          selectedTargetSet.has(entry.target) && nextFiles[relative] === undefined,
      )
      .sort(([left], [right]) => compareCodePoints(left, right))
      .map(([relativePath, entry]) => ({
        relativePath,
        entry,
        absolutePath: path.resolve(this.#projectRoot, relativePath),
      }));

    for (const candidate of stale) {
      await this.#assertRemovable(candidate);
    }

    return {
      manifest: { version: 1, files: nextFiles },
      outputs: preparedOutputs.sort((left, right) =>
        compareCodePoints(left.destination, right.destination),
      ),
      stale,
    };
  }

  async publish(
    prepared: PreparedOwnedOutputPublication,
  ): Promise<OwnedOutputPublicationResult> {
    const written: string[] = [];
    const unchanged: string[] = [];
    for (const output of prepared.outputs) {
      await this.#assertUnchangedSincePreflight(output);
      const disposition = await this.#writer.writeIfChanged(
        output.destination,
        output.content,
      );
      (disposition === 'written' ? written : unchanged).push(
        output.destination,
      );
    }

    const removed: string[] = [];
    for (const candidate of prepared.stale) {
      try {
        await this.#assertRemovable(candidate);
        await rm(candidate.absolutePath);
        removed.push(candidate.absolutePath);
        await this.#removeEmptyParents(path.dirname(candidate.absolutePath));
      } catch (cause) {
        if (errorCode(cause) === 'ENOENT') {
          continue;
        }
        throw new LoomError({
          code: 'LOOM_CLEAN_FAILED',
          message: 'Failed to remove a stale Assetloom output.',
          cause,
          context: { destination: candidate.absolutePath },
        });
      }
    }
    return { written, unchanged, removed };
  }

  async #assertWritable(
    output: MaterializedOwnedOutput,
    previous: AssetloomManifest,
    relative: string,
  ): Promise<string | undefined> {
    const previousEntry = previous.files[relative];
    try {
      const current = await readFile(output.destination);
      if (previousEntry === undefined) {
        if (!current.equals(output.content)) {
          throw new LoomError({
            code: 'LOOM_WRITE_CONFLICT',
            message: 'Refusing to overwrite a file not owned by Assetloom.',
            context: {
              destination: output.destination,
              taskId: output.artifactId,
            },
          });
        }
        return sha256(current);
      }
      if (
        sha256(current) !== previousEntry.sha256 &&
        !current.equals(output.content)
      ) {
        throw new LoomError({
          code: 'LOOM_WRITE_CONFLICT',
          message: 'Refusing to overwrite an Assetloom output modified after generation.',
          context: {
            destination: output.destination,
            taskId: previousEntry.taskId,
          },
        });
      }
      return sha256(current);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  async #assertUnchangedSincePreflight(
    output: PreparedMaterializedOwnedOutput,
  ): Promise<void> {
    try {
      const current = await readFile(output.destination);
      if (sha256(current) === output.expectedSha256) {
        return;
      }
    } catch (error) {
      if (errorCode(error) === 'ENOENT' && output.expectedSha256 === undefined) {
        return;
      }
      if (errorCode(error) !== 'ENOENT') {
        throw error;
      }
    }
    throw new LoomError({
      code: 'LOOM_WRITE_CONFLICT',
      message: 'An Assetloom output changed after publication preflight.',
      context: { destination: output.destination, taskId: output.artifactId },
    });
  }

  async #assertRemovable(candidate: StaleOwnedOutput): Promise<void> {
    await assertSafeDestination(this.#projectRoot, candidate.absolutePath);
    try {
      const current = await readFile(candidate.absolutePath);
      if (sha256(current) !== candidate.entry.sha256) {
        throw new LoomError({
          code: 'LOOM_CLEAN_UNOWNED_FILE',
          message: 'Refusing to remove an Assetloom output modified after generation.',
          context: {
            destination: candidate.absolutePath,
            taskId: candidate.entry.taskId,
          },
        });
      }
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') {
        throw error;
      }
    }
  }

  async #removeEmptyParents(start: string): Promise<void> {
    let directory = start;
    while (directory !== this.#projectRoot) {
      try {
        await rm(directory);
      } catch {
        return;
      }
      directory = path.dirname(directory);
    }
  }
}
