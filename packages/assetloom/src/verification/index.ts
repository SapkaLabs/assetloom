import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { LoomError } from '../domain/errors.js';
import type {
  GenerationTask,
  LoadedConfiguration,
  TargetPlatform,
  VerificationResult,
} from '../domain/types.js';
import { createGenerationPlan } from '../planner/index.js';
import { sha256 } from '../storage/hash.js';
import { ManifestStore } from '../storage/manifest.js';

function relative(projectRoot: string, filename: string): string {
  return path.relative(projectRoot, filename).split(path.sep).join('/');
}

async function verifyImage(task: GenerationTask, content: Buffer): Promise<void> {
  try {
    const metadata = await sharp(content).metadata();
    if (
      metadata.width !== task.width ||
      metadata.height !== task.height ||
      metadata.format !== task.format ||
      (task.target === 'ios' &&
        task.resourceType === 'app-icon' &&
        metadata.hasAlpha)
    ) {
      throw new LoomError({
        code: 'LOOM_VERIFY_IMAGE_INVALID',
        message: 'Generated image dimensions or format do not match the plan.',
        context: {
          destination: task.destination,
          expectedWidth: task.width,
          expectedHeight: task.height,
          actualWidth: metadata.width,
          actualHeight: metadata.height,
          expectedFormat: task.format,
          actualFormat: metadata.format,
          hasAlpha: metadata.hasAlpha,
        },
      });
    }
  } catch (cause) {
    if (cause instanceof LoomError) {
      throw cause;
    }
    throw new LoomError({
      code: 'LOOM_VERIFY_IMAGE_INVALID',
      message: 'Generated image could not be decoded.',
      cause,
      context: { destination: task.destination },
    });
  }
}

function verifyStructuredContent(task: GenerationTask, content: Buffer): void {
  if (task.format === 'json') {
    try {
      JSON.parse(content.toString('utf8'));
    } catch (cause) {
      throw new LoomError({
        code: 'LOOM_VERIFY_FAILED',
        message: 'Generated JSON is invalid.',
        cause,
        context: { destination: task.destination },
      });
    }
  }
  if (
    task.format === 'xml' &&
    !content.toString('utf8').trimStart().startsWith('<?xml')
  ) {
    throw new LoomError({
      code: 'LOOM_VERIFY_FAILED',
      message: 'Generated XML does not contain an XML declaration.',
      context: { destination: task.destination },
    });
  }
}

export interface VerifyOptions {
  readonly target?: TargetPlatform;
  readonly native?: boolean;
}

export async function verify(
  loaded: LoadedConfiguration,
  options: VerifyOptions = {},
): Promise<VerificationResult> {
  const plan = await createGenerationPlan(loaded, options.target);
  const manifest = await new ManifestStore(
    loaded.projectRoot,
    path.join(loaded.projectRoot, '.assetloom'),
  ).load();
  const checked: string[] = [];

  for (const task of plan.tasks) {
    if (task.operation === 'copy' && task.format === 'directory') {
      const prefix = `${relative(loaded.projectRoot, task.destination)}/`;
      if (!Object.keys(manifest.files).some((item) => item.startsWith(prefix))) {
        throw new LoomError({
          code: 'LOOM_VERIFY_FAILED',
          message: 'Generated directory is absent from the Assetloom manifest.',
          context: { destination: task.destination },
        });
      }
      continue;
    }
    let content: Buffer;
    try {
      content = await readFile(task.destination);
    } catch (cause) {
      throw new LoomError({
        code: 'LOOM_VERIFY_FAILED',
        message: 'A planned Assetloom output is missing.',
        cause,
        context: { destination: task.destination, taskId: task.id },
      });
    }
    const entry = manifest.files[relative(loaded.projectRoot, task.destination)];
    if (entry === undefined || entry.sha256 !== sha256(content)) {
      throw new LoomError({
        code: 'LOOM_VERIFY_FAILED',
        message: 'Generated output does not match the Assetloom manifest.',
        context: { destination: task.destination, taskId: task.id },
      });
    }
    if (task.operation === 'render') {
      await verifyImage(task, content);
    } else {
      verifyStructuredContent(task, content);
    }
    if (
      task.target === 'android' &&
      !/^[a-z][a-z0-9_]*\.(?:png|webp|xml)$/.test(
        path.basename(task.destination),
      ) &&
      path.basename(task.destination) !== 'AndroidManifest.xml'
    ) {
      throw new LoomError({
        code: 'LOOM_ANDROID_RESOURCE_INVALID',
        message: 'Generated Android resource name is invalid.',
        context: { destination: task.destination },
      });
    }
    checked.push(task.destination);
  }

  const skippedNativeChecks: string[] = [];
  skippedNativeChecks.push(...plan.targets);

  return { ok: true, checked, skippedNativeChecks };
}
