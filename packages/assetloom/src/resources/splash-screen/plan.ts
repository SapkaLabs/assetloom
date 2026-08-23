import path from 'node:path';
import { LoomError } from '../../domain/errors.js';
import type {
  GenerationTask,
  SplashScreenResource,
  TargetPlatform,
} from '../../domain/types.js';

const ANDROID_DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
] as const;

const ANDROID_SPLASH_CANVAS_DP = 288;
const ANDROID_SPLASH_SAFE_ZONE_DP = 192;

function renderTask(options: {
  id: string;
  resourceId: string;
  target: TargetPlatform;
  source: string;
  width: number;
  height: number;
  renderLayout?: GenerationTask['renderLayout'];
  destination: string;
}): GenerationTask {
  return {
    id: options.id,
    resourceId: options.resourceId,
    resourceType: 'splash-screen',
    target: options.target,
    operation: 'render',
    renderMode: 'standard',
    sourceDependencies: [options.source],
    width: options.width,
    height: options.height,
    ...(options.renderLayout === undefined
      ? {}
      : { renderLayout: options.renderLayout }),
    format: 'png',
    destination: options.destination,
    presetVersion: '2',
  };
}

function androidRenderDimensions(
  appearance: SplashScreenResource['light'],
  densityScale: number,
): {
  readonly canvas: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
} {
  const imageHeight = appearance.imageHeight ?? appearance.imageWidth;
  const safeZoneScale = Math.min(
    1,
    ANDROID_SPLASH_SAFE_ZONE_DP /
      Math.hypot(appearance.imageWidth, imageHeight),
  );
  return {
    canvas: Math.round(ANDROID_SPLASH_CANVAS_DP * densityScale),
    contentWidth: Math.round(
      appearance.imageWidth * safeZoneScale * densityScale,
    ),
    contentHeight: Math.round(imageHeight * safeZoneScale * densityScale),
  };
}

export function planAndroidSplashScreen(
  resourceId: string,
  resource: SplashScreenResource,
  resourceDirectory: string,
  sources: Readonly<Record<string, string>>,
): GenerationTask[] {
  const lightSource = sources['light'];
  if (lightSource === undefined) {
    throw new LoomError({
      code: 'LOOM_PLAN_INVALID',
      message: `Missing resolved splash source for "${resourceId}".`,
    });
  }
  const tasks: GenerationTask[] = [];
  for (const [density, scale] of ANDROID_DENSITIES) {
    const lightDimensions = androidRenderDimensions(resource.light, scale);
    tasks.push(
      renderTask({
        id: `${resourceId}:android:light:${density}`,
        resourceId,
        target: 'android',
        source: lightSource,
        width: Math.round(resource.light.imageWidth * scale),
        height: Math.round(
          (resource.light.imageHeight ?? resource.light.imageWidth) * scale,
        ),
        destination: path.join(
          resourceDirectory,
          `drawable-${density}`,
          'assetloom_splash.png',
        ),
      }),
      renderTask({
        id: `${resourceId}:android:api31-light:${density}`,
        resourceId,
        target: 'android',
        source: lightSource,
        width: lightDimensions.canvas,
        height: lightDimensions.canvas,
        renderLayout: {
          kind: 'centered-content',
          width: lightDimensions.contentWidth,
          height: lightDimensions.contentHeight,
        },
        destination: path.join(
          resourceDirectory,
          `drawable-${density}`,
          'assetloom_splash_api31.png',
        ),
      }),
    );
    if (resource.dark !== undefined) {
      const darkSource = sources['dark'];
      if (darkSource === undefined) {
        throw new LoomError({
          code: 'LOOM_PLAN_INVALID',
          message: `Missing resolved dark splash source for "${resourceId}".`,
        });
      }
      const darkDimensions = androidRenderDimensions(resource.dark, scale);
      tasks.push(
        renderTask({
          id: `${resourceId}:android:dark:${density}`,
          resourceId,
          target: 'android',
          source: darkSource,
          width: Math.round(resource.dark.imageWidth * scale),
          height: Math.round(
            (resource.dark.imageHeight ?? resource.dark.imageWidth) * scale,
          ),
          destination: path.join(
            resourceDirectory,
            `drawable-night-${density}`,
            'assetloom_splash.png',
          ),
        }),
        renderTask({
          id: `${resourceId}:android:api31-dark:${density}`,
          resourceId,
          target: 'android',
          source: darkSource,
          width: darkDimensions.canvas,
          height: darkDimensions.canvas,
          renderLayout: {
            kind: 'centered-content',
            width: darkDimensions.contentWidth,
            height: darkDimensions.contentHeight,
          },
          destination: path.join(
            resourceDirectory,
            `drawable-night-${density}`,
            'assetloom_splash_api31.png',
          ),
        }),
      );
    }
  }
  return tasks;
}

export function planIosSplashScreen(
  resourceId: string,
  resource: SplashScreenResource,
  projectDirectory: string,
  assetCatalogDirectory: string,
  sources: Readonly<Record<string, string>>,
): GenerationTask[] {
  const imageSet = path.join(
    assetCatalogDirectory,
    'AssetloomSplash.imageset',
  );
  const tasks: GenerationTask[] = [];
  for (const appearance of ['light', 'dark'] as const) {
    const details = resource[appearance];
    const source = sources[appearance];
    if (details === undefined || source === undefined) {
      continue;
    }
    for (const scale of [1, 2, 3] as const) {
      tasks.push(
        renderTask({
          id: `${resourceId}:ios:${appearance}:${scale}x`,
          resourceId,
          target: 'ios',
          source,
          width: Math.round(details.imageWidth * scale),
          height: Math.round(
            (details.imageHeight ?? details.imageWidth) * scale,
          ),
          destination: path.join(
            imageSet,
            `AssetloomSplash-${appearance}@${scale}x.png`,
          ),
        }),
      );
    }
  }

  tasks.push(
    {
      id: `${resourceId}:ios:image-contents`,
      resourceId,
      resourceType: resource.type,
      target: 'ios',
      operation: 'write-json',
      sourceDependencies: Object.values(sources),
      format: 'json',
      destination: path.join(imageSet, 'Contents.json'),
      presetVersion: '1',
    },
    {
      id: `${resourceId}:ios:color-contents`,
      resourceId,
      resourceType: resource.type,
      target: 'ios',
      operation: 'write-json',
      sourceDependencies: [],
      format: 'json',
      destination: path.join(
        assetCatalogDirectory,
        'AssetloomSplashBackground.colorset',
        'Contents.json',
      ),
      presetVersion: '1',
    },
    {
      id: `${resourceId}:ios:storyboard`,
      resourceId,
      resourceType: resource.type,
      target: 'ios',
      operation: 'write-xml',
      sourceDependencies: Object.values(sources),
      format: 'xml',
      destination: path.join(
        projectDirectory,
        'AssetloomLaunchScreen.storyboard',
      ),
      presetVersion: '1',
    },
  );
  return tasks;
}
