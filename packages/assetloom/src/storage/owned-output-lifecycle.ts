import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { assertSafeDestination } from '../config/paths.js';
import { LoomError } from '../domain/errors.js';
import type { PublishedArtifactDisposition } from '../domain/generation-result.js';
import { compareCodePoints } from '../domain/ordering.js';
import type { OutputRootRegistry } from '../application/planning/output-root-registry.js';
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
  readonly resourceId?: string;
  readonly role?: string;
  readonly outputRootId?: string;
  readonly outputRootPath?: string;
  readonly relativePath?: string;
  readonly publicPath?: string;
  readonly mediaType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly hashToken?: string;
}

export interface StaleOwnedOutput {
  readonly absolutePath: string;
  readonly entry: ManifestFile;
  readonly relativePath: string;
}

export interface PreparedMaterializedOwnedOutput extends MaterializedOwnedOutput {
  readonly expectedSha256: string | undefined;
  readonly desiredSha256: string;
  readonly resourceId: string;
  readonly role: string;
  readonly outputRootId: string;
  readonly outputRootPath: string;
  readonly relativePath: string;
  readonly hashToken: string;
}

export interface PreparedOwnedOutputPublication {
  readonly manifest: AssetloomManifest;
  readonly outputs: readonly PreparedMaterializedOwnedOutput[];
  readonly stale: readonly StaleOwnedOutput[];
}

export interface PrepareOwnedOutputOptions {
  /** Internal recovery proof: a matching durable intent owns equal final bytes. */
  readonly recoverMatchingPendingIntent?: boolean;
}

export interface OwnedOutputPublicationResult {
  readonly written: readonly string[];
  readonly unchanged: readonly string[];
  readonly removed: readonly string[];
  readonly published: readonly PublishedOwnedOutputRecord[];
  readonly removedArtifacts: readonly RemovedOwnedOutputRecord[];
}

export interface PublishedOwnedOutputRecord {
  readonly artifactId: string;
  readonly resourceId: string;
  readonly targetId: string;
  readonly role: string;
  readonly outputRootId: string;
  readonly relativePath: string;
  readonly publicPath?: string;
  readonly disposition: PublishedArtifactDisposition;
  readonly mediaType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly hashToken: string;
}

export interface RemovedOwnedOutputRecord {
  readonly artifactId: string;
  readonly targetId: string;
  readonly outputRootId: string;
  readonly relativePath: string;
  readonly sha256: string;
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
  readonly #outputRoots: OutputRootRegistry | undefined;
  readonly #projectRoot: string;
  readonly #writer: AtomicWriter;

  constructor(projectRoot: string, outputRoots?: OutputRootRegistry) {
    this.#projectRoot = path.resolve(projectRoot);
    this.#outputRoots = outputRoots;
    this.#writer = new AtomicWriter(this.#projectRoot);
  }

  async prepare(
    outputs: readonly MaterializedOwnedOutput[],
    previous: AssetloomManifest,
    selectedTargets: readonly string[],
    options: PrepareOwnedOutputOptions = {},
  ): Promise<PreparedOwnedOutputPublication> {
    const normalizedPrevious = await this.normalizeManifest(previous);
    const selectedTargetSet = new Set(selectedTargets);
    const selectedFiles: Record<string, ManifestFile> = {};
    const preparedOutputs: PreparedMaterializedOwnedOutput[] = [];
    const destinations = new Set<string>();
    const retainedEntries = Object.entries(normalizedPrevious.files).filter(
      ([, entry]) => !selectedTargetSet.has(entry.target),
    );
    const retainedByDestination = new Map(
      retainedEntries.map(([relative, entry]) => [
        relative.toLocaleLowerCase('en-US'),
        { entry, relative },
      ]),
    );

    for (const output of outputs) {
      const identity = await this.#publicationIdentity(output);
      await assertSafeDestination(this.#projectRoot, identity.destination);
      if (!selectedTargetSet.has(output.target)) {
        throw new LoomError({
          code: 'LOOM_PLAN_INVALID',
          message: 'A materialized output is outside the selected target scope.',
          context: {
            destination: identity.destination,
            target: output.target,
            taskId: output.artifactId,
          },
        });
      }
      const relative = portableRelativePath(
        this.#projectRoot,
        identity.destination,
      );
      const collisionKey = relative.toLocaleLowerCase('en-US');
      const retainedOwner = retainedByDestination.get(collisionKey);
      if (retainedOwner !== undefined) {
        throw new LoomError({
          code: 'LOOM_PLAN_COLLISION',
          message:
            'A selected output destination is already owned by a retained target.',
          context: {
            destination: identity.destination,
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
          context: { destination: identity.destination },
        });
      }
      destinations.add(collisionKey);

      const expectedSha256 = await this.#assertWritable(
        { ...output, destination: identity.destination },
        normalizedPrevious,
        relative,
        options.recoverMatchingPendingIntent === true,
      );
      const desiredSha256 = sha256(output.content);
      preparedOutputs.push({
        ...output,
        destination: identity.destination,
        expectedSha256,
        desiredSha256,
        resourceId: output.resourceId ?? output.artifactId.split(':')[0] ?? output.artifactId,
        role: output.role ?? 'assetloom.output',
        outputRootId: identity.outputRootId,
        outputRootPath: this.#rootPath(identity.outputRootId),
        relativePath: identity.relativePath,
        hashToken: output.hashToken ?? desiredSha256,
      });
      selectedFiles[relative] = {
        sha256: desiredSha256,
        taskId: output.artifactId,
        target: output.target,
        outputRootId: identity.outputRootId,
        outputRootPath: this.#rootPath(identity.outputRootId),
      };
    }

    const retainedFiles = Object.fromEntries(retainedEntries);
    const nextFiles = Object.fromEntries(
      Object.entries({ ...retainedFiles, ...selectedFiles }).sort(
        ([left], [right]) => compareCodePoints(left, right),
      ),
    );
    const stale = Object.entries(normalizedPrevious.files)
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
      await this.#staleIdentity(candidate);
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
    const published: PublishedOwnedOutputRecord[] = [];
    for (const output of prepared.outputs) {
      await this.#assertUnchangedSincePreflight(output);
      const disposition = await this.#writer.writeIfChanged(
        output.destination,
        output.content,
      );
      (disposition === 'written' ? written : unchanged).push(
        output.destination,
      );
      const publishedDisposition: PublishedArtifactDisposition =
        output.expectedSha256 === undefined
          ? 'created'
          : output.expectedSha256 === output.desiredSha256
            ? 'unchanged'
            : 'updated';
      published.push({
        artifactId: output.artifactId,
        resourceId: output.resourceId,
        targetId: output.target,
        role: output.role,
        outputRootId: output.outputRootId,
        relativePath: output.relativePath,
        ...(output.publicPath === undefined ? {} : { publicPath: output.publicPath }),
        disposition: publishedDisposition,
        ...(output.mediaType === undefined ? {} : { mediaType: output.mediaType }),
        ...(output.width === undefined ? {} : { width: output.width }),
        ...(output.height === undefined ? {} : { height: output.height }),
        sizeBytes: output.content.byteLength,
        sha256: output.desiredSha256,
        hashToken: output.hashToken,
      });
    }

    const removed: string[] = [];
    const removedArtifacts: RemovedOwnedOutputRecord[] = [];
    for (const candidate of prepared.stale) {
      try {
        await this.#assertRemovable(candidate);
        const identity = await this.#staleIdentity(candidate);
        await rm(candidate.absolutePath);
        removed.push(candidate.absolutePath);
        removedArtifacts.push({
          artifactId: candidate.entry.taskId,
          targetId: candidate.entry.target,
          outputRootId: identity.outputRootId,
          relativePath: identity.relativePath,
          sha256: candidate.entry.sha256,
        });
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
    return { written, unchanged, removed, published, removedArtifacts };
  }

  async #publicationIdentity(output: MaterializedOwnedOutput): Promise<{
    readonly destination: string;
    readonly outputRootId: string;
    readonly relativePath: string;
  }> {
    if (this.#outputRoots === undefined) {
      return {
        destination: path.resolve(output.destination),
        outputRootId: output.outputRootId ?? output.target,
        relativePath:
          output.relativePath ?? portableRelativePath(this.#projectRoot, output.destination),
      };
    }
    if (output.outputRootId !== undefined && output.relativePath !== undefined) {
      const resolved = await this.#outputRoots.resolve(
        output.outputRootId,
        output.relativePath,
      );
      if (path.resolve(output.destination) !== resolved.destination) {
        throw new LoomError({
          code: 'LOOM_PLAN_INVALID',
          message: 'An artifact destination disagrees with its declared output-root path.',
          context: {
            destination: output.destination,
            resolvedDestination: resolved.destination,
          },
        });
      }
      return resolved;
    }
    return this.#outputRoots.identify(output.target, output.destination);
  }

  async #staleIdentity(candidate: StaleOwnedOutput): Promise<{
    readonly outputRootId: string;
    readonly relativePath: string;
  }> {
    if (this.#outputRoots === undefined) {
      return {
        outputRootId: candidate.entry.target,
        relativePath: candidate.relativePath,
      };
    }
    return this.#outputRoots.identify(
      candidate.entry.target,
      candidate.absolutePath,
    );
  }

  async normalizeManifest(
    manifest: AssetloomManifest,
  ): Promise<AssetloomManifest> {
    if (this.#outputRoots === undefined) {
      return manifest;
    }
    const files: Record<string, ManifestFile> = {};
    for (const [relativePath, entry] of Object.entries(manifest.files)) {
      const absolutePath = path.resolve(this.#projectRoot, relativePath);
      const identity = await this.#outputRoots.identify(entry.target, absolutePath);
      const outputRootPath = this.#rootPath(identity.outputRootId);
      if (
        entry.outputRootId !== undefined &&
        entry.outputRootId !== identity.outputRootId
      ) {
        throw new LoomError({
          code: 'LOOM_MANIFEST_INVALID',
          message: 'A manifest entry disagrees with its declared output root.',
          context: {
            outputRootId: entry.outputRootId,
            path: relativePath,
            resolvedOutputRootId: identity.outputRootId,
          },
        });
      }
      if (
        entry.outputRootPath !== undefined &&
        entry.outputRootPath !== outputRootPath
      ) {
        throw new LoomError({
          code: 'LOOM_MANIFEST_INVALID',
          message: 'A manifest entry disagrees with its declared output-root path.',
          context: {
            outputRootPath: entry.outputRootPath,
            path: relativePath,
            resolvedOutputRootPath: outputRootPath,
          },
        });
      }
      files[relativePath] = {
        ...entry,
        outputRootId: identity.outputRootId,
        outputRootPath,
      };
    }
    return { version: 1, files };
  }

  #rootPath(outputRootId: string): string {
    if (this.#outputRoots === undefined) {
      return '.';
    }
    const relative = portableRelativePath(
      this.#projectRoot,
      this.#outputRoots.definition(outputRootId).root,
    );
    return relative === '' ? '.' : relative;
  }

  async #assertWritable(
    output: MaterializedOwnedOutput,
    previous: AssetloomManifest,
    relative: string,
    recoverMatchingPendingIntent: boolean,
  ): Promise<string | undefined> {
    const previousEntry = previous.files[relative];
    try {
      const current = await readFile(output.destination);
      if (previousEntry === undefined) {
        if (recoverMatchingPendingIntent && current.equals(output.content)) {
          return sha256(current);
        }
        throw new LoomError({
          code: 'LOOM_WRITE_CONFLICT',
          message: 'Refusing to overwrite or claim a file not owned by Assetloom.',
          context: {
            destination: output.destination,
            taskId: output.artifactId,
          },
        });
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

}
