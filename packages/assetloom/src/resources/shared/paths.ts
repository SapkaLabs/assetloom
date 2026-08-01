import path from 'node:path';
import { assertInsideRoot } from '../../config/paths.js';
import { LoomError } from '../../domain/errors.js';

export function portablePath(value: string): string {
  return value.split(path.sep).join('/');
}

export function resolveTargetPath(
  targetRoot: string,
  configuredPath: string,
  jsonPointer: string,
): string {
  if (configuredPath.trim() === '' || configuredPath.includes('\0')) {
    throw new LoomError({
      code: 'LOOM_PLAN_INVALID',
      message: 'Catalog output path must be a non-empty safe path.',
      context: { jsonPointer, path: configuredPath },
    });
  }
  const destination = path.resolve(targetRoot, configuredPath);
  assertInsideRoot(targetRoot, destination);
  return destination;
}

export function extensionWithoutDot(filename: string): string {
  return path.extname(filename).replace(/^\./, '');
}

export function baseNameWithoutExtension(filename: string): string {
  return path.basename(filename, path.extname(filename));
}
