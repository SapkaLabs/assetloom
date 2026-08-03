import { readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OutputRootRegistry } from '../src/application/planning/output-root-registry.js';
import { generateVersioned } from '../src/api/generate-v2.js';
import { loadVersionedConfiguration } from '../src/config/load.js';
import { createDefaultCatalogRuntime } from '../src/infrastructure/composition/default-catalog-runtime.js';
import { sha256 } from '../src/storage/hash.js';
import { OwnedOutputLifecycle } from '../src/storage/owned-output-lifecycle.js';
import { ProjectStatePathGuard } from '../src/storage/state-path-guard.js';
import { createPublicationFixture } from './helpers/publication-fixture.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('declared output roots', () => {
  it('resolves normalized portable relative paths beneath an explicit root', async () => {
    const fixture = await createPublicationFixture();
    cleanups.push(() => fixture.cleanup());
    const roots = new OutputRootRegistry(fixture.projectRoot, [
      {
        outputRootId: 'website',
        targetId: 'website',
        root: fixture.outputRoot,
      },
    ]);

    const resolved = await roots.resolve('website', 'icons\\favicon.png');
    expect(resolved).toEqual({
      outputRootId: 'website',
      targetId: 'website',
      relativePath: 'icons/favicon.png',
      destination: path.join(fixture.outputRoot, 'icons/favicon.png'),
    });
  });

  it.each([
    '../escape.png',
    'nested/../../escape.png',
    '/absolute.png',
    'C:\\absolute.png',
    '\\\\server\\share\\asset.png',
    '.',
    '',
  ])('rejects a non-relative artifact path: %s', async (relativePath) => {
    const fixture = await createPublicationFixture();
    cleanups.push(() => fixture.cleanup());
    const roots = new OutputRootRegistry(fixture.projectRoot, [
      {
        outputRootId: 'website',
        targetId: 'website',
        root: fixture.outputRoot,
      },
    ]);

    await expect(roots.resolve('website', relativePath)).rejects.toMatchObject({
      code: 'LOOM_WRITE_OUTSIDE_ROOT',
    });
  });

  it('rejects duplicate root IDs and case-normalized planned destinations', async () => {
    const fixture = await createPublicationFixture();
    cleanups.push(() => fixture.cleanup());
    expect(
      () =>
        new OutputRootRegistry(fixture.projectRoot, [
          {
            outputRootId: 'Website',
            targetId: 'website',
            root: fixture.outputRoot,
          },
          {
            outputRootId: 'website',
            targetId: 'website',
            root: fixture.outputRoot,
          },
        ]),
    ).toThrow(expect.objectContaining({ code: 'LOOM_PLAN_COLLISION' }));

    const roots = new OutputRootRegistry(fixture.projectRoot, [
      {
        outputRootId: 'website',
        targetId: 'website',
        root: fixture.outputRoot,
      },
    ]);
    await expect(
      roots.resolveAll([
        { outputRootId: 'website', relativePath: 'Logo.png' },
        { outputRootId: 'website', relativePath: 'logo.png' },
      ]),
    ).rejects.toMatchObject({ code: 'LOOM_PLAN_COLLISION' });
  });

  it('rejects output and state paths that traverse filesystem links', async (context) => {
    const fixture = await createPublicationFixture();
    cleanups.push(() => fixture.cleanup());
    const external = await createPublicationFixture('assetloom-external-');
    cleanups.push(() => external.cleanup());
    try {
      await symlink(external.outputRoot, path.join(fixture.outputRoot, 'linked'), 'junction');
      await symlink(external.stateRoot, path.join(fixture.projectRoot, 'linked-state'), 'junction');
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;
      if (code === 'EPERM' || code === 'EACCES') {
        context.skip(`Filesystem links are unavailable (${code}).`);
        return;
      }
      throw error;
    }
    const roots = new OutputRootRegistry(fixture.projectRoot, [
      {
        outputRootId: 'website',
        targetId: 'website',
        root: fixture.outputRoot,
      },
    ]);
    await expect(
      roots.resolve('website', 'linked/escape.png'),
    ).rejects.toMatchObject({ code: 'LOOM_WRITE_OUTSIDE_ROOT' });
    const stateGuard = new ProjectStatePathGuard(
      fixture.projectRoot,
      path.join(fixture.projectRoot, 'linked-state'),
    );
    await expect(stateGuard.assertSafe()).rejects.toMatchObject({
      code: 'LOOM_STATE_PATH_UNSAFE',
    });
  });
});

describe('whole-file ownership boundaries', () => {
  it('keeps consumer sentinels and repository metadata byte-for-byte unchanged', async () => {
    const fixture = await createPublicationFixture('assetloom-sentinels-');
    cleanups.push(() => fixture.cleanup());
    const sentinels = [
      'index.html',
      'package.json',
      'Info.plist',
      'Consumer.xcodeproj/project.pbxproj',
      'android/app/src/main/AndroidManifest.xml',
      'android/build.gradle',
      'android/settings.gradle',
      'consumer.config.json',
      '.git/info/exclude',
    ];
    for (const [index, sentinel] of sentinels.entries()) {
      await fixture.write(sentinel, `sentinel-${index}\n`);
    }
    await fixture.write('source.txt', 'owned bytes');
    await fixture.write(
      'assetloom.json',
      JSON.stringify({
        schemaVersion: 2,
        project: { root: '.' },
        targets: { website: { kind: 'directory', root: './generated' } },
        resources: {
          file: {
            type: 'files',
            source: { file: './source.txt' },
            outputs: [{ target: 'website', directory: '.' }],
          },
        },
      }),
    );
    const before = new Map(
      await Promise.all(
        sentinels.map(async (sentinel) => [
          sentinel,
          sha256(await fixture.read(sentinel)),
        ] as const),
      ),
    );
    const loaded = await loadVersionedConfiguration(['assetloom.json'], {
      cwd: fixture.projectRoot,
    });
    await generateVersioned(loaded, createDefaultCatalogRuntime(loaded));

    for (const sentinel of sentinels) {
      expect(sha256(await fixture.read(sentinel))).toBe(before.get(sentinel));
    }
  });

  it('rejects an existing unowned destination even when its bytes are equal', async () => {
    const fixture = await createPublicationFixture();
    cleanups.push(() => fixture.cleanup());
    const destination = await fixture.write('generated/equal.txt', 'same');
    const roots = new OutputRootRegistry(fixture.projectRoot, [
      {
        outputRootId: 'website',
        targetId: 'website',
        root: fixture.outputRoot,
      },
    ]);
    await expect(
      new OwnedOutputLifecycle(fixture.projectRoot, roots).prepare(
        [
          {
            artifactId: 'equal',
            resourceId: 'equal',
            role: 'test.file',
            content: Buffer.from('same'),
            destination,
            target: 'website',
          },
        ],
        { version: 1, files: {} },
        ['website'],
      ),
    ).rejects.toMatchObject({ code: 'LOOM_WRITE_CONFLICT' });
  });

  it('removes only manifest-owned stale files', async () => {
    const fixture = await createPublicationFixture();
    cleanups.push(() => fixture.cleanup());
    const owned = await fixture.write('generated/owned.txt', 'owned');
    const unowned = await fixture.write('generated/unowned.txt', 'unowned');
    const roots = new OutputRootRegistry(fixture.projectRoot, [
      {
        outputRootId: 'website',
        targetId: 'website',
        root: fixture.outputRoot,
      },
    ]);
    const lifecycle = new OwnedOutputLifecycle(fixture.projectRoot, roots);
    const prepared = await lifecycle.prepare(
      [],
      {
        version: 1,
        files: {
          'generated/owned.txt': {
            sha256: sha256(Buffer.from('owned')),
            taskId: 'owned',
            target: 'website',
          },
        },
      },
      ['website'],
    );
    const result = await lifecycle.publish(prepared);

    await expect(readFile(owned)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(unowned, 'utf8')).resolves.toBe('unowned');
    expect(result.removedArtifacts.map((artifact) => artifact.artifactId)).toEqual([
      'owned',
    ]);
  });

  it('rejects an owned output changed after preflight', async () => {
    const fixture = await createPublicationFixture();
    cleanups.push(() => fixture.cleanup());
    const destination = await fixture.write('generated/owned.txt', 'old');
    const roots = new OutputRootRegistry(fixture.projectRoot, [
      {
        outputRootId: 'website',
        targetId: 'website',
        root: fixture.outputRoot,
      },
    ]);
    const lifecycle = new OwnedOutputLifecycle(fixture.projectRoot, roots);
    const prepared = await lifecycle.prepare(
      [
        {
          artifactId: 'owned',
          resourceId: 'owned',
          role: 'test.file',
          content: Buffer.from('new'),
          destination,
          target: 'website',
        },
      ],
      {
        version: 1,
        files: {
          'generated/owned.txt': {
            sha256: sha256(Buffer.from('old')),
            taskId: 'owned',
            target: 'website',
          },
        },
      },
      ['website'],
    );
    await writeFile(destination, 'raced');

    await expect(lifecycle.publish(prepared)).rejects.toMatchObject({
      code: 'LOOM_WRITE_CONFLICT',
    });
  });
});
