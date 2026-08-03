import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeSourceResolver } from '../src/infrastructure/sources/node-source-resolver.js';

const fixtures: string[] = [];

async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-sources-'));
  fixtures.push(directory);
  await writeFile(path.join(directory, 'package.json'), '{"private":true}');
  return directory;
}

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('NodeSourceResolver', () => {
  it('resolves file shorthand and sorted, excluded glob matches', async () => {
    const projectRoot = await fixture();
    await mkdir(path.join(projectRoot, 'assets/nested'), { recursive: true });
    await writeFile(path.join(projectRoot, 'assets/z.svg'), '<svg />');
    await writeFile(path.join(projectRoot, 'assets/é.svg'), '<svg />');
    await writeFile(path.join(projectRoot, 'assets/😀.svg'), '<svg />');
    await writeFile(path.join(projectRoot, 'assets/nested/a.svg'), '<svg />');
    await writeFile(path.join(projectRoot, 'assets/nested/ignored.svg'), '<svg />');
    const resolver = new NodeSourceResolver({ projectRoot });

    const single = await resolver.resolve('assets/z.svg', '/source');
    expect(single).toEqual([
      {
        absolutePath: path.join(projectRoot, 'assets/z.svg'),
        relativePath: 'z.svg',
      },
    ]);

    const multiple = await resolver.resolve(
      {
        root: 'assets',
        include: ['**/*.svg'],
        exclude: ['**/ignored.svg'],
        required: true,
      },
      '/source',
    );
    expect(multiple.map((source) => source.relativePath)).toEqual([
      'nested/a.svg',
      'z.svg',
      'é.svg',
      '😀.svg',
    ]);
  });

  it('rejects unsafe and missing required glob definitions with stable errors', async () => {
    const projectRoot = await fixture();
    await mkdir(path.join(projectRoot, 'assets'));
    const resolver = new NodeSourceResolver({ projectRoot });

    await expect(
      resolver.resolve(
        { root: 'assets', include: ['../outside/*.svg'] },
        '/source',
      ),
    ).rejects.toMatchObject({ code: 'LOOM_SRC_SECURITY_VIOLATION' });
    await expect(
      resolver.resolve(
        { root: 'assets', include: ['*.woff2'], required: true },
        '/source',
      ),
    ).rejects.toMatchObject({ code: 'LOOM_SRC_NOT_FOUND' });
  });

  it('resolves a package-relative file without allowing package traversal', async () => {
    const projectRoot = await fixture();
    const packageRoot = path.join(projectRoot, 'node_modules/example-font');
    await mkdir(path.join(packageRoot, 'fonts'), { recursive: true });
    await writeFile(
      path.join(packageRoot, 'package.json'),
      '{"name":"example-font","main":"index.js"}',
    );
    await writeFile(path.join(packageRoot, 'index.js'), 'module.exports = {};');
    await writeFile(path.join(packageRoot, 'fonts/example.woff2'), 'font');
    const resolver = new NodeSourceResolver({ projectRoot });

    await expect(
      resolver.resolve(
        { package: 'example-font', path: '../outside.woff2' },
        '/source',
      ),
    ).rejects.toMatchObject({ code: 'LOOM_SRC_SECURITY_VIOLATION' });
    await expect(
      resolver.resolve(
        { package: 'example-font', path: 'fonts/example.woff2' },
        '/source',
      ),
    ).resolves.toEqual([
      {
        absolutePath: path.join(packageRoot, 'fonts/example.woff2'),
        relativePath: 'fonts/example.woff2',
      },
    ]);
  });
});
