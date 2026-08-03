import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  CatalogContentCache,
  CatalogMaterializationContext,
} from '../src/application/execution/contracts.js';
import type { RenderImageArtifact } from '../src/domain/catalog/planning.js';
import { targetId } from '../src/domain/catalog/targets.js';
import { ImageArtifactMaterializer } from '../src/infrastructure/images/image-materializer.js';
import { sha256 } from '../src/storage/hash.js';

class MemoryCatalogCache implements CatalogContentCache {
  readonly content = new Map<string, Uint8Array>();
  readonly aliases = new Map<string, string>();
  contentWrites = 0;
  aliasWrites = 0;

  get(key: string): Promise<Uint8Array | undefined> {
    return Promise.resolve(this.content.get(key));
  }

  getAlias(key: string): Promise<string | undefined> {
    return Promise.resolve(this.aliases.get(key));
  }

  put(value: Uint8Array): Promise<string> {
    const key = sha256(value);
    this.content.set(key, value);
    this.contentWrites += 1;
    return Promise.resolve(key);
  }

  putAlias(key: string, value: Uint8Array): Promise<void> {
    this.aliases.set(key, Buffer.from(value).toString('ascii'));
    this.aliasWrites += 1;
    return Promise.resolve();
  }
}

function artifact(
  source: string,
  overrides: Partial<RenderImageArtifact> = {},
): RenderImageArtifact {
  return {
    id: 'brand:web:logo',
    resourceId: 'brand',
    resourceType: 'web-app-branding',
    target: targetId('web'),
    operation: 'render-image',
    ownership: 'generated',
    publication: { mode: 'stable' },
    dependsOn: [],
    sourceDependencies: [source],
    destination: path.resolve('unused/logo.png'),
    presetVersion: 'web:1',
    width: 32,
    height: 32,
    format: 'png',
    recipe: {
      kind: 'resize',
      input: { kind: 'source', path: source },
      width: 32,
      height: 32,
      fit: 'contain',
      background: '#00000000',
    },
    ...overrides,
  };
}

function context(
  projectRoot: string,
  cache: MemoryCatalogCache,
  normalizedConfiguration: string,
): CatalogMaterializationContext {
  return {
    projectRoot,
    normalizedConfiguration,
    cache,
    outputs: {
      get: () => {
        throw new Error('No artifact input expected.');
      },
      resolve: () => {
        throw new Error('No artifact reference expected.');
      },
    },
  };
}

const svg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${color}"/></svg>`;

describe('catalog image render fingerprints', () => {
  it('reuses bytes across source paths, destinations, URLs, and unrelated configuration', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'assetloom-catalog-cache-'));
    const firstSource = path.join(root, 'first.svg');
    const secondSource = path.join(root, 'nested', '..', 'second.svg');
    await writeFile(firstSource, svg('#123456'));
    await writeFile(path.join(root, 'second.svg'), svg('#123456'));
    const cache = new MemoryCatalogCache();
    const materializer = new ImageArtifactMaterializer();
    const first = await materializer.materialize(
      artifact(firstSource),
      context(root, cache, '{"unrelated":"first"}'),
    );
    const writes = { content: cache.contentWrites, alias: cache.aliasWrites };
    const second = await materializer.materialize(
      artifact(secondSource, {
        id: 'renamed:web:logo',
        resourceId: 'renamed',
        destination: path.join(root, 'another/output/logo.png'),
        publication: {
          mode: 'stable',
          publicPath: {
            publicDirectory: path.join(root, 'another'),
            publicBasePath: '/different',
          },
        },
      }),
      context(root, cache, '{"unrelated":"second"}'),
    );

    expect(Buffer.from(second.content).equals(Buffer.from(first.content))).toBe(true);
    expect(cache.contentWrites).toBe(writes.content);
    expect(cache.aliasWrites).toBe(writes.alias);
  });

  it('invalidates source, recipe, preset, format, and renderer compatibility changes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'assetloom-catalog-cache-'));
    const firstSource = path.join(root, 'first.svg');
    const changedSource = path.join(root, 'changed.svg');
    await writeFile(firstSource, svg('#123456'));
    await writeFile(changedSource, svg('#abcdef'));
    const cache = new MemoryCatalogCache();
    const contextValue = context(root, cache, '{}');
    const initialMaterializer = new ImageArtifactMaterializer({
      rendererCompatibilityVersion: 'renderer-a',
    });
    await initialMaterializer.materialize(artifact(firstSource), contextValue);
    const aliases = (): number => cache.aliasWrites;
    const initial = aliases();

    await initialMaterializer.materialize(artifact(changedSource), contextValue);
    expect(aliases()).toBe(initial + 1);
    await initialMaterializer.materialize(
      artifact(firstSource, {
        width: 48,
        height: 48,
        recipe: {
          kind: 'resize',
          input: { kind: 'source', path: firstSource },
          width: 48,
          height: 48,
          fit: 'cover',
        },
      }),
      contextValue,
    );
    expect(aliases()).toBe(initial + 2);
    await initialMaterializer.materialize(
      artifact(firstSource, { presetVersion: 'web:2' }),
      contextValue,
    );
    expect(aliases()).toBe(initial + 3);
    await initialMaterializer.materialize(
      artifact(firstSource, { format: 'webp', quality: 80 }),
      contextValue,
    );
    expect(aliases()).toBe(initial + 4);
    await new ImageArtifactMaterializer({
      rendererCompatibilityVersion: 'renderer-b',
    }).materialize(artifact(firstSource), contextValue);
    expect(aliases()).toBe(initial + 5);
  });
});
