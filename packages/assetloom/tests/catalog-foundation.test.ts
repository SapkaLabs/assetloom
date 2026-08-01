import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCompositeGenerationPlan } from '../src/application/planning/composite-planner.js';
import type {
  PlanningContext,
  ResourceHandler,
} from '../src/application/planning/contracts.js';
import { ResourceHandlerRegistry } from '../src/application/planning/resource-handler-registry.js';
import {
  loadConfiguration,
  loadVersionedConfiguration,
} from '../src/config/load.js';
import { normalizeConfiguration } from '../src/config/normalize.js';
import { targetId } from '../src/domain/catalog/targets.js';
import type { FilesResource } from '../src/domain/catalog/resources.js';
import { createGenerationPlan } from '../src/planner/index.js';

function versionTwoConfiguration() {
  return {
    schemaVersion: 2,
    project: { root: '.' },
    targets: {
      mobileComponents: {
        kind: 'react-native-library',
        root: './mobile/components',
      },
      mobileApp: {
        kind: 'react-native-app',
        root: './mobile/app',
        androidFontDirectory: 'android/app/src/main/assets/fonts',
        iosFontDirectory: 'ios/App/Resources',
      },
      dashboard: {
        kind: 'web-app',
        root: './web/dashboard',
        sourceDirectory: 'src',
        publicDirectory: 'public',
        publicBasePath: '/',
      },
      archive: {
        kind: 'directory',
        root: './generated/archive',
      },
    },
    resources: {
      staticFiles: {
        type: 'files',
        source: {
          root: './assets',
          include: ['**/*.{png,jpg}'],
          exclude: ['**/unused/**'],
        },
        outputs: [
          { target: 'mobileComponents', directory: 'src/assets' },
        ],
      },
      icons: {
        type: 'svg-components',
        source: { root: './assets', include: ['**/*.svg'] },
        outputs: [
          {
            target: 'mobileComponents',
            directory: 'src/assets',
            runtime: 'react-native',
            preset: 'themed-icon-v1',
            componentNaming: {
              parentDirectoryPrefix: 'F_',
              separator: '_',
            },
          },
          {
            target: 'dashboard',
            directory: 'src/assets',
            runtime: 'react-dom',
            preset: 'themed-icon-v1',
            componentNaming: {
              parentDirectoryPrefix: 'F_',
              separator: '_',
            },
          },
        ],
      },
      preview: {
        type: 'image-variants',
        source: { file: './assets/preview.svg' },
        outputs: [
          {
            target: 'dashboard',
            path: 'public/preview.webp',
            width: 1200,
            height: 630,
            format: 'webp',
            fit: 'cover',
            quality: 90,
          },
        ],
      },
      onboarding: {
        type: 'native-image-assets',
        source: {
          root: './assets/onboarding',
          include: ['**/*.{png,jpg,jpeg}'],
        },
        output: {
          target: 'mobileApp',
          android: {
            resourceDirectory: 'android/app/src/main/res',
            densities: [
              { density: 'mdpi', width: 480 },
              { density: 'xhdpi', width: 960 },
            ],
          },
          ios: {
            assetCatalogDirectory: 'ios/App/Images.xcassets',
            scales: [
              { scale: '1x', width: 480 },
              { scale: '2x', width: 960 },
              { scale: '3x', width: 1440 },
            ],
          },
        },
        format: 'jpeg',
        quality: 85,
      },
      branding: {
        type: 'web-app-branding',
        preset: 'web-app-branding-v1',
        displayName: 'Inphiz',
        shortName: 'Inphiz',
        brandColor: '#091D3E',
        iconBackgroundColor: '#FFFFFF',
        sources: {
          foreground: { file: './assets/logo.svg' },
          background: { file: './assets/background.svg' },
          socialPreview: './assets/social.png',
        },
        output: {
          target: 'dashboard',
          directory: 'public/assets/brand',
          manifest: 'public/manifest.json',
          document: 'public/index.html',
        },
        faviconSizes: [16, 32, 48],
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
        naming: {
          strategy: 'content-hash',
          hashLength: 12,
          fallbackFavicon: 'public/favicon.ico',
          fallbackManifest: 'public/manifest.json',
        },
        manifest: {
          themeColor: '#091D3E',
          backgroundColor: '#FFFFFF',
          display: 'standalone',
        },
        seo: {
          siteUrl: 'https://example.test',
          title: 'Inphiz',
          description: 'Product overview',
          canonicalPath: '/',
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
          overlayPreset: 'product-overview-v1',
          logoSize: 44,
        },
      },
      poppins: {
        type: 'font-family',
        family: 'Poppins',
        faces: [
          {
            source: {
              package: '@pif/pif-font-poppins',
              path: 'fonts/Poppins-Regular.ttf',
            },
            alias: 'Poppins-Regular',
            weight: 400,
            style: 'normal',
            format: 'ttf',
          },
        ],
        outputs: [
          { target: 'mobileApp', directory: 'assets/fonts' },
          {
            target: 'dashboard',
            directory: 'src/generated/fonts',
            stylesheet: 'src/generated/fonts.css',
          },
        ],
      },
    },
  } as const;
}

async function nativeFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-v1-plan-'));
  await mkdir(path.join(directory, 'android/app/src/main/res'), {
    recursive: true,
  });
  await writeFile(
    path.join(directory, 'android/app/src/main/AndroidManifest.xml'),
    '<manifest><application /></manifest>',
  );
  await writeFile(
    path.join(directory, 'icon.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" /></svg>',
  );
  await writeFile(
    path.join(directory, 'assetloom.json'),
    JSON.stringify({
      schemaVersion: 1,
      project: { root: '.' },
      targets: {
        android: {
          enabled: true,
          resourceDirectory: './android/app/src/main/res',
          manifestPath: './android/app/src/main/AndroidManifest.xml',
        },
      },
      resources: {
        appIcon: {
          type: 'app-icon',
          android: { legacy: { source: './icon.svg' } },
        },
      },
    }),
  );
  return directory;
}

function unusedPlanningContext(projectRoot: string): PlanningContext {
  return {
    projectRoot,
    normalizedConfiguration: '{}',
    sourceResolver: {
      resolve: () => Promise.reject(new Error('No catalog sources expected.')),
    },
    resolveTarget: () => {
      throw new Error('No catalog targets expected.');
    },
  };
}

describe('catalog architecture foundation', () => {
  it('loads the closed version 2 contract with every catalog resource type', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-v2-schema-'));
    await writeFile(
      path.join(directory, 'assetloom.json'),
      JSON.stringify(versionTwoConfiguration()),
    );

    const loaded = await loadVersionedConfiguration(['assetloom.json'], {
      cwd: directory,
    });

    expect(loaded.config.schemaVersion).toBe(2);
    expect(Object.keys(loaded.config.resources)).toEqual([
      'staticFiles',
      'icons',
      'preview',
      'onboarding',
      'branding',
      'poppins',
    ]);
    await expect(
      loadConfiguration(['assetloom.json'], { cwd: directory }),
    ).rejects.toMatchObject({
      code: 'LOOM_CFG_VALIDATE',
      context: { jsonPointer: '/schemaVersion' },
    });
  });

  it('normalizes equivalent configuration objects deterministically', () => {
    const config = versionTwoConfiguration();
    const reordered = {
      ...config,
      project: { root: '.' },
      schemaVersion: 2 as const,
    };
    expect(normalizeConfiguration(reordered)).toBe(
      normalizeConfiguration(config),
    );

    const unicode = normalizeConfiguration({
      schemaVersion: 2,
      project: { root: '.' },
      targets: {},
      resources: {
        '😀': { type: 'files', source: 'source.txt', outputs: [] },
        'é': { type: 'files', source: 'source.txt', outputs: [] },
        z: { type: 'files', source: 'source.txt', outputs: [] },
      },
    });
    expect(unicode.indexOf('"z"')).toBeLessThan(unicode.indexOf('"é"'));
    expect(unicode.indexOf('"é"')).toBeLessThan(unicode.indexOf('"😀"'));
  });

  it('dispatches a resource through its typed handler', async () => {
    const handler: ResourceHandler<FilesResource> = {
      type: 'files',
      validate: () => undefined,
      plan: (resourceId) =>
        Promise.resolve([
          {
            id: `${resourceId}:dashboard:file`,
            resourceId,
            resourceType: 'files',
            target: targetId('dashboard'),
            operation: 'copy-file',
            ownership: 'generated',
            publication: { mode: 'stable' },
            dependsOn: [],
            sourceDependencies: ['C:/source/logo.png'],
            source: 'C:/source/logo.png',
            destination: 'C:/project/public/logo.png',
            presetVersion: '1',
          },
        ]),
    };
    const registry = new ResourceHandlerRegistry({ files: handler });
    const planned = await registry.plan(
      'logo',
      {
        type: 'files',
        source: { file: './logo.png' },
        outputs: [{ target: 'dashboard', directory: 'public' }],
      },
      unusedPlanningContext('C:/project'),
    );
    expect(planned.map((artifact) => artifact.id)).toEqual([
      'logo:dashboard:file',
    ]);
  });

  it('keeps selected target scope when a handler plans no artifacts', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-v2-scope-'));
    await writeFile(
      path.join(directory, 'assetloom.json'),
      JSON.stringify({
        schemaVersion: 2,
        project: { root: '.' },
        targets: {
          archive: { kind: 'directory', root: './generated/archive' },
        },
        resources: {
          files: {
            type: 'files',
            source: { file: './source.txt' },
            outputs: [{ target: 'archive', directory: '.' }],
          },
        },
      }),
    );
    const loaded = await loadVersionedConfiguration(['assetloom.json'], {
      cwd: directory,
    });
    const emptyFilesHandler: ResourceHandler<FilesResource> = {
      type: 'files',
      validate: () => undefined,
      plan: () => Promise.resolve([]),
    };
    const plan = await createCompositeGenerationPlan(
      loaded,
      new ResourceHandlerRegistry({ files: emptyFilesHandler }),
      unusedPlanningContext(directory),
      'archive',
    );

    expect(plan.targets).toEqual(['archive']);
    expect(plan.artifacts).toEqual([]);
  });

  it('keeps version 1 native plan task objects unchanged', async () => {
    const directory = await nativeFixture();
    const nativeLoaded = await loadConfiguration(['assetloom.json'], {
      cwd: directory,
    });
    const versionedLoaded = await loadVersionedConfiguration(
      ['assetloom.json'],
      { cwd: directory },
    );
    const nativePlan = await createGenerationPlan(nativeLoaded);
    const composite = await createCompositeGenerationPlan(
      versionedLoaded,
      new ResourceHandlerRegistry(),
      unusedPlanningContext(directory),
    );

    expect(composite.catalogArtifacts).toEqual([]);
    expect(composite.nativeTasks).toEqual(nativePlan.tasks);
    expect(composite.artifacts).toEqual(nativePlan.tasks);
    expect(JSON.stringify(composite.artifacts)).toBe(
      JSON.stringify(nativePlan.tasks),
    );
  });
});
