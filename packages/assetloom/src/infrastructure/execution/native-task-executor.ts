import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { NativeTaskExecutor, PreparedNativeExecution } from '../../application/execution/native-execution.js';
import type {
  GenerationTask,
  LoadedConfiguration,
} from '../../domain/types.js';
import { LoomError } from '../../domain/errors.js';
import type { SharpRenderer } from '../../renderers/sharp-renderer.js';
import { androidTaskContent } from '../../targets/android/content.js';
import { iosTaskContent } from '../../targets/ios/content.js';

interface NativeContent {
  readonly content: Uint8Array;
  readonly destination: string;
}

async function copyOutputs(
  task: GenerationTask,
  source: string,
  destination: string,
): Promise<readonly NativeContent[]> {
  const sourceStat = await lstat(source);
  if (sourceStat.isSymbolicLink()) {
    throw new LoomError({
      code: 'LOOM_SRC_SECURITY_VIOLATION',
      message: 'Symbolic links are not allowed in copied source directories.',
      context: { sourcePath: source },
    });
  }
  if (sourceStat.isFile()) {
    return [{ destination, content: await readFile(source) }];
  }
  if (!sourceStat.isDirectory()) {
    throw new LoomError({
      code: 'LOOM_SRC_INVALID',
      message: 'Copied source must be a regular file or directory.',
      context: { sourcePath: source },
    });
  }
  const outputs: NativeContent[] = [];
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
        ...(await copyOutputs(task, childSource, childDestination)),
      );
    } else if (entry.isFile()) {
      outputs.push({
        destination: childDestination,
        content: await readFile(childSource),
      });
    }
  }
  return outputs;
}

export class DefaultNativeTaskExecutor implements NativeTaskExecutor {
  readonly #renderer: SharpRenderer;

  constructor(renderer: SharpRenderer) {
    this.#renderer = renderer;
  }

  async prepare(
    tasks: readonly GenerationTask[],
    loaded: LoadedConfiguration,
  ): Promise<PreparedNativeExecution> {
    const ownedOutputs: PreparedNativeExecution['ownedOutputs'][number][] = [];
    for (const task of tasks) {
      const outputs = await this.#executeTask(task, loaded);
      for (const [index, output] of outputs.entries()) {
          ownedOutputs.push({
            artifactId: index === 0
              ? task.id
              : `${task.id}:${path.relative(task.destination, output.destination).split(path.sep).join('/')}`,
            content: output.content,
            destination: output.destination,
            target: task.target,
          });
      }
    }
    return {
      ownedOutputs,
      usage: tasks.flatMap((task) => task.usage ?? []),
    };
  }

  async #executeTask(
    task: GenerationTask,
    loaded: LoadedConfiguration,
  ): Promise<readonly NativeContent[]> {
    if (task.operation === 'render') {
      return [
        {
          destination: task.destination,
          content: await this.#renderer.render(task),
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
      return copyOutputs(task, source, task.destination);
    }
    const content =
      task.target === 'android'
        ? androidTaskContent(task, loaded.config)
        : iosTaskContent(task, loaded.config);
    return [{ destination: task.destination, content }];
  }
}
