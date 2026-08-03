import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanV2 } from '../src/api/clean-v2.js';
import { generateVersioned } from '../src/api/generate-v2.js';
import { loadVersionedConfiguration } from '../src/config/load.js';
import { createDefaultCatalogRuntime } from '../src/infrastructure/composition/default-catalog-runtime.js';
import { createPublicationFixture } from './helpers/publication-fixture.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

async function filesFixture() {
  const fixture = await createPublicationFixture('assetloom-catalog-');
  cleanups.push(() => fixture.cleanup());
  await fixture.write('source.txt', 'catalog bytes');
  await fixture.write('assetloom.json', JSON.stringify({
    schemaVersion: 2,
    project: { root: '.' },
    targets: { output: { kind: 'directory', root: './generated' } },
    resources: {
      file: {
        type: 'files',
        source: { file: './source.txt' },
        outputs: [{ target: 'output', directory: 'nested' }],
      },
    },
  }));
  const loaded = await loadVersionedConfiguration(['assetloom.json'], { cwd: fixture.projectRoot });
  return { fixture, loaded, runtime: createDefaultCatalogRuntime(loaded) };
}

describe('output-only catalog execution', () => {
  it('publishes, reports unchanged output, and cleans only manifest-owned files', async () => {
    const prepared = await filesFixture();
    const first = await generateVersioned(prepared.loaded, prepared.runtime);
    const second = await generateVersioned(prepared.loaded, prepared.runtime);
    expect(first.artifacts[0]?.disposition).toBe('created');
    expect(second.artifacts[0]?.disposition).toBe('unchanged');
    const output = path.join(prepared.fixture.projectRoot, 'generated/nested/source.txt');
    await expect(readFile(output, 'utf8')).resolves.toBe('catalog bytes');
    const cleaned = await cleanV2(prepared.loaded);
    expect(cleaned.removed).toEqual([output]);
    await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('never requires a project-file service in public options', async () => {
    const prepared = await filesFixture();
    expect(Object.keys(prepared.runtime).sort()).toEqual([
      'materializers', 'planningContext', 'resourceHandlers', 'structuralVerifiers',
    ]);
    await expect(generateVersioned(prepared.loaded, prepared.runtime)).resolves.toBeDefined();
  });
});
