import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  stableGenerationResultJson,
  validateGenerationResultV1,
} from '../src/domain/generation-result.js';
import type { LoomError } from '../src/domain/errors.js';
import { buildGenerationResultV1 } from '../src/application/execution/generation-result-builder.js';
import { sha256 } from '../src/storage/hash.js';
import { generateV2, generateVersioned } from '../src/api/generate-v2.js';
import { loadVersionedConfiguration } from '../src/config/load.js';
import { createDefaultCatalogRuntime } from '../src/infrastructure/composition/default-catalog-runtime.js';
import { createPublicationFixture } from './helpers/publication-fixture.js';
import { generationResultFixture } from './fixtures/generation-result-v1.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('GenerationResultV1 contract', () => {
  it('round-trips deterministic JSON without losing meaning', () => {
    const validated = validateGenerationResultV1(generationResultFixture);
    const first = stableGenerationResultJson(validated);
    const second = stableGenerationResultJson(
      validateGenerationResultV1(JSON.parse(first)),
    );

    expect(second).toBe(first);
    expect(JSON.parse(first)).toEqual(generationResultFixture);
  });

  it('rejects usage references outside the current catalog', () => {
    expect(() =>
      validateGenerationResultV1({
        ...generationResultFixture,
        usage: [
          {
            ...generationResultFixture.usage[0],
            artifactIds: ['missing-artifact'],
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining<Partial<LoomError>>({ code: 'LOOM_RESULT_INVALID' }),
    );
  });

  it('rejects nondeterministic ordering and non-portable paths', () => {
    expect(() =>
      validateGenerationResultV1({
        ...generationResultFixture,
        targets: ['z', 'a'],
      }),
    ).toThrow(expect.objectContaining({ code: 'LOOM_RESULT_INVALID' }));
    expect(() =>
      validateGenerationResultV1({
        ...generationResultFixture,
        artifacts: [
          {
            ...generationResultFixture.artifacts[0],
            relativePath: 'C:\\machine\\asset.png',
          },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'LOOM_RESULT_INVALID' }));
  });

  it('rejects values that are not JSON-safe', () => {
    expect(() =>
      validateGenerationResultV1({
        ...generationResultFixture,
        usage: [
          {
            ...generationResultFixture.usage[0],
            payload: { invalid: undefined },
          },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'LOOM_RESULT_INVALID' }));
  });
});

describe('complete generation result assembly', () => {
  it('returns created, updated, unchanged, and removed records in stable order', () => {
    const digest = sha256(Buffer.from('final output bytes'));
    const result = buildGenerationResultV1({
      targets: ['website', 'mobile'],
      published: [
        {
          artifactId: 'z-artifact',
          resourceId: 'branding',
          targetId: 'website',
          role: 'web.icon',
          outputRootId: 'website',
          relativePath: 'z.png',
          disposition: 'unchanged',
          sizeBytes: 18,
          sha256: digest,
          hashToken: digest.slice(0, 12),
        },
        {
          artifactId: 'a-artifact',
          resourceId: 'icon',
          targetId: 'mobile',
          role: 'native.icon',
          outputRootId: 'mobile',
          relativePath: 'a.png',
          disposition: 'created',
          sizeBytes: 18,
          sha256: digest,
          hashToken: digest.slice(0, 12),
        },
        {
          artifactId: 'b-artifact',
          resourceId: 'icon',
          targetId: 'mobile',
          role: 'native.splash',
          outputRootId: 'mobile',
          relativePath: 'b.png',
          disposition: 'updated',
          sizeBytes: 18,
          sha256: digest,
          hashToken: digest.slice(0, 12),
        },
      ],
      removed: [
        {
          artifactId: 'old-artifact',
          targetId: 'website',
          outputRootId: 'website',
          relativePath: 'old.png',
          sha256: digest,
        },
      ],
      usage: [],
      diagnostics: [],
    });

    expect(result.targets).toEqual(['mobile', 'website']);
    expect(result.artifacts.map((artifact) => artifact.disposition)).toEqual([
      'created',
      'updated',
      'unchanged',
    ]);
    expect(result.removed).toHaveLength(1);
  });

  it('reports the independently calculated final-byte digest and exact token', () => {
    const bytes = Buffer.from('encoded bytes, not a source or path');
    const digest = sha256(bytes);
    const result = buildGenerationResultV1({
      targets: ['website'],
      published: [
        {
          artifactId: 'asset',
          resourceId: 'asset',
          targetId: 'website',
          role: 'web.asset',
          outputRootId: 'website',
          relativePath: 'asset.bin',
          disposition: 'created',
          sizeBytes: bytes.byteLength,
          sha256: digest,
          hashToken: digest.slice(0, 16),
        },
      ],
      removed: [],
      usage: [],
      diagnostics: [],
    });

    expect(result.artifacts[0]?.contentHash).toEqual({
      algorithm: 'sha256',
      value: digest,
      token: digest.slice(0, 16),
    });
  });

  it('returns the complete catalog after an unchanged published run', async () => {
    const fixture = await createPublicationFixture('assetloom-result-api-');
    cleanups.push(() => fixture.cleanup());
    await fixture.write('source.txt', 'version one');
    await fixture.write(
      'assetloom.json',
      JSON.stringify({
        schemaVersion: 2,
        project: { root: '.' },
        targets: {
          website: { kind: 'directory', root: './generated' },
        },
        resources: {
          document: {
            type: 'files',
            source: { file: './source.txt' },
            outputs: [{ target: 'website', directory: '.' }],
          },
        },
      }),
    );
    const loaded = await loadVersionedConfiguration(['assetloom.json'], {
      cwd: fixture.projectRoot,
    });
    const runtime = createDefaultCatalogRuntime(loaded);

    const first = await generateVersioned(loaded, runtime);
    const second = await generateVersioned(loaded, runtime);
    const noOpEvidence = await generateV2(loaded, runtime);
    await writeFile(path.join(fixture.projectRoot, 'source.txt'), 'version two');
    const third = await generateVersioned(loaded, runtime);
    const fourth = await generateVersioned(loaded, runtime);

    expect(first.artifacts).toHaveLength(1);
    expect(first.artifacts[0]?.disposition).toBe('created');
    expect(second.artifacts).toHaveLength(1);
    expect(second.artifacts[0]?.disposition).toBe('unchanged');
    expect(third.artifacts[0]?.disposition).toBe('updated');
    expect(second.artifacts[0]?.artifactId).toBe(first.artifacts[0]?.artifactId);
    expect(second.artifacts[0]?.relativePath).toBe('source.txt');
    expect(second.artifacts[0]?.contentHash.value).toBe(
      sha256(Buffer.from('version one')),
    );
    expect(noOpEvidence.written).toEqual([]);
    expect(noOpEvidence.unchanged).toHaveLength(1);
    expect(stableGenerationResultJson(fourth)).toBe(
      stableGenerationResultJson(await generateVersioned(loaded, runtime)),
    );
  });
});
