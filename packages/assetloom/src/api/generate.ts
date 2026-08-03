import {
  lstat,
  readdir,
  readFile,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import { assertSafeDestination } from '../config/paths.js';
import { LoomError } from '../domain/errors.js';
import type {
  GenerationPlan,
  GenerationResult,
  GenerationTask,
  LoadedConfiguration,
  TargetPlatform,
} from '../domain/types.js';
import { createGenerationPlan } from '../planner/index.js';
import { SharpRenderer } from '../renderers/sharp-renderer.js';
import { AtomicWriter } from '../storage/atomic-writer.js';
import { ContentCache } from '../storage/cache.js';
import { sha256 } from '../storage/hash.js';
import {
  type AssetloomManifest,
  type ManifestFile,
  ManifestStore,
} from '../storage/manifest.js';
import { ProjectLock } from '../storage/lock.js';
import { PendingGenerationStore } from '../storage/pending-generation-store.js';
import { ProjectStatePathGuard } from '../storage/state-path-guard.js';
import { androidTaskContent } from '../targets/android/content.js';
import { iosTaskContent } from '../targets/ios/content.js';

interface Output {
  readonly destination: string;
  readonly content: Buffer;
  readonly task: GenerationTask;
}

function manifestPath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

async function copyDirectoryOutputs(
  task: GenerationTask,
  source: string,
  destination: string,
): Promise<Output[]> {
  const sourceStat = await lstat(source);
  if (sourceStat.isSymbolicLink()) {
    throw new LoomError({
      code: 'LOOM_SRC_SECURITY_VIOLATION',
      message: 'Symbolic links are not allowed in copied source directories.',
      context: { sourcePath: source },
    });
  }
  if (sourceStat.isFile()) {
    return [
      {
        destination,
        content: await readFile(source),
        task,
      },
    ];
  }
  if (!sourceStat.isDirectory()) {
    throw new LoomError({
      code: 'LOOM_SRC_INVALID',
      message: 'Copied source must be a regular file or directory.',
      context: { sourcePath: source },
    });
  }
  const outputs: Output[] = [];
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const childSource = path.join(source, entry.name);
    const childDestination = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) {
      throw new LoomError({
        code: 'LOOM_SRC_SECURITY_VIOLATION',
        message: 'Symbolic links are not allowed in copied source directories.',
        context: { sourcePath: childSource },
      });
    }
    if (entry.isDirectory()) {
      outputs.push(
        ...(await copyDirectoryOutputs(task, childSource, childDestination)),
      );
    } else if (entry.isFile()) {
      outputs.push({
        destination: childDestination,
        content: await readFile(childSource),
        task,
      });
    }
  }
  return outputs;
}

async function executeTask(
  task: GenerationTask,
  loaded: LoadedConfiguration,
  renderer: SharpRenderer,
): Promise<Output[]> {
  if (task.operation === 'render') {
    return [
      {
        destination: task.destination,
        content: await renderer.render(task),
        task,
      },
    ];
  }
  if (task.operation === 'copy') {
    const source = task.sourceDependencies[0];
    if (source === undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: `Copy task "${task.id}" has no source dependency.`,
      });
    }
    if (
      task.target === 'ios' &&
      task.resourceType === 'app-icon' &&
      task.format === 'directory' &&
      path.extname(source).toLocaleLowerCase('en-US') !== '.icon'
    ) {
      throw new LoomError({
        code: 'LOOM_SRC_INVALID',
        message: 'Icon Composer source must be a .icon directory.',
        context: { sourcePath: source, resourceId: task.resourceId },
      });
    }
    return copyDirectoryOutputs(task, source, task.destination);
  }

  const content =
    task.target === 'android'
      ? androidTaskContent(task, loaded.config)
      : iosTaskContent(task, loaded.config);
  return [
    {
      destination: task.destination,
      content,
      task,
    },
  ];
}

async function assertWritableOutput(
  output: Output,
  projectRoot: string,
  previousManifest: AssetloomManifest,
): Promise<void> {
  const relative = manifestPath(projectRoot, output.destination);
  const previous = previousManifest.files[relative];
  if (previous !== undefined) {
    try {
      const current = await readFile(output.destination);
      if (
        sha256(current) !== previous.sha256 &&
        !current.equals(output.content)
      ) {
        throw new LoomError({
          code: 'LOOM_WRITE_CONFLICT',
          message: 'Refusing to overwrite an Assetloom output modified after generation.',
          context: {
            destination: output.destination,
            taskId: previous.taskId,
          },
        });
      }
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;
      if (code !== 'ENOENT') {
        throw error;
      }
    }
    return;
  }
  try {
    const existing = await readFile(output.destination);
    if (!existing.equals(output.content)) {
      throw new LoomError({
        code: 'LOOM_WRITE_CONFLICT',
        message: 'Refusing to overwrite a file not owned by Assetloom.',
        context: { destination: output.destination },
      });
    }
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? error.code
        : undefined;
    if (code !== 'ENOENT') {
      throw error;
    }
  }
}

async function removeStaleFiles(
  projectRoot: string,
  previous: AssetloomManifest,
  nextFiles: Readonly<Record<string, ManifestFile>>,
  targets: readonly string[],
): Promise<string[]> {
  const stale = Object.entries(previous.files).filter(
    ([relative, entry]) =>
      targets.includes(entry.target) && nextFiles[relative] === undefined,
  );

  for (const [relative, entry] of stale) {
    const absolute = path.resolve(projectRoot, relative);
    await assertSafeDestination(projectRoot, absolute);
    try {
      const current = await readFile(absolute);
      if (sha256(current) !== entry.sha256) {
        throw new LoomError({
          code: 'LOOM_CLEAN_UNOWNED_FILE',
          message: 'Refusing to remove an Assetloom output modified after generation.',
          context: { destination: absolute, taskId: entry.taskId },
        });
      }
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;
      if (code !== 'ENOENT') {
        throw error;
      }
    }
  }

  const removed: string[] = [];
  for (const [relative] of stale) {
    const absolute = path.resolve(projectRoot, relative);
    await assertSafeDestination(projectRoot, absolute);
    try {
      await rm(absolute);
      removed.push(absolute);
      let directory = path.dirname(absolute);
      while (directory !== projectRoot) {
        try {
          await rm(directory);
        } catch {
          break;
        }
        directory = path.dirname(directory);
      }
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;
      if (code !== 'ENOENT') {
        throw new LoomError({
          code: 'LOOM_CLEAN_FAILED',
          message: 'Failed to remove a stale Assetloom output.',
          cause: error,
          context: { destination: absolute },
        });
      }
    }
  }
  return removed;
}

export interface GenerateOptions {
  readonly target?: TargetPlatform;
}

export async function generate(
  loaded: LoadedConfiguration,
  options: GenerateOptions = {},
): Promise<GenerationResult> {
  const plan: GenerationPlan = await createGenerationPlan(
    loaded,
    options.target,
  );
  const stateDirectory = path.join(loaded.projectRoot, '.assetloom');
  const statePaths = new ProjectStatePathGuard(loaded.projectRoot, stateDirectory);
  const lock = new ProjectLock(stateDirectory, statePaths);
  await lock.acquire();
  try {
    await new PendingGenerationStore(
      stateDirectory,
      statePaths,
    ).assertNoPending('schema-v1 generate');
    const manifestStore = new ManifestStore(
      loaded.projectRoot,
      stateDirectory,
    );
    const previous = await manifestStore.load();
    const cache = new ContentCache(stateDirectory);
    const renderer = new SharpRenderer(cache);
    const outputs: Output[] = [];
    for (const task of plan.tasks) {
      outputs.push(...(await executeTask(task, loaded, renderer)));
    }

    for (const output of outputs) {
      await assertWritableOutput(output, loaded.projectRoot, previous);
    }

    const writer = new AtomicWriter(loaded.projectRoot);
    const written: string[] = [];
    const unchanged: string[] = [];
    const selectedFiles: Record<string, ManifestFile> = {};
    for (const output of outputs) {
      const disposition = await writer.writeIfChanged(
        output.destination,
        output.content,
      );
      (disposition === 'written' ? written : unchanged).push(
        output.destination,
      );
      selectedFiles[manifestPath(loaded.projectRoot, output.destination)] = {
          sha256: sha256(output.content),
          taskId: output.task.id,
          target: output.task.target,
      };
    }

    const selectedTargetSet: ReadonlySet<string> = new Set(plan.targets);
    const retainedFiles = Object.fromEntries(
      Object.entries(previous.files).filter(
        ([, entry]) => !selectedTargetSet.has(entry.target),
      ),
    );
    const nextFiles: Record<string, ManifestFile> = {
      ...retainedFiles,
      ...selectedFiles,
    };
    const removed = await removeStaleFiles(
      loaded.projectRoot,
      previous,
      nextFiles,
      plan.targets,
    );
    await manifestStore.save({ version: 1, files: nextFiles });

    return { plan, written, unchanged, removed };
  } finally {
    await lock.release();
  }
}

export async function clean(
  loaded: LoadedConfiguration,
  target?: TargetPlatform,
): Promise<readonly string[]> {
  const stateDirectory = path.join(loaded.projectRoot, '.assetloom');
  const statePaths = new ProjectStatePathGuard(loaded.projectRoot, stateDirectory);
  const lock = new ProjectLock(stateDirectory, statePaths);
  await lock.acquire();
  try {
    await new PendingGenerationStore(
      stateDirectory,
      statePaths,
    ).assertNoPending('schema-v1 clean');
    const manifestStore = new ManifestStore(
      loaded.projectRoot,
      stateDirectory,
    );
    const manifest = await manifestStore.load();
    const targets: readonly TargetPlatform[] =
      target === undefined ? ['android', 'ios'] : [target];
    const selectedTargetSet: ReadonlySet<string> = new Set(targets);
    const retainedFiles = Object.fromEntries(
      Object.entries(manifest.files).filter(
        ([, entry]) => !selectedTargetSet.has(entry.target),
      ),
    );
    const removed = await removeStaleFiles(
      loaded.projectRoot,
      manifest,
      retainedFiles,
      targets,
    );
    await manifestStore.save({ version: 1, files: retainedFiles });
    return removed;
  } finally {
    await lock.release();
  }
}
