import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { LoomError } from '../domain/errors.js';

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

export function resolveProjectPath(
  projectRoot: string,
  configuredPath: string,
  jsonPointer: string,
): string {
  if (configuredPath.trim() === '' || configuredPath.includes('\0')) {
    throw new LoomError({
      code: 'LOOM_CFG_PATH_INVALID',
      message: 'Assetloom configuration contains an invalid path.',
      context: { jsonPointer, path: configuredPath },
    });
  }

  const resolved = path.resolve(projectRoot, configuredPath);
  if (!isInside(projectRoot, resolved)) {
    throw new LoomError({
      code: 'LOOM_CFG_PATH_INVALID',
      message: 'Assetloom configuration path resolves outside the project root.',
      context: { jsonPointer, path: configuredPath, projectRoot },
    });
  }
  return resolved;
}

export async function resolveSourcePath(
  projectRoot: string,
  configuredPath: string,
  jsonPointer: string,
): Promise<string> {
  const resolved = resolveProjectPath(projectRoot, configuredPath, jsonPointer);
  let canonical: string;
  try {
    canonical = await realpath(resolved);
  } catch (cause) {
    throw new LoomError({
      code: 'LOOM_SRC_NOT_FOUND',
      message: `Source file "${configuredPath}" was not found.`,
      cause,
      context: { jsonPointer, sourcePath: resolved },
    });
  }

  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(projectRoot);
  } catch {
    canonicalRoot = projectRoot;
  }

  if (!isInside(canonicalRoot, canonical)) {
    throw new LoomError({
      code: 'LOOM_SRC_SECURITY_VIOLATION',
      message: 'Source resolves outside the Assetloom project root.',
      context: { jsonPointer, sourcePath: canonical, projectRoot: canonicalRoot },
    });
  }

  return canonical;
}

export function assertInsideRoot(root: string, candidate: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (!isInside(resolvedRoot, resolvedCandidate)) {
    throw new LoomError({
      code: 'LOOM_WRITE_OUTSIDE_ROOT',
      message: 'Refusing to write outside the Assetloom project root.',
      context: { projectRoot: resolvedRoot, destination: resolvedCandidate },
    });
  }
}

export async function assertSafeDestination(
  root: string,
  candidate: string,
): Promise<void> {
  assertInsideRoot(root, candidate);
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(resolvedRoot);
  } catch {
    canonicalRoot = resolvedRoot;
  }

  let current = canonicalRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink()) {
        throw new LoomError({
          code: 'LOOM_WRITE_OUTSIDE_ROOT',
          message: 'Refusing to write through a symbolic link.',
          context: {
            projectRoot: canonicalRoot,
            destination: resolvedCandidate,
            symbolicLink: current,
          },
        });
      }
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;
      if (code === 'ENOENT') {
        break;
      }
      throw error;
    }
  }
}
