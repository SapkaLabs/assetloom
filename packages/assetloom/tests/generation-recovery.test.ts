import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateVersioned } from '../src/api/generate-v2.js';
import { loadVersionedConfiguration } from '../src/config/load.js';
import { createDefaultCatalogRuntime } from '../src/infrastructure/composition/default-catalog-runtime.js';
import { PendingGenerationStore } from '../src/storage/pending-generation-store.js';
import { ProjectStatePathGuard } from '../src/storage/state-path-guard.js';
import { createPublicationFixture } from './helpers/publication-fixture.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

describe('recoverable publication state', () => {
  it('persists, resumes, rejects mismatches, and clears a deterministic pending intent', async () => {
    const fixture = await createPublicationFixture('assetloom-pending-');
    cleanups.push(() => fixture.cleanup());
    const guard = new ProjectStatePathGuard(fixture.projectRoot, fixture.stateRoot);
    const store = new PendingGenerationStore(fixture.stateRoot, guard);
    const intent = { version: 2 as const, fingerprint: 'a'.repeat(64), selectedTargets: ['web'] };
    await expect(store.begin(intent)).resolves.toBe('created');
    await expect(store.begin(intent)).resolves.toBe('resumed');
    await expect(store.begin({ ...intent, fingerprint: 'b'.repeat(64) })).rejects.toMatchObject({
      code: 'LOOM_GENERATION_RECOVERY_REQUIRED',
    });
    await store.clear(intent.fingerprint);
    await expect(store.load()).resolves.toBeUndefined();
  });

  it('never reports success when an interrupted intent cannot be reconstructed', async () => {
    const fixture = await createPublicationFixture('assetloom-recovery-');
    cleanups.push(() => fixture.cleanup());
    await fixture.write('source.txt', 'source');
    await fixture.write('assetloom.json', JSON.stringify({
      schemaVersion: 2,
      project: { root: '.' },
      targets: { web: { kind: 'directory', root: './generated' } },
      resources: {
        file: { type: 'files', source: { file: './source.txt' }, outputs: [{ target: 'web', directory: '.' }] },
      },
    }));
    const store = new PendingGenerationStore(
      fixture.stateRoot,
      new ProjectStatePathGuard(fixture.projectRoot, fixture.stateRoot),
    );
    await store.begin({ version: 2, fingerprint: 'f'.repeat(64), selectedTargets: ['web'] });
    const loaded = await loadVersionedConfiguration(['assetloom.json'], { cwd: fixture.projectRoot });
    await expect(generateVersioned(loaded, createDefaultCatalogRuntime(loaded))).rejects.toMatchObject({
      code: 'LOOM_GENERATION_RECOVERY_REQUIRED',
    });
    await expect(readFile(path.join(fixture.projectRoot, 'generated/source.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(store.load()).resolves.toEqual({
      version: 2,
      fingerprint: 'f'.repeat(64),
      selectedTargets: ['web'],
    });
  });

  it('rejects invalid pending state with a stable public code', async () => {
    const fixture = await createPublicationFixture('assetloom-invalid-pending-');
    cleanups.push(() => fixture.cleanup());
    await fixture.write('.assetloom/pending-generation.json', '{"version":2,"fingerprint":"bad"}\n');
    const store = new PendingGenerationStore(
      fixture.stateRoot,
      new ProjectStatePathGuard(fixture.projectRoot, fixture.stateRoot),
    );
    await expect(store.load()).rejects.toMatchObject({ code: 'LOOM_GENERATION_INTENT_INVALID' });
  });
});
