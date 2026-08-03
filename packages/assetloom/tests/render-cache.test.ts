import {
  mkdir,
  mkdtemp,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GenerationTask } from '../src/domain/types.js';
import { SharpRenderer } from '../src/renderers/sharp-renderer.js';
import { ContentCache } from '../src/storage/cache.js';

const icon = (color: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <rect width="108" height="108" fill="${color}"/>
</svg>`;

function renderTask(
  id: string,
  resourceId: string,
  source: string,
): GenerationTask {
  return {
    id,
    resourceId,
    resourceType: 'app-icon',
    target: 'android',
    operation: 'render',
    renderMode: 'standard',
    sourceDependencies: [source],
    width: 108,
    height: 108,
    format: 'png',
    destination: `/unused/${resourceId}.png`,
    presetVersion: '1',
  };
}

describe('render cache reuse', () => {
  it('retains customer assets and keys equivalent renders by effective inputs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'assetloom-cache-switch-'));
    const stateDirectory = path.join(root, '.assetloom');
    const sources = path.join(root, 'sources');
    await mkdir(sources);

    const customerA = path.join(sources, 'customer-a.svg');
    const equivalentA = path.join(sources, 'customer-a-copy.svg');
    const customerB = path.join(sources, 'customer-b.svg');
    await writeFile(customerA, icon('#172033'));
    await writeFile(equivalentA, icon('#172033'));
    await writeFile(customerB, icon('#ff3366'));

    const renderer = new SharpRenderer(new ContentCache(stateDirectory));
    const firstA = await renderer.render(
      renderTask('customerA:android:legacy:mdpi', 'customerA', customerA),
    );
    const afterA = (await readdir(path.join(stateDirectory, 'cache'))).sort();

    const outputB = await renderer.render(
      renderTask('customerB:android:legacy:mdpi', 'customerB', customerB),
    );
    const afterB = (await readdir(path.join(stateDirectory, 'cache'))).sort();
    expect(outputB.equals(firstA)).toBe(false);
    expect(afterB).toEqual(expect.arrayContaining(afterA));
    expect(afterB.length).toBeGreaterThan(afterA.length);

    const secondA = await renderer.render(
      renderTask(
        'renamedResource:android:legacy:mdpi',
        'renamedResource',
        equivalentA,
      ),
    );
    expect(secondA.equals(firstA)).toBe(true);
    expect(
      (await readdir(path.join(stateDirectory, 'cache'))).sort(),
    ).toEqual(afterB);
  });
});
