import path from 'node:path';
import {
  stableGenerationResultJson,
  type GenerationResultV1,
} from '../domain/generation-result.js';
import { LoomError } from '../domain/errors.js';
import { AtomicWriter, type WriteDisposition } from '../storage/atomic-writer.js';
import { ProjectStatePathGuard } from '../storage/state-path-guard.js';

export interface CliGenerationResultFile {
  readonly disposition: WriteDisposition;
  readonly path: string;
}

function normalizedSegments(configuredPath: string): readonly string[] {
  if (
    configuredPath === '' ||
    configuredPath !== configuredPath.trim() ||
    configuredPath.includes('\0') ||
    path.isAbsolute(configuredPath) ||
    path.win32.isAbsolute(configuredPath) ||
    path.posix.isAbsolute(configuredPath)
  ) {
    throw invalidResultPath(configuredPath);
  }
  const segments = configuredPath.split(/[\\/]/u);
  if (
    segments.length === 0 ||
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    throw invalidResultPath(configuredPath);
  }
  return segments;
}

function invalidResultPath(configuredPath: string): LoomError {
  return new LoomError({
    code: 'LOOM_CFG_PATH_INVALID',
    message:
      'CLI result-file paths must be normalized relative paths beneath .assetloom/results.',
    context: { path: configuredPath },
  });
}

export async function writeCliGenerationResultFile(
  projectRoot: string,
  configuredPath: string,
  result: GenerationResultV1,
): Promise<CliGenerationResultFile> {
  const segments = normalizedSegments(configuredPath);
  const stateRoot = path.join(projectRoot, '.assetloom');
  const resultRoot = path.join(stateRoot, 'results');
  const destination = path.join(resultRoot, ...segments);
  const statePaths = new ProjectStatePathGuard(projectRoot, stateRoot);
  await statePaths.assertSafe(destination);
  const disposition = await new AtomicWriter(resultRoot).writeIfChanged(
    destination,
    Buffer.from(stableGenerationResultJson(result), 'utf8'),
  );
  return {
    disposition,
    path: ['.assetloom', 'results', ...segments].join('/'),
  };
}
