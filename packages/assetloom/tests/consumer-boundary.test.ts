import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanV2 } from '../src/api/clean-v2.js';
import { generateVersioned } from '../src/api/generate-v2.js';
import { createCatalogReport } from '../src/api/report-v2.js';
import { verifyV2 } from '../src/api/verify-v2.js';
import { loadVersionedConfiguration } from '../src/config/load.js';
import { createDefaultCatalogRuntime } from '../src/infrastructure/composition/default-catalog-runtime.js';
import { sha256 } from '../src/storage/hash.js';
import { createPublicationFixture } from './helpers/publication-fixture.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

describe('consumer application read-only boundary', () => {
  it('preserves every consumer sentinel across plan, generate, verify, report, and clean', async () => {
    const fixture = await createPublicationFixture('assetloom-consumer-boundary-');
    cleanups.push(() => fixture.cleanup());
    const sentinels = [
      'index.html', 'package.json', 'Info.plist', 'Consumer.xcodeproj/project.pbxproj',
      'android/app/src/main/AndroidManifest.xml', 'android/app/build.gradle',
      'android/settings.gradle', 'consumer.config.json', '.git/info/exclude', '.gitignore',
    ];
    for (const [index, filename] of sentinels.entries()) {
      await fixture.write(filename, `consumer-sentinel-${index}\n`);
    }
    await fixture.write('source.txt', 'owned output\n');
    await fixture.write('assetloom.json', JSON.stringify({
      schemaVersion: 2,
      project: { root: '.' },
      targets: { output: { kind: 'directory', root: './generated' } },
      resources: {
        file: { type: 'files', source: { file: './source.txt' }, outputs: [{ target: 'output', directory: '.' }] },
      },
    }));
    const before = new Map(await Promise.all(sentinels.map(async (filename) =>
      [filename, sha256(await readFile(path.join(fixture.projectRoot, filename)))] as const,
    )));
    const loaded = await loadVersionedConfiguration(['assetloom.json'], { cwd: fixture.projectRoot });
    const runtime = createDefaultCatalogRuntime(loaded);
    await generateVersioned(loaded, runtime);
    await verifyV2(loaded, runtime);
    await createCatalogReport(loaded, { ...runtime, output: '.assetloom/report.html' });
    await cleanV2(loaded);
    for (const filename of sentinels) {
      expect(sha256(await readFile(path.join(fixture.projectRoot, filename)))).toBe(before.get(filename));
    }
  });

  it('ignores obsolete consumer-edit state', async () => {
    const fixture = await createPublicationFixture('assetloom-obsolete-state-');
    cleanups.push(() => fixture.cleanup());
    await fixture.write('.assetloom/integration-receipts.json', JSON.stringify({
      version: 1,
      receipts: { stale: { destination: 'index.html', state: { owned: true } } },
    }));
    await fixture.write('index.html', 'caller bytes\n');
    await fixture.write('source.txt', 'asset\n');
    await fixture.write('assetloom.json', JSON.stringify({
      schemaVersion: 2,
      project: { root: '.' },
      targets: { output: { kind: 'directory', root: './generated' } },
      resources: { file: { type: 'files', source: { file: './source.txt' }, outputs: [{ target: 'output', directory: '.' }] } },
    }));
    const loaded = await loadVersionedConfiguration(['assetloom.json'], { cwd: fixture.projectRoot });
    await generateVersioned(loaded, createDefaultCatalogRuntime(loaded));
    expect(await readFile(path.join(fixture.projectRoot, 'index.html'), 'utf8')).toBe('caller bytes\n');
  });
});
