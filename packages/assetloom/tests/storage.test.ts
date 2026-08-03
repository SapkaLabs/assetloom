import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { generateVersioned } from '../src/api/generate-v2.js';
import { loadVersionedConfiguration } from '../src/config/load.js';
import { createDefaultCatalogRuntime } from '../src/infrastructure/composition/default-catalog-runtime.js';
import { sha256 } from '../src/storage/hash.js';
import { createPublicationFixture } from './helpers/publication-fixture.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

describe('repository metadata ownership', () => {
  it('never changes Git ignore metadata during generation', async () => {
    const fixture = await createPublicationFixture('assetloom-repository-metadata-');
    cleanups.push(() => fixture.cleanup());
    await fixture.write('.git/info/exclude', '*.local\n');
    await fixture.write('.gitignore', 'node_modules/\n');
    await fixture.write('source.txt', 'content');
    await fixture.write('assetloom.json', JSON.stringify({
      schemaVersion: 2,
      project: { root: '.' },
      targets: { output: { kind: 'directory', root: './generated' } },
      resources: { file: { type: 'files', source: { file: './source.txt' }, outputs: [{ target: 'output', directory: '.' }] } },
    }));
    const beforeExclude = sha256(await readFile(`${fixture.projectRoot}/.git/info/exclude`));
    const beforeIgnore = sha256(await readFile(`${fixture.projectRoot}/.gitignore`));
    const loaded = await loadVersionedConfiguration(['assetloom.json'], { cwd: fixture.projectRoot });
    await generateVersioned(loaded, createDefaultCatalogRuntime(loaded));
    expect(sha256(await readFile(`${fixture.projectRoot}/.git/info/exclude`))).toBe(beforeExclude);
    expect(sha256(await readFile(`${fixture.projectRoot}/.gitignore`))).toBe(beforeIgnore);
  });
});
