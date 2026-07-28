import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
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

async function run(
  command: string,
  args: readonly string[],
  cwd: string,
  errorCode:
    | 'LOOM_ANDROID_BUILD_VERIFICATION_FAILED'
    | 'LOOM_IOS_BUILD_VERIFICATION_FAILED',
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });
    child.once('error', (cause) => {
      reject(
        new LoomError({
          code: errorCode,
          message: `Native verification command "${command}" failed to start.`,
          cause,
          context: { command, args, cwd },
        }),
      );
    });
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new LoomError({
            code: errorCode,
            message: `Native verification command "${command}" failed.`,
            context: { command, args, cwd, exitCode: code },
          }),
        );
      }
    });
  });
}

async function findUp(
  start: string,
  filename: string,
  boundary: string,
): Promise<string | undefined> {
  let directory = path.resolve(start);
  const root = path.resolve(boundary);
  for (;;) {
    const candidate = path.join(directory, filename);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue toward the project boundary.
    }
    if (directory === root) {
      return undefined;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

async function verifyNativeTarget(
  loaded: LoadedConfiguration,
  target: TargetPlatform,
): Promise<void> {
  if (target === 'android') {
    const androidTarget = loaded.config.targets.android;
    if (androidTarget === undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'Android native verification was requested without an Android target.',
      });
    }
    const manifestPath = path.resolve(
      loaded.projectRoot,
      androidTarget.manifestPath,
    );
    const wrapper = await findUp(
      path.dirname(manifestPath),
      process.platform === 'win32' ? 'gradlew.bat' : 'gradlew',
      loaded.projectRoot,
    );
    if (wrapper === undefined) {
      throw new LoomError({
        code: 'LOOM_ANDROID_BUILD_VERIFICATION_FAILED',
        message: 'Could not locate a Gradle wrapper for native verification.',
      });
    }
    await run(wrapper, [':app:processDebugResources'], path.dirname(wrapper), 'LOOM_ANDROID_BUILD_VERIFICATION_FAILED');
    return;
  }

  if (process.platform !== 'darwin') {
    throw new LoomError({
      code: 'LOOM_IOS_BUILD_VERIFICATION_FAILED',
      message: 'iOS native verification requires macOS and Xcode.',
    });
  }
  const iosTarget = loaded.config.targets.ios;
  if (iosTarget === undefined) {
    throw new LoomError({
      code: 'LOOM_PLAN_INVALID',
      message: 'iOS native verification was requested without an iOS target.',
    });
  }
  const projectFile = path.resolve(
    loaded.projectRoot,
    iosTarget.projectFile,
  );
  const xcodeProject = path.dirname(projectFile);
  const scheme = path.basename(xcodeProject, '.xcodeproj');
  await run(
    'xcodebuild',
    [
      '-project',
      xcodeProject,
      '-scheme',
      scheme,
      '-sdk',
      'iphonesimulator',
      '-configuration',
      'Debug',
      'CODE_SIGNING_ALLOWED=NO',
      'build',
    ],
    path.dirname(xcodeProject),
    'LOOM_IOS_BUILD_VERIFICATION_FAILED',
  );
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
    if (task.operation === 'update-project') {
      await access(task.destination);
      checked.push(task.destination);
      continue;
    }
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
  if (options.native === true) {
    for (const target of plan.targets) {
      await verifyNativeTarget(loaded, target);
    }
  } else {
    skippedNativeChecks.push(...plan.targets);
  }

  return { ok: true, checked, skippedNativeChecks };
}
