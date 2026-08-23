import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { generateVersioned } from '../src/api/generate-v2.js';
import { loadVersionedConfiguration } from '../src/config/load.js';
import type {
  AssetloomConfiguration,
  GenerationTask,
  SplashScreenResource,
} from '../src/domain/types.js';
import { planAndroidSplashScreen } from '../src/resources/splash-screen/plan.js';
import { SharpRenderer } from '../src/renderers/sharp-renderer.js';
import { createDefaultCatalogRuntime } from '../src/infrastructure/composition/default-catalog-runtime.js';
import { ContentCache } from '../src/storage/cache.js';
import { iosTaskContent } from '../src/targets/ios/content.js';

const splashResource = {
  type: 'splash-screen',
  light: {
    image: './splash.svg',
    backgroundColor: '#091D3E',
    imageWidth: 128,
    imageHeight: 96,
  },
  text: 'Copyright & configured <footer>',
  textColor: '#F0E1D2',
} satisfies SplashScreenResource;

function configuration(): AssetloomConfiguration {
  return {
    schemaVersion: 1,
    project: { root: '.' },
    targets: {},
    resources: { splash: splashResource },
  };
}

describe('splash screen generation', () => {
  it('keeps square splash behavior when imageHeight is omitted', () => {
    const squareResource = {
      type: 'splash-screen',
      light: {
        image: './splash.svg',
        backgroundColor: '#091D3E',
        imageWidth: 128,
      },
    } satisfies SplashScreenResource;
    const task = planAndroidSplashScreen(
      'splash',
      squareResource,
      path.join('android', 'res'),
      { light: path.join('source', 'splash.svg') },
    ).find((candidate) => candidate.id === 'splash:android:light:mdpi');

    expect(task).toMatchObject({ width: 128, height: 128 });
  });

  it('rejects an incomplete footer at the configuration boundary', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-splash-config-'));
    try {
      await writeFile(
        path.join(directory, 'assetloom.json'),
        JSON.stringify({
          schemaVersion: 1,
          project: { root: '.' },
          targets: {},
          resources: {
            splash: {
              type: 'splash-screen',
              light: {
                image: './splash.svg',
                backgroundColor: '#091D3E',
                imageWidth: 128,
              },
              text: 'Footer without a color',
            },
          },
        }),
      );

      await expect(
        loadVersionedConfiguration(['assetloom.json'], { cwd: directory }),
      ).rejects.toMatchObject({ code: 'LOOM_CFG_VALIDATE' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('places Android artwork on the Android 12 icon canvas', () => {
    const tasks = planAndroidSplashScreen(
      'splash',
      splashResource,
      path.join('android', 'app', 'src', 'main', 'res'),
      { light: path.join('source', 'splash.svg') },
    );

    const preApi31Task = tasks.find(
      (task) => task.id === 'splash:android:light:mdpi',
    );
    expect(preApi31Task).toMatchObject({
      width: 128,
      height: 96,
    });
    expect(preApi31Task?.destination).toContain('assetloom_splash.png');

    const api31Task = tasks.find(
      (task) => task.id === 'splash:android:api31-light:mdpi',
    );
    expect(api31Task).toMatchObject({
      width: 288,
      height: 288,
      renderLayout: {
        kind: 'centered-content',
        width: 128,
        height: 96,
      },
    });
    expect(api31Task?.destination).toContain('assetloom_splash_api31.png');
  });

  it('renders transparent Android 12 padding around the configured artwork', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-splash-'));
    try {
      const source = path.join(directory, 'splash.svg');
      await writeFile(
        source,
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#ff0080"/></svg>',
      );
      const task = planAndroidSplashScreen(
        'splash',
        splashResource,
        path.join(directory, 'res'),
        { light: source },
      ).find(
        (candidate) => candidate.id === 'splash:android:api31-light:mdpi',
      );
      if (task === undefined) {
        throw new Error('Expected an Android API 31 mdpi splash render task.');
      }

      const output = await new SharpRenderer(
        new ContentCache(path.join(directory, '.assetloom')),
      ).render(task);
      const image = sharp(output);
      await expect(image.metadata()).resolves.toMatchObject({
        width: 288,
        height: 288,
        hasAlpha: true,
      });
      const { data, info } = await image
        .raw()
        .toBuffer({ resolveWithObject: true });
      const alphaAt = (x: number, y: number): number =>
        data[(y * info.width + x) * info.channels + 3] ?? 0;
      expect(alphaAt(0, 0)).toBe(0);
      expect(alphaAt(144, 144)).toBe(255);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('publishes the distinct Android and configured iOS splash outputs', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-splash-public-'));
    try {
      await writeFile(
        path.join(directory, 'splash.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#ff0080"/></svg>',
      );
      await writeFile(
        path.join(directory, 'assetloom.json'),
        JSON.stringify({
          schemaVersion: 1,
          project: { root: '.' },
          targets: {
            android: {
              enabled: true,
              resourceDirectory: './android/res',
            },
            ios: {
              enabled: true,
              projectDirectory: './ios/App',
              assetCatalogDirectory: './ios/App/Images.xcassets',
            },
          },
          resources: { splash: splashResource },
        }),
      );
      const loaded = await loadVersionedConfiguration(['assetloom.json'], {
        cwd: directory,
      });
      await generateVersioned(loaded, createDefaultCatalogRuntime(loaded));

      const preApi31 = sharp(
        await readFile(
          path.join(
            directory,
            'android/res/drawable-mdpi/assetloom_splash.png',
          ),
        ),
      );
      await expect(preApi31.metadata()).resolves.toMatchObject({
        width: 128,
        height: 96,
      });
      const api31 = sharp(
        await readFile(
          path.join(
            directory,
            'android/res/drawable-mdpi/assetloom_splash_api31.png',
          ),
        ),
      );
      await expect(api31.metadata()).resolves.toMatchObject({
        width: 288,
        height: 288,
      });
      await expect(
        readFile(path.join(directory, 'android/res/values-v31/assetloom.xml'), 'utf8'),
      ).resolves.toContain('@drawable/assetloom_splash_api31');
      await expect(
        readFile(
          path.join(directory, 'ios/App/AssetloomLaunchScreen.storyboard'),
          'utf8',
        ),
      ).resolves.toContain('text="Copyright &amp; configured &lt;footer&gt;"');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('uses configured dimensions, colors, and footer content in the iOS storyboard', () => {
    const task = {
      id: 'splash:ios:storyboard',
      resourceId: 'splash',
      resourceType: 'splash-screen',
      target: 'ios',
      operation: 'write-xml',
      sourceDependencies: [],
      format: 'xml',
      destination: 'AssetloomLaunchScreen.storyboard',
      presetVersion: '1',
    } satisfies GenerationTask;

    const storyboard = iosTaskContent(task, configuration()).toString('utf8');

    expect(storyboard).toContain(
      'firstItem="assetloom-image" firstAttribute="width" constant="128"',
    );
    expect(storyboard).toContain(
      'firstItem="assetloom-image" firstAttribute="height" constant="96"',
    );
    expect(storyboard).toContain('text="Copyright &amp; configured &lt;footer&gt;"');
    expect(storyboard).toContain('red="0.941" green="0.882" blue="0.824"');
    expect(storyboard).toContain('red="0.035" green="0.114" blue="0.243"');
    expect(storyboard).toContain('secondItem="assetloom-safe-area" secondAttribute="bottom"');
  });
});
