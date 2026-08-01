import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { generateV2 } from '../src/api/generate-v2.js';
import { verifyV2 } from '../src/api/verify-v2.js';
import type {
  CatalogArtifactOutputResolver,
  CatalogContentCache,
  IntegrationArtifactForAdapter,
  StoredIntegrationReceipt,
} from '../src/application/execution/contracts.js';
import type { PlanningContext } from '../src/application/planning/contracts.js';
import type {
  CatalogPlannedArtifact,
  HtmlHeadIntegrationRecipe,
  IntegrateProjectArtifact,
  RenderImageArtifact,
} from '../src/domain/catalog/planning.js';
import type { WebAppBrandingResource } from '../src/domain/catalog/resources.js';
import { targetId } from '../src/domain/catalog/targets.js';
import type { LoadedVersionedConfiguration } from '../src/domain/types.js';
import { createDefaultCatalogRuntime } from '../src/infrastructure/composition/default-catalog-runtime.js';
import { ImageArtifactMaterializer } from '../src/infrastructure/images/image-materializer.js';
import { HtmlHeadIntegrationAdapter } from '../src/infrastructure/web-integration/html-head-adapter.js';
import { StaticWebAppConfigIntegrationAdapter } from '../src/infrastructure/web-integration/static-web-app-config-adapter.js';
import { WebManifestIntegrationAdapter } from '../src/infrastructure/web-integration/web-manifest-adapter.js';
import { ImageVariantsResourceHandler } from '../src/resources/image-variants/handler.js';
import { WebAppBrandingResourceHandler } from '../src/resources/web-app-branding/handler.js';
import { sha256 } from '../src/storage/hash.js';
import { ManifestStore } from '../src/storage/manifest.js';

class MemoryCache implements CatalogContentCache {
  readonly values = new Map<string, Uint8Array>();
  readonly aliases = new Map<string, string>();

  get(key: string): Promise<Uint8Array | undefined> {
    return Promise.resolve(this.values.get(key));
  }

  getAlias(key: string): Promise<string | undefined> {
    return Promise.resolve(this.aliases.get(key));
  }

  put(value: Uint8Array): Promise<string> {
    const key = sha256(value);
    this.values.set(key, value);
    return Promise.resolve(key);
  }

  putAlias(key: string, value: Uint8Array): Promise<void> {
    this.aliases.set(key, Buffer.from(value).toString('ascii'));
    return Promise.resolve();
  }
}

const noOutputs: CatalogArtifactOutputResolver = {
  get: (artifactId) => {
    throw new Error(`Unexpected output lookup: ${artifactId}`);
  },
  resolve: (reference) => {
    if (reference.artifactId === 'logo' && reference.value === 'public-path') {
      return '/assets/logo.abc123.png';
    }
    throw new Error(`Unexpected output reference: ${reference.artifactId}`);
  },
};

function brandingResource(
  naming: WebAppBrandingResource['naming'] = {
    strategy: 'content-hash',
    hashLength: 12,
    fallbackFavicon: 'public/favicon.ico',
    fallbackManifest: 'public/manifest.json',
  },
): WebAppBrandingResource {
  return {
    type: 'web-app-branding',
    preset: 'web-app-branding-v1',
    displayName: 'A deliberately long & branded application name',
    shortName: 'Branded',
    brandColor: '#091D3E',
    iconBackgroundColor: '#FFFFFF',
    sources: {
      foreground: { file: './assets/logo.svg' },
      background: { file: './assets/background.svg' },
      socialPreview: { file: './assets/social.png' },
    },
    output: {
      target: 'portal',
      directory: 'public/assets/brand',
      manifest: 'public/manifest.json',
      document: 'public/index.html',
    },
    faviconSizes: [16, 32],
    faviconIcoSizes: [16, 32, 48, 64, 256],
    appleTouchIconSize: 180,
    applicationIconSizes: [192, 512],
    maskableIconSizes: [192, 512],
    foregroundScales: {
      favicon: { default: 0.78, overrides: { '256': 0.72 } },
      appleTouch: 0.62,
      application: 0.68,
      maskable: 0.52,
    },
    naming,
    manifest: {
      themeColor: '#091D3E',
      backgroundColor: '#FFFFFF',
      display: 'standalone',
    },
    seo: {
      siteUrl: 'https://example.test',
      title: 'Primary title',
      description: 'Primary description',
      canonicalPath: '/products',
      robots: 'index,follow',
      openGraph: { type: 'website', includeImage: true },
      twitter: { card: 'summary_large_image', includeImage: true },
      colorScheme: 'light',
      includeIcons: true,
      includeManifest: true,
    },
    staticWebApp: {
      path: 'public/staticwebapp.config.json',
      integrateCacheHeaders: true,
    },
    socialPreview: {
      width: 1200,
      height: 627,
      fit: 'cover',
      overlayPreset: 'product-overview-v1',
      logoSize: 44,
    },
  };
}

function planningContext(root: string): PlanningContext {
  const sources: Readonly<Record<string, string>> = {
    foreground: path.join(root, 'assets/logo.svg'),
    background: path.join(root, 'assets/background.svg'),
    socialPreview: path.join(root, 'assets/social.png'),
  };
  return {
    projectRoot: root,
    normalizedConfiguration: '{"schemaVersion":2}',
    sourceResolver: {
      resolve: (_source, pointer) => {
        const name = pointer.split('/').at(-1);
        const absolutePath = name === undefined ? undefined : sources[name];
        return Promise.resolve(
          absolutePath === undefined
            ? []
            : [{ absolutePath, relativePath: path.relative(root, absolutePath) }],
        );
      },
    },
    resolveTarget: (id) => ({
      id: targetId(id),
      kind: 'web-app',
      root: path.join(root, 'web/portal'),
      configuration: {
        kind: 'web-app',
        root: 'web/portal',
        sourceDirectory: 'src',
        publicDirectory: 'public',
        publicBasePath: '/',
      },
    }),
  };
}

function imageArtifact(
  artifacts: readonly CatalogPlannedArtifact[],
  id: string,
): RenderImageArtifact {
  const artifact = artifacts.find((item) => item.id.endsWith(id));
  if (artifact === undefined || artifact.operation !== 'render-image') {
    throw new Error(`Missing image artifact: ${id}`);
  }
  return artifact;
}

function integrationArtifact(
  artifacts: readonly CatalogPlannedArtifact[],
  adapter: IntegrateProjectArtifact['integration']['adapter'],
): IntegrateProjectArtifact {
  const artifact = artifacts.find(
    (item) =>
      item.operation === 'integrate-project' &&
      item.integration.adapter === adapter,
  );
  if (artifact === undefined || artifact.operation !== 'integrate-project') {
    throw new Error(`Missing integration artifact: ${adapter}`);
  }
  return artifact;
}

function resolveText(
  reference: Parameters<CatalogArtifactOutputResolver['resolve']>[0],
): string | number {
  const resolved = noOutputs.resolve(reference);
  if (resolved instanceof Uint8Array) {
    throw new Error('Unexpected binary output reference.');
  }
  return resolved;
}

describe('catalog web app branding', () => {
  it('plans the exact public asset set, in-memory ICO recipes, and full metadata', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'assetloom-brand-plan-'));
    const artifacts = await new WebAppBrandingResourceHandler().plan(
      'brand',
      brandingResource(),
      planningContext(root),
    );

    expect(
      artifacts.map((artifact) => ({
        id: artifact.id,
        operation: artifact.operation,
        publication:
          artifact.operation === 'integrate-project'
            ? undefined
            : artifact.publication.mode,
      })),
    ).toEqual([
      { id: 'brand:portal:favicon-16x16', operation: 'render-image', publication: 'content-hash' },
      { id: 'brand:portal:favicon-32x32', operation: 'render-image', publication: 'content-hash' },
      { id: 'brand:portal:apple-touch-icon', operation: 'render-image', publication: 'content-hash' },
      { id: 'brand:portal:logo192', operation: 'render-image', publication: 'content-hash' },
      { id: 'brand:portal:logo512', operation: 'render-image', publication: 'content-hash' },
      { id: 'brand:portal:maskable-icon-192', operation: 'render-image', publication: 'content-hash' },
      { id: 'brand:portal:maskable-icon-512', operation: 'render-image', publication: 'content-hash' },
      { id: 'brand:portal:favicon-ico', operation: 'render-image', publication: 'content-hash' },
      { id: 'brand:portal:social-preview', operation: 'render-image', publication: 'content-hash' },
      { id: 'brand:portal:manifest-integration', operation: 'integrate-project', publication: undefined },
      { id: 'brand:portal:html-head-integration', operation: 'integrate-project', publication: undefined },
      { id: 'brand:portal:static-web-app-integration', operation: 'integrate-project', publication: undefined },
    ]);

    const ico = imageArtifact(artifacts, ':favicon-ico');
    expect(ico.dependsOn).toEqual([]);
    expect(ico.recipe).toMatchObject({
      kind: 'ico',
      images: [
        { recipe: { kind: 'composite', canvas: { width: 16, height: 16 } } },
        { recipe: { kind: 'composite', canvas: { width: 32, height: 32 } } },
        { recipe: { kind: 'composite', canvas: { width: 48, height: 48 } } },
        { recipe: { kind: 'composite', canvas: { width: 64, height: 64 } } },
        { recipe: { kind: 'composite', canvas: { width: 256, height: 256 } } },
      ],
    });
    expect(artifacts.some((artifact) => artifact.id.includes('48x48'))).toBe(false);

    const social = imageArtifact(artifacts, ':social-preview');
    if (social.recipe.kind !== 'composite') {
      throw new Error('Expected a social preview composite.');
    }
    const overlay = social.recipe.layers[1]?.input;
    expect(overlay).toMatchObject({ kind: 'inline-svg' });
    if (overlay?.kind !== 'inline-svg') {
      throw new Error('Expected an inline SVG overlay.');
    }
    expect(overlay.content).toContain('A deliberately long &amp; b...');
    expect(overlay.content).toContain('font-size="24"');
    expect(overlay.content).toContain('textLength="278" lengthAdjust="spacingAndGlyphs"');
    expect(overlay.content).toContain('<text x="132" y="66"');
    expect(overlay.content).toContain('<text x="132" y="92"');
    expect(overlay.content).toContain('product overview</text>');

    const html = integrationArtifact(artifacts, 'html-head');
    if (html.integration.adapter !== 'html-head') {
      throw new Error('Expected HTML integration.');
    }
    expect(html.dependsOn).toContain('brand:portal:manifest-integration');
    expect(html.dependsOn).not.toContain(
      'brand:portal:manifest-integration:published',
    );
    const renderedKinds = html.integration.elements.map((element) =>
      element.element === 'title'
        ? 'title'
        : element.attributes?.['property'] ?? element.attributes?.['name'] ?? element.attributes?.['rel'],
    );
    expect(renderedKinds).toEqual([
      'title',
      'description',
      'canonical',
      'robots',
      'og:title',
      'og:type',
      'og:description',
      'og:url',
      'og:image',
      'og:image:width',
      'og:image:height',
      'og:image:alt',
      'twitter:card',
      'twitter:title',
      'twitter:description',
      'twitter:image',
      'theme-color',
      'color-scheme',
      'icon',
      'icon',
      'icon',
      'apple-touch-icon',
      'manifest',
    ]);
  });

  it('honors stable naming and rejects invalid public/SEO configurations', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'assetloom-brand-stable-'));
    const handler = new WebAppBrandingResourceHandler();
    const artifacts = await handler.plan(
      'brand',
      brandingResource({ strategy: 'stable' }),
      planningContext(root),
    );
    expect(imageArtifact(artifacts, ':social-preview').publication.mode).toBe('stable');
    const manifest = integrationArtifact(artifacts, 'web-app-manifest');
    if (manifest.integration.adapter !== 'web-app-manifest') {
      throw new Error('Expected manifest integration.');
    }
    expect(manifest.integration.publishedCopy).toMatchObject({
      destination: path.join(root, 'web/portal/public/manifest.json'),
      publication: { mode: 'stable' },
    });

    const outside = brandingResource();
    await expect(
      handler.plan(
        'brand',
        { ...outside, output: { ...outside.output, directory: 'generated' } },
        planningContext(root),
      ),
    ).rejects.toMatchObject({ code: 'LOOM_PLAN_INVALID' });

    const missingSocial = brandingResource();
    expect(() =>
      handler.validate(
        {
          ...missingSocial,
          sources: { foreground: missingSocial.sources.foreground },
        },
      ),
    ).toThrow(/SEO image metadata requires/);
  });

  it('materializes deterministic social and ICO bytes directly from source recipes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'assetloom-brand-render-'));
    await mkdir(path.join(root, 'assets'), { recursive: true });
    await writeFile(
      path.join(root, 'assets/logo.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="5" fill="#fff"/></svg>',
    );
    await writeFile(
      path.join(root, 'assets/background.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#091D3E"/></svg>',
    );
    await writeFile(
      path.join(root, 'assets/social.png'),
      await sharp({
        create: { width: 40, height: 20, channels: 4, background: '#335577' },
      }).png().toBuffer(),
    );
    const artifacts = await new WebAppBrandingResourceHandler().plan(
      'brand',
      brandingResource(),
      planningContext(root),
    );
    const materializer = new ImageArtifactMaterializer();
    const cache = new MemoryCache();
    const context = {
      projectRoot: root,
      normalizedConfiguration: '{"schemaVersion":2}',
      cache,
      outputs: noOutputs,
    };
    const social = await materializer.materialize(
      imageArtifact(artifacts, ':social-preview'),
      context,
    );
    expect(await sharp(social.content).metadata()).toMatchObject({
      width: 1200,
      height: 627,
      format: 'png',
    });
    const icoArtifact = imageArtifact(artifacts, ':favicon-ico');
    const first = await materializer.materialize(icoArtifact, context);
    const second = await materializer.materialize(icoArtifact, context);
    const ico = Buffer.from(first.content);
    expect(ico.subarray(0, 6)).toEqual(Buffer.from([0, 0, 1, 0, 5, 0]));
    expect(second.content).toEqual(first.content);
  });
});

describe('web branding publication lifecycle', () => {
  it.each([
    ['the authored manifest path', 'public/manifest.json', false, 'content-hash'],
    ['a distinct fallback path', 'public/manifest-fallback.json', true, 'content-hash'],
    ['a stable authored manifest path', 'public/manifest.json', false, 'stable'],
  ] as const)(
    'generates and verifies %s',
    async (_caseName, fallbackManifest, fallbackIsOwned, strategy) => {
      const projectRoot = await mkdtemp(
        path.join(tmpdir(), 'assetloom-brand-lifecycle-'),
      );
      try {
        await mkdir(path.join(projectRoot, 'assets'), { recursive: true });
        await writeFile(
          path.join(projectRoot, 'assets/logo.svg'),
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#123456"/></svg>',
        );
        const loaded: LoadedVersionedConfiguration = {
          config: {
            schemaVersion: 2,
            project: { root: '.' },
            targets: {
              portal: {
                kind: 'web-app',
                root: 'web/portal',
                sourceDirectory: 'src',
                publicDirectory: 'public',
                publicBasePath: '/',
              },
            },
            resources: {
              brand: {
                type: 'web-app-branding',
                preset: 'web-app-branding-v1',
                displayName: 'Brand',
                shortName: 'Brand',
                brandColor: '#123456',
                iconBackgroundColor: '#ffffff',
                sources: { foreground: { file: 'assets/logo.svg' } },
                output: {
                  target: 'portal',
                  directory: 'public/assets/brand',
                  manifest: 'public/manifest.json',
                },
                faviconSizes: [16],
                applicationIconSizes: [192],
                naming: {
                  strategy,
                  hashLength: 12,
                  fallbackManifest,
                },
                manifest: {
                  backgroundColor: '#ffffff',
                  display: 'standalone',
                },
              },
            },
          },
          files: [],
          projectRoot,
          provenance: new Map(),
        };
        const runtime = createDefaultCatalogRuntime(loaded);
        await generateV2(loaded, runtime);
        await expect(
          verifyV2(loaded, runtime),
        ).resolves.toMatchObject({ ok: true });

        const manifest = await new ManifestStore(
          projectRoot,
          path.join(projectRoot, '.assetloom'),
        ).load();
        const authoredManifest = 'web/portal/public/manifest.json';
        const distinctFallback =
          'web/portal/public/manifest-fallback.json';
        expect(manifest.files).not.toHaveProperty(authoredManifest);
        if (strategy === 'content-hash') {
          expect(Object.keys(manifest.files)).toContainEqual(
            expect.stringMatching(
              /^web\/portal\/public\/manifest\.[0-9a-f]{12}\.json$/u,
            ),
          );
        }
        if (fallbackIsOwned) {
          expect(manifest.files).toHaveProperty(distinctFallback);
        } else {
          expect(manifest.files).not.toHaveProperty(distinctFallback);
        }
      } finally {
        await rm(projectRoot, { recursive: true, force: true });
      }
    },
  );
});

describe('catalog image variants', () => {
  it('plans target-agnostic raster and ICO variants without target-name branching', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'assetloom-image-plan-'));
    const sourcePath = path.join(root, 'source.svg');
    const context: PlanningContext = {
      projectRoot: root,
      normalizedConfiguration: '{}',
      sourceResolver: {
        resolve: () =>
          Promise.resolve([{ absolutePath: sourcePath, relativePath: 'source.svg' }]),
      },
      resolveTarget: (id) => ({
        id: targetId(id),
        kind: 'directory',
        root: path.join(root, 'arbitrary-output'),
        configuration: { kind: 'directory', root: 'arbitrary-output' },
      }),
    };
    const artifacts = await new ImageVariantsResourceHandler().plan(
      'variants',
      {
        type: 'image-variants',
        source: { file: './source.svg' },
        outputs: [
          {
            target: 'arbitrary',
            path: 'preview.webp',
            width: 1200,
            height: 630,
            format: 'webp',
            fit: 'cover',
            quality: 88,
          },
          {
            target: 'arbitrary',
            path: 'favicon.ico',
            width: 64,
            height: 64,
            format: 'ico',
          },
        ],
      },
      context,
    );
    expect(artifacts).toMatchObject([
      {
        id: 'variants:arbitrary:image:0',
        publication: { mode: 'stable' },
        format: 'webp',
        quality: 88,
        recipe: { kind: 'resize', width: 1200, height: 630, fit: 'cover' },
      },
      {
        id: 'variants:arbitrary:image:1',
        publication: { mode: 'stable' },
        format: 'ico',
        recipe: {
          kind: 'ico',
          images: [
            { recipe: { kind: 'resize', width: 64, height: 64, fit: 'contain' } },
          ],
        },
      },
    ]);
  });
});

describe('catalog web integration adapters', () => {
  it('recovers already-published managed JSON updates and deletions', async () => {
    const adapter = new WebManifestIntegrationAdapter();
    const previousRecipe = {
      adapter: 'web-app-manifest',
      stateKey: 'brand-manifest',
      manifest: { name: 'A', obsolete: 'remove-me' },
    } as const;
    const previous = adapter.apply(
      '{"authored":true}',
      previousRecipe,
      () => 'unused',
    );
    const desiredRecipe = {
      adapter: 'web-app-manifest',
      stateKey: 'brand-manifest',
      manifest: { name: 'B' },
    } as const;

    const recovered = adapter.apply(
      '{"authored":true,"name":"B"}',
      desiredRecipe,
      () => 'unused',
      previous.managed,
    );
    expect(JSON.parse(recovered.content)).toEqual({ authored: true, name: 'B' });
    const recoveryArtifact: IntegrationArtifactForAdapter<'web-app-manifest'> = {
      id: 'brand:portal:manifest',
      resourceId: 'brand',
      resourceType: 'web-app-branding',
      target: targetId('portal'),
      operation: 'integrate-project',
      ownership: 'project-integration',
      dependsOn: [],
      sourceDependencies: [],
      destination: '/project/manifest.json',
      presetVersion: 'test-v1',
      integration: desiredRecipe,
    };
    await expect(
      adapter.prepare(
        recoveryArtifact,
        Buffer.from('{"authored":true,"name":"B"}'),
        previous.managed,
        noOutputs,
      ),
    ).resolves.toMatchObject({ state: { name: 'B' } });
    expect(() =>
      adapter.apply(
        '{"authored":true,"name":"C"}',
        desiredRecipe,
        () => 'unused',
        previous.managed,
      ),
    ).toThrow(/changed after generation/);
    expect(() =>
      adapter.apply(
        '{"authored":true,"name":"B","obsolete":"edited"}',
        desiredRecipe,
        () => 'unused',
        previous.managed,
      ),
    ).toThrow(/changed after generation/);

    expect(() =>
      adapter.apply(
        '{"name":"A","obsolete":"remove-me","start_url":"/authored"}',
        {
          adapter: 'web-app-manifest',
          stateKey: 'brand-manifest',
          manifest: {
            name: 'A',
            obsolete: 'remove-me',
            start_url: '/generated',
          },
        },
        () => 'unused',
        previous.managed,
      ),
    ).toThrow(/unowned project integration/);

    const prototypeKeyPrevious = adapter.apply(
      '{}',
      {
        adapter: 'web-app-manifest',
        stateKey: 'prototype-key',
        manifest: { toString: 'A' },
      },
      () => 'unused',
    );
    const prototypeKeyDeleted = adapter.apply(
      prototypeKeyPrevious.content,
      {
        adapter: 'web-app-manifest',
        stateKey: 'prototype-key',
        manifest: {},
      },
      () => 'unused',
      prototypeKeyPrevious.managed,
    );
    expect(JSON.parse(prototypeKeyDeleted.content)).toEqual({});
  });

  it('recovers already-published static route updates and deletions', async () => {
    const adapter = new StaticWebAppConfigIntegrationAdapter();
    const previousRecipe = {
      adapter: 'static-web-app-config',
      stateKey: 'brand-static',
      routes: [
        { route: '/assets/*', headers: { 'Cache-Control': 'A' } },
        { route: '/retired/*', headers: { 'Cache-Control': 'A' } },
      ],
    } as const;
    const previous = adapter.apply('{}', previousRecipe, undefined);
    const desiredRecipe = {
      adapter: 'static-web-app-config',
      stateKey: 'brand-static',
      routes: [
        { route: '/assets/*', headers: { 'Cache-Control': 'B' } },
      ],
    } as const;
    const alreadyPublished = JSON.stringify({
      routes: [
        { route: '/assets/*', headers: { 'Cache-Control': 'B' } },
        { route: '/api/*', allowedRoles: ['authenticated'] },
      ],
    });

    const recovered = adapter.apply(
      alreadyPublished,
      desiredRecipe,
      previous.state,
    );
    expect(JSON.parse(recovered.content)).toEqual({
      routes: [
        { route: '/assets/*', headers: { 'Cache-Control': 'B' } },
        { route: '/api/*', allowedRoles: ['authenticated'] },
      ],
    });
    const recoveryArtifact: IntegrationArtifactForAdapter<'static-web-app-config'> = {
      id: 'brand:portal:static',
      resourceId: 'brand',
      resourceType: 'web-app-branding',
      target: targetId('portal'),
      operation: 'integrate-project',
      ownership: 'project-integration',
      dependsOn: [],
      sourceDependencies: [],
      destination: '/project/staticwebapp.config.json',
      presetVersion: 'test-v1',
      integration: desiredRecipe,
    };
    await expect(
      adapter.prepare(
        recoveryArtifact,
        Buffer.from(alreadyPublished),
        {
          routes: previous.state.routes.map((item) => ({
            route: item.route,
            headers: { ...item.headers },
          })),
        },
        noOutputs,
      ),
    ).resolves.toMatchObject({
      state: {
        routes: [
          { route: '/assets/*', headers: { 'Cache-Control': 'B' } },
        ],
      },
    });
    expect(() =>
      adapter.apply(
        JSON.stringify({
          routes: [
            { route: '/assets/*', headers: { 'Cache-Control': 'C' } },
          ],
        }),
        desiredRecipe,
        previous.state,
      ),
    ).toThrow(/modified static web app route/);
    expect(() =>
      adapter.apply(
        JSON.stringify({
          routes: [
            { route: '/assets/*', headers: { 'Cache-Control': 'B' } },
            { route: '/retired/*', headers: { 'Cache-Control': 'C' } },
          ],
        }),
        desiredRecipe,
        previous.state,
      ),
    ).toThrow(/modified static web app route/);
  });

  it('uses receipt hashes as compare-and-swap guards for HTML blocks', async () => {
    const adapter = new HtmlHeadIntegrationAdapter();
    const artifact: IntegrationArtifactForAdapter<'html-head'> = {
      id: 'brand:portal:html',
      resourceId: 'brand',
      resourceType: 'web-app-branding',
      target: targetId('portal'),
      operation: 'integrate-project',
      ownership: 'project-integration',
      dependsOn: [],
      sourceDependencies: [],
      destination: '/project/index.html',
      presetVersion: 'test-v1',
      integration: {
        adapter: 'html-head',
        stateKey: 'brand-head',
        elements: [
          { element: 'meta', attributes: { name: 'theme-color', content: '#123456' } },
        ],
      },
    };
    const authored = Buffer.from('<html><head>\n</head></html>');
    const first = await adapter.prepare(artifact, authored, undefined, noOutputs);
    expect(first.state).toMatchObject({ stateKey: 'brand-head' });
    expect(JSON.stringify(first.state)).toMatch(
      /"managedBlockSha256":"[0-9a-f]{64}"/u,
    );
    const edited = Buffer.from(
      Buffer.from(first.content).toString().replace('#123456', '#654321'),
    );
    expect(() =>
      adapter.prepare(artifact, edited, first.state, noOutputs),
    ).toThrow(expect.objectContaining({ code: 'LOOM_WRITE_CONFLICT' }));

    const updatedArtifact: IntegrationArtifactForAdapter<'html-head'> = {
      ...artifact,
      integration: {
        ...artifact.integration,
        elements: [
          { element: 'meta', attributes: { name: 'theme-color', content: '#abcdef' } },
        ],
      },
    };
    const alreadyPublished = Buffer.from(
      adapter.apply(
        Buffer.from(first.content).toString('utf8'),
        updatedArtifact.integration,
        () => 'unused',
      ),
    );
    await expect(
      adapter.prepare(
        updatedArtifact,
        alreadyPublished,
        first.state,
        noOutputs,
      ),
    ).resolves.toMatchObject({ content: alreadyPublished });

    const receipt: StoredIntegrationReceipt = {
      adapter: 'html-head',
      artifactId: artifact.id,
      destination: 'index.html',
      stateKey: 'brand-head',
      target: 'portal',
      state: first.state,
    };
    expect(() => adapter.remove(receipt, edited)).toThrow(
      expect.objectContaining({ code: 'LOOM_WRITE_CONFLICT' }),
    );
    await expect(adapter.remove(receipt, first.content)).resolves.toEqual(authored);

    const legacyReceipt: StoredIntegrationReceipt = {
      ...receipt,
      state: { stateKey: 'brand-head' },
    };
    expect(() => adapter.remove(legacyReceipt, first.content)).toThrow(
      expect.objectContaining({ code: 'LOOM_WRITE_CONFLICT' }),
    );
    await expect(adapter.remove(legacyReceipt, authored)).resolves.toEqual(authored);
    await expect(
      adapter.prepare(artifact, first.content, legacyReceipt.state, noOutputs),
    ).resolves.toMatchObject({ content: first.content });
    expect(() =>
      adapter.prepare(artifact, edited, legacyReceipt.state, noOutputs),
    ).toThrow(expect.objectContaining({ code: 'LOOM_WRITE_CONFLICT' }));
  });

  it('preserves authored JSON/HTML and resolves typed artifact references', () => {
    const manifestRecipe = {
      adapter: 'web-app-manifest',
      stateKey: 'brand-manifest',
      manifest: {
        name: 'Branded',
        icons: [
          {
            src: { kind: 'artifact-output', artifactId: 'logo', value: 'public-path' },
          },
        ],
      },
    } as const;
    const manifest = new WebManifestIntegrationAdapter().apply(
      '{"authored":true}\n',
      manifestRecipe,
      resolveText,
    );
    expect(JSON.parse(manifest.content)).toEqual({
      authored: true,
      name: 'Branded',
      icons: [{ src: '/assets/logo.abc123.png' }],
    });

    const htmlRecipe: HtmlHeadIntegrationRecipe = {
      adapter: 'html-head',
      stateKey: 'brand-head',
      elements: [
        {
          element: 'meta',
          attributes: {
            property: 'og:image',
            content: {
              kind: 'interpolated',
              parts: [
                'https://example.test',
                { kind: 'artifact-output', artifactId: 'logo', value: 'public-path' },
              ],
            },
          },
        },
      ],
    };
    const htmlAdapter = new HtmlHeadIntegrationAdapter();
    const authored = '<html><head><meta name="authored" content="yes">\n</head></html>';
    const integrated = htmlAdapter.apply(
      authored,
      htmlRecipe,
      resolveText,
    );
    expect(integrated).toContain('<meta name="authored" content="yes">');
    expect(integrated).toContain(
      'content="https://example.test/assets/logo.abc123.png" property="og:image"',
    );
    expect(htmlAdapter.apply(integrated, htmlRecipe, resolveText)).toBe(
      integrated,
    );
    const managedBlock = integrated.slice(
      integrated.indexOf('<!-- assetloom:brand-head:start -->'),
      integrated.indexOf('<!-- assetloom:brand-head:end -->') +
        '<!-- assetloom:brand-head:end -->'.length,
    );
    expect(
      htmlAdapter.removeManagedBlock(
        integrated,
        'brand-head',
        sha256(Buffer.from(managedBlock)),
      ),
    ).toBe(authored);
  });

  it('preserves unowned routes and refuses externally modified managed fields', () => {
    const staticAdapter = new StaticWebAppConfigIntegrationAdapter();
    const recipe = {
      adapter: 'static-web-app-config',
      stateKey: 'brand-static',
      routes: [
        { route: '/assets/brand/*', headers: { 'Cache-Control': 'immutable' } },
      ],
    } as const;
    const first = staticAdapter.apply(
      '{"navigationFallback":{"rewrite":"/index.html"},"routes":[{"route":"/api/*","allowedRoles":["authenticated"]}]}',
      recipe,
      undefined,
    );
    expect(JSON.parse(first.content)).toMatchObject({
      navigationFallback: { rewrite: '/index.html' },
      routes: [
        { route: '/assets/brand/*', headers: { 'Cache-Control': 'immutable' } },
        { route: '/api/*', allowedRoles: ['authenticated'] },
      ],
    });
    expect(() =>
      staticAdapter.apply(
        first.content.replace('immutable', 'no-cache'),
        recipe,
        first.state,
      ),
    ).toThrow(/modified static web app route/);

    const manifestAdapter = new WebManifestIntegrationAdapter();
    const manifestRecipe = {
      adapter: 'web-app-manifest',
      stateKey: 'brand-manifest',
      manifest: { name: 'Generated' },
    } as const;
    const previous = manifestAdapter.apply('{}', manifestRecipe, () => 'unused');
    expect(() =>
      manifestAdapter.apply(
        previous.content.replace('Generated', 'Edited'),
        manifestRecipe,
        () => 'unused',
        previous.managed,
      ),
    ).toThrow(/changed after generation/);
  });
});
