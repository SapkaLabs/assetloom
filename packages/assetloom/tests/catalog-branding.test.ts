import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateVersioned } from '../src/api/generate-v2.js';
import { createCompositeGenerationPlan } from '../src/application/planning/composite-planner.js';
import { loadVersionedConfiguration } from '../src/config/load.js';
import { createDefaultCatalogRuntime } from '../src/infrastructure/composition/default-catalog-runtime.js';
import { createPublicationFixture } from './helpers/publication-fixture.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

type BrandingNaming =
  | { readonly strategy: 'none' }
  | { readonly strategy: 'filename'; readonly hashLength?: number }
  | { readonly strategy: 'query'; readonly hashLength?: number }
  | 'omitted';

async function brandingFixture(options: {
  readonly unownedManifest?: string;
  readonly naming?: BrandingNaming;
} = {}) {
  const fixture = await createPublicationFixture('assetloom-branding-');
  cleanups.push(() => fixture.cleanup());
  await fixture.write('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#123456"/></svg>');
  await fixture.write('site/index.html', '<!doctype html><title>caller owned</title>\n');
  await fixture.write('site/staticwebapp.config.json', '{"caller":true}\n');
  if (options.unownedManifest !== undefined) {
    await fixture.write('site/public/manifest.json', options.unownedManifest);
  }
  await fixture.write('assetloom.json', JSON.stringify({
    schemaVersion: 2,
    project: { root: '.' },
    targets: {
      website: {
        kind: 'web-app',
        root: './site',
        sourceDirectory: '.',
        publicDirectory: './public',
        publicBasePath: '/',
      },
    },
    resources: {
      brand: {
        type: 'web-app-branding',
        preset: 'web-app-branding-v1',
        displayName: 'AssetLoom',
        shortName: 'Loom',
        brandColor: '#123456',
        iconBackgroundColor: '#ffffff',
        sources: { foreground: { file: './logo.svg' } },
        output: {
          target: 'website',
          directory: './public/assets',
          manifest: './public/manifest.json',
        },
        faviconSizes: [32],
        applicationIconSizes: [192],
        ...(options.naming === 'omitted'
          ? {}
          : { naming: options.naming ?? { strategy: 'none' } }),
        manifest: { backgroundColor: '#ffffff', display: 'standalone' },
        seo: {
          title: 'AssetLoom',
          description: 'Generated assets',
          includeIcons: true,
          includeManifest: true,
        },
        staticHost: { includeCacheGuidance: true },
      },
    },
  }));
  const loaded = await loadVersionedConfiguration(['assetloom.json'], { cwd: fixture.projectRoot });
  return { fixture, loaded, runtime: createDefaultCatalogRuntime(loaded) };
}

describe('web publish-and-describe planning', () => {
  it('publishes omitted, none, filename, and query policies from final bytes', async () => {
    const cases: readonly {
      readonly naming: BrandingNaming;
      readonly expected: 'none' | 'filename' | 'query';
    }[] = [
      { naming: 'omitted', expected: 'none' },
      { naming: { strategy: 'none' }, expected: 'none' },
      { naming: { strategy: 'filename', hashLength: 12 }, expected: 'filename' },
      { naming: { strategy: 'query', hashLength: 12 }, expected: 'query' },
    ];
    let expectedDigest: string | undefined;
    for (const entry of cases) {
      const prepared = await brandingFixture({ naming: entry.naming });
      const result = await generateVersioned(prepared.loaded, prepared.runtime);
      const favicon = result.artifacts.find((artifact) =>
        artifact.artifactId.endsWith(':favicon-32x32'),
      );
      expect(favicon).toBeDefined();
      if (favicon === undefined) continue;
      expectedDigest ??= favicon.contentHash.value;
      expect(favicon.contentHash.value).toBe(expectedDigest);
      expect(favicon.contentHash.value).toMatch(/^[0-9a-f]{64}$/u);
      if (entry.expected === 'filename') {
        expect(favicon.relativePath).toBe(
          `public/assets/favicon-32x32.${favicon.contentHash.token}.png`,
        );
        expect(favicon.publicPath).toBe(
          `/assets/favicon-32x32.${favicon.contentHash.token}.png`,
        );
        expect(favicon.contentHash.token).toHaveLength(12);
      } else if (entry.expected === 'query') {
        expect(favicon.relativePath).toBe('public/assets/favicon-32x32.png');
        expect(favicon.publicPath).toBe(
          `/assets/favicon-32x32.png?v=${favicon.contentHash.token}`,
        );
        expect(favicon.contentHash.token).toHaveLength(12);
      } else {
        expect(favicon.relativePath).toBe('public/assets/favicon-32x32.png');
        expect(favicon.publicPath).toBe('/assets/favicon-32x32.png');
        expect(favicon.contentHash.token).toBe(favicon.contentHash.value);
      }
      const link = result.usage.find(
        (descriptor) =>
          descriptor.kind === 'web.html-link' &&
          descriptor.artifactIds.includes(favicon.artifactId),
      );
      expect(
        (link?.payload as { readonly href?: unknown } | undefined)?.href,
      ).toBe(favicon.publicPath);
      expect(JSON.parse(JSON.stringify(result.usage))).toEqual(result.usage);
      expect(
        await readFile(
          path.join(prepared.fixture.projectRoot, 'site/index.html'),
          'utf8',
        ),
      ).toBe('<!doctype html><title>caller owned</title>\n');
      expect(
        await readFile(
          path.join(
            prepared.fixture.projectRoot,
            'site/staticwebapp.config.json',
          ),
          'utf8',
        ),
      ).toBe('{"caller":true}\n');
    }
  });

  it('plans only complete generated artifacts and a whole manifest', async () => {
    const prepared = await brandingFixture();
    const plan = await createCompositeGenerationPlan(
      prepared.loaded,
      prepared.runtime.resourceHandlers,
      prepared.runtime.planningContext,
    );
    expect(plan.catalogArtifacts.map((artifact) => artifact.operation)).not.toContain('integrate-project');
    const manifest = plan.catalogArtifacts.find((artifact) => artifact.role === 'web.manifest');
    expect(manifest).toMatchObject({ operation: 'write-text', mediaType: 'application/manifest+json' });
  });

  it('publishes the complete manifest and returns resolvable typed descriptors', async () => {
    const prepared = await brandingFixture();
    const result = await generateVersioned(prepared.loaded, prepared.runtime);
    const artifactIds = new Set(result.artifacts.map((artifact) => artifact.artifactId));
    expect(result.usage.map((descriptor) => descriptor.kind)).toEqual(
      expect.arrayContaining(['web.html-link', 'web.head-metadata', 'web.static-host-cache']),
    );
    for (const descriptor of result.usage) {
      expect(descriptor.version).toBe(1);
      expect(descriptor.artifactIds.every((id) => artifactIds.has(id))).toBe(true);
      expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
    }
    const manifest = JSON.parse(
      await readFile(path.join(prepared.fixture.projectRoot, 'site/public/manifest.json'), 'utf8'),
    ) as { readonly name: string; readonly short_name: string; readonly display: string; readonly icons: readonly { readonly src: string }[] };
    expect(manifest).toMatchObject({ name: 'AssetLoom', short_name: 'Loom', display: 'standalone' });
    expect(manifest.icons[0]?.src).toBe('/assets/logo192.png');
  });

  it.each(['{}\n', '{"name":"AssetLoom"}\n'])(
    'rejects an existing unowned manifest before publication: %s',
    async (content) => {
      const prepared = await brandingFixture({ unownedManifest: content });
      await expect(generateVersioned(prepared.loaded, prepared.runtime)).rejects.toMatchObject({
        code: 'LOOM_WRITE_CONFLICT',
      });
      expect(await readFile(path.join(prepared.fixture.projectRoot, 'site/index.html'), 'utf8')).toBe('<!doctype html><title>caller owned</title>\n');
    },
  );

  it('rotates only manifest-owned filename hashes and reports predecessors', async () => {
    const prepared = await brandingFixture({
      naming: { strategy: 'filename', hashLength: 12 },
    });
    const first = await generateVersioned(prepared.loaded, prepared.runtime);
    const firstFavicon = first.artifacts.find((artifact) =>
      artifact.artifactId.endsWith(':favicon-32x32'),
    );
    expect(firstFavicon).toBeDefined();
    if (firstFavicon === undefined) return;
    const lookalike = 'site/public/assets/favicon-32x32.deadbeefdead.png';
    await prepared.fixture.write(lookalike, 'caller owned\n');
    await prepared.fixture.write(
      'logo.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#abcdef"/></svg>',
    );

    const second = await generateVersioned(prepared.loaded, prepared.runtime);
    const secondFavicon = second.artifacts.find((artifact) =>
      artifact.artifactId.endsWith(':favicon-32x32'),
    );
    expect(secondFavicon).toBeDefined();
    expect(secondFavicon?.contentHash.value).not.toBe(
      firstFavicon.contentHash.value,
    );
    expect(second.removed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactId: firstFavicon.artifactId,
          relativePath: firstFavicon.relativePath,
        }),
      ]),
    );
    await expect(
      readFile(
        path.join(
          prepared.fixture.projectRoot,
          'site',
          ...firstFavicon.relativePath.split('/'),
        ),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(
      await readFile(path.join(prepared.fixture.projectRoot, lookalike), 'utf8'),
    ).toBe('caller owned\n');
  });
});
