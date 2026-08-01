import { createRequire } from 'node:module';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'tinyglobby';
import type { SourceResolver } from '../../application/planning/contracts.js';
import { resolveSourcePath } from '../../config/paths.js';
import { LoomError } from '../../domain/errors.js';
import { compareCodePoints } from '../../domain/ordering.js';
import type {
  PackageSourceDefinition,
  ResolvedSource,
  SourceDefinition,
} from '../../domain/catalog/sources.js';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function portablePath(value: string): string {
  return value.split(path.sep).join('/');
}

function assertSafeGlobPattern(pattern: string, jsonPointer: string): void {
  const normalized = pattern.replaceAll('\\', '/');
  if (
    normalized.trim() === '' ||
    normalized.includes('\0') ||
    path.posix.isAbsolute(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new LoomError({
      code: 'LOOM_SRC_SECURITY_VIOLATION',
      message: 'Source glob patterns must stay inside their declared root.',
      context: { jsonPointer, pattern },
    });
  }
}

async function assertRegularFile(
  filename: string,
  jsonPointer: string,
): Promise<void> {
  const details = await stat(filename).catch(() => null);
  if (details === null || !details.isFile()) {
    throw new LoomError({
      code: 'LOOM_SRC_INVALID',
      message: 'Configured source does not resolve to a regular file.',
      context: { jsonPointer, sourcePath: filename },
    });
  }
}

async function packageNameAt(directory: string): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(path.join(directory, 'package.json'), 'utf8'),
    );
    return isRecord(parsed) && typeof parsed['name'] === 'string'
      ? parsed['name']
      : null;
  } catch {
    return null;
  }
}

async function findPackageRoot(
  resolvedEntry: string,
  packageName: string,
): Promise<string | null> {
  let directory = path.dirname(resolvedEntry);
  for (;;) {
    if ((await packageNameAt(directory)) === packageName) {
      return realpath(directory);
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return null;
    }
    directory = parent;
  }
}

export interface NodeSourceResolverOptions {
  readonly projectRoot: string;
}

export class NodeSourceResolver implements SourceResolver {
  readonly #projectRoot: string;
  readonly #require: NodeJS.Require;

  constructor(options: NodeSourceResolverOptions) {
    this.#projectRoot = path.resolve(options.projectRoot);
    this.#require = createRequire(path.join(this.#projectRoot, 'package.json'));
  }

  async resolve(
    source: SourceDefinition,
    jsonPointer: string,
  ): Promise<readonly ResolvedSource[]> {
    if (typeof source === 'string') {
      return this.#resolveFile(source, jsonPointer);
    }
    if ('file' in source) {
      return this.#resolveFile(source.file, jsonPointer);
    }
    if ('root' in source) {
      return this.#resolveGlob(source, jsonPointer);
    }
    return this.#resolvePackage(source, jsonPointer);
  }

  async #resolveFile(
    configuredPath: string,
    jsonPointer: string,
  ): Promise<readonly ResolvedSource[]> {
    const absolutePath = await resolveSourcePath(
      this.#projectRoot,
      configuredPath,
      `${jsonPointer}/file`,
    );
    await assertRegularFile(absolutePath, `${jsonPointer}/file`);
    return [{ absolutePath, relativePath: path.basename(absolutePath) }];
  }

  async #resolveGlob(
    source: Extract<SourceDefinition, { readonly root: string }>,
    jsonPointer: string,
  ): Promise<readonly ResolvedSource[]> {
    source.include.forEach((pattern, index) =>
      assertSafeGlobPattern(pattern, `${jsonPointer}/include/${index}`),
    );
    source.exclude?.forEach((pattern, index) =>
      assertSafeGlobPattern(pattern, `${jsonPointer}/exclude/${index}`),
    );

    const root = await resolveSourcePath(
      this.#projectRoot,
      source.root,
      `${jsonPointer}/root`,
    );
    const rootDetails = await stat(root).catch(() => null);
    if (rootDetails === null || !rootDetails.isDirectory()) {
      throw new LoomError({
        code: 'LOOM_SRC_INVALID',
        message: 'Configured glob root does not resolve to a directory.',
        context: { jsonPointer: `${jsonPointer}/root`, sourcePath: root },
      });
    }

    const matches = await glob(source.include, {
      absolute: true,
      cwd: root,
      dot: true,
      followSymbolicLinks: false,
      ignore: source.exclude ?? [],
      onlyFiles: true,
    });
    const resolved = await Promise.all(
      matches.map(async (filename): Promise<ResolvedSource> => {
        const absolutePath = await realpath(filename);
        if (!isInside(root, absolutePath)) {
          throw new LoomError({
            code: 'LOOM_SRC_SECURITY_VIOLATION',
            message: 'Glob source resolves outside its declared root.',
            context: { jsonPointer, sourcePath: absolutePath, sourceRoot: root },
          });
        }
        return {
          absolutePath,
          relativePath: portablePath(path.relative(root, absolutePath)),
        };
      }),
    );
    resolved.sort((left, right) =>
      compareCodePoints(left.relativePath, right.relativePath),
    );
    if (source.required === true && resolved.length === 0) {
      throw new LoomError({
        code: 'LOOM_SRC_NOT_FOUND',
        message: 'Required source glob did not match any files.',
        context: { jsonPointer, sourceRoot: root, include: source.include },
      });
    }
    return resolved;
  }

  async #resolvePackage(
    source: PackageSourceDefinition,
    jsonPointer: string,
  ): Promise<readonly ResolvedSource[]> {
    let entry: string;
    try {
      entry = this.#require.resolve(source.package);
    } catch (cause) {
      throw new LoomError({
        code: 'LOOM_SRC_NOT_FOUND',
        message: `Package source "${source.package}" could not be resolved.`,
        cause,
        context: { jsonPointer: `${jsonPointer}/package`, package: source.package },
      });
    }
    const packageRoot = await findPackageRoot(entry, source.package);
    if (packageRoot === null) {
      throw new LoomError({
        code: 'LOOM_SRC_INVALID',
        message: `Resolved package "${source.package}" has no matching package root.`,
        context: { jsonPointer, package: source.package, resolvedEntry: entry },
      });
    }

    const candidate = path.resolve(packageRoot, source.path);
    if (!isInside(packageRoot, candidate)) {
      throw new LoomError({
        code: 'LOOM_SRC_SECURITY_VIOLATION',
        message: 'Package source path resolves outside its package root.',
        context: { jsonPointer: `${jsonPointer}/path`, packageRoot, path: source.path },
      });
    }
    let absolutePath: string;
    try {
      absolutePath = await realpath(candidate);
    } catch (cause) {
      throw new LoomError({
        code: 'LOOM_SRC_NOT_FOUND',
        message: 'Package-relative source file was not found.',
        cause,
        context: { jsonPointer, package: source.package, sourcePath: candidate },
      });
    }
    if (!isInside(packageRoot, absolutePath)) {
      throw new LoomError({
        code: 'LOOM_SRC_SECURITY_VIOLATION',
        message: 'Package source resolves outside its package root.',
        context: { jsonPointer, packageRoot, sourcePath: absolutePath },
      });
    }
    await assertRegularFile(absolutePath, jsonPointer);
    return [{
      absolutePath,
      relativePath: portablePath(path.relative(packageRoot, absolutePath)),
    }];
  }
}
