import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanV2 } from '../src/api/clean-v2.js';
import { generateV2 } from '../src/api/generate-v2.js';
import { createCatalogReport } from '../src/api/report-v2.js';
import { verifyV2 } from '../src/api/verify-v2.js';
import type { LoadedVersionedConfiguration } from '../src/domain/types.js';
import { createDefaultCatalogRuntime } from '../src/infrastructure/composition/default-catalog-runtime.js';
import { ContentCache } from '../src/storage/cache.js';
import { ProjectLock } from '../src/storage/lock.js';
import { ManifestStore } from '../src/storage/manifest.js';
import { ProjectStatePathGuard } from '../src/storage/state-path-guard.js';

const fixtures: string[] = [];
const unsupportedLinkCodes = new Set([
  'EACCES',
  'ENOSYS',
  'ENOTSUP',
  'EOPNOTSUPP',
  'EPERM',
]);

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
}

async function fixture(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  fixtures.push(directory);
  return directory;
}

async function createDirectoryLink(
  target: string,
  destination: string,
): Promise<string | undefined> {
  try {
    await symlink(target, destination, process.platform === 'win32' ? 'junction' : 'dir');
    return undefined;
  } catch (cause) {
    const code = errorCode(cause);
    if (code !== undefined && unsupportedLinkCodes.has(code)) {
      return code;
    }
    throw cause;
  }
}

function loadedConfiguration(projectRoot: string): LoadedVersionedConfiguration {
  return {
    config: {
      schemaVersion: 2,
      project: { root: '.' },
      targets: {},
      resources: {},
    },
    files: [],
    projectRoot,
    provenance: new Map(),
  };
}

afterEach(async () => {
  for (const directory of fixtures.splice(0).reverse()) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe('v2 state-path containment', () => {
  it('rejects external .assetloom links at every storage and lifecycle entry point', async (context) => {
    const projectRoot = await fixture('assetloom-state-project-');
    const externalState = await fixture('assetloom-state-external-');
    const stateDirectory = path.join(projectRoot, '.assetloom');
    await writeFile(path.join(externalState, 'sentinel.txt'), 'untouched');
    const unsupported = await createDirectoryLink(externalState, stateDirectory);
    if (unsupported !== undefined) {
      context.skip(`Directory links are unsupported (${unsupported}).`);
      return;
    }

    const statePaths = new ProjectStatePathGuard(projectRoot, stateDirectory);
    const storageOperations: readonly (() => Promise<unknown>)[] = [
      () => new ProjectLock(stateDirectory, statePaths).acquire(),
      () =>
        new ManifestStore(projectRoot, stateDirectory, { statePaths }).load(),
      () => new ContentCache(stateDirectory, statePaths).get('a'.repeat(64)),
      () => new ContentCache(stateDirectory, statePaths).put(Buffer.from('cached')),
    ];
    for (const operation of storageOperations) {
      await expect(operation()).rejects.toMatchObject({
        code: 'LOOM_STATE_PATH_UNSAFE',
      });
    }

    const loaded = loadedConfiguration(projectRoot);
    const runtime = createDefaultCatalogRuntime(loaded);
    const lifecycleOperations: readonly (() => Promise<unknown>)[] = [
      () => generateV2(loaded, runtime),
      () => verifyV2(loaded, runtime),
      () => cleanV2(loaded),
      () => createCatalogReport(loaded, runtime),
    ];
    for (const operation of lifecycleOperations) {
      await expect(operation()).rejects.toMatchObject({
        code: 'LOOM_STATE_PATH_UNSAFE',
      });
    }
    expect(await readFile(path.join(externalState, 'sentinel.txt'), 'utf8')).toBe(
      'untouched',
    );
  });

  it('rejects cache access through a directory link that remains inside the project', async (context) => {
    const projectRoot = await fixture('assetloom-state-project-');
    const stateDirectory = path.join(projectRoot, '.assetloom');
    const internalCache = path.join(projectRoot, 'internal-cache');
    await Promise.all([
      mkdir(stateDirectory, { recursive: true }),
      mkdir(internalCache, { recursive: true }),
    ]);
    const unsupported = await createDirectoryLink(
      internalCache,
      path.join(stateDirectory, 'cache'),
    );
    if (unsupported !== undefined) {
      context.skip(`Directory links are unsupported (${unsupported}).`);
      return;
    }

    const cache = new ContentCache(
      stateDirectory,
      new ProjectStatePathGuard(projectRoot, stateDirectory),
    );
    await expect(cache.get('a'.repeat(64))).rejects.toMatchObject({
      code: 'LOOM_STATE_PATH_UNSAFE',
    });
    await expect(cache.put(Buffer.from('cached'))).rejects.toMatchObject({
      code: 'LOOM_STATE_PATH_UNSAFE',
    });
    expect(await readdir(internalCache)).toEqual([]);
  });

  it('rejects state-file links that remain inside the project', async (context) => {
    const projectRoot = await fixture('assetloom-state-project-');
    const stateDirectory = path.join(projectRoot, '.assetloom');
    const internalManifest = path.join(projectRoot, 'internal-manifest.json');
    await mkdir(stateDirectory, { recursive: true });
    await writeFile(internalManifest, '{"version":1,"files":{}}\n');
    try {
      await symlink(internalManifest, path.join(stateDirectory, 'manifest.json'), 'file');
    } catch (cause) {
      const code = errorCode(cause);
      if (code !== undefined && unsupportedLinkCodes.has(code)) {
        context.skip(`File links are unsupported (${code}).`);
        return;
      }
      throw cause;
    }

    const store = new ManifestStore(
      projectRoot,
      stateDirectory,
      {
        statePaths: new ProjectStatePathGuard(projectRoot, stateDirectory),
      },
    );
    await expect(store.load()).rejects.toMatchObject({
      code: 'LOOM_STATE_PATH_UNSAFE',
    });
    await expect(store.save({ version: 1, files: {} })).rejects.toMatchObject({
      code: 'LOOM_STATE_PATH_UNSAFE',
    });
    expect(await readFile(internalManifest, 'utf8')).toBe(
      '{"version":1,"files":{}}\n',
    );
  });
});
