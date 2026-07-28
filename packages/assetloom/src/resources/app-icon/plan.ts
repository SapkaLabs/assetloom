import path from 'node:path';
import { LoomError } from '../../domain/errors.js';
import type {
  AppIconResource,
  GenerationTask,
  TargetPlatform,
} from '../../domain/types.js';

const PRESET_VERSION = '1';

const ANDROID_DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
] as const;

function renderTask(options: {
  id: string;
  resourceId: string;
  target: TargetPlatform;
  source: string;
  width: number;
  destination: string;
}): GenerationTask {
  return {
    id: options.id,
    resourceId: options.resourceId,
    resourceType: 'app-icon',
    target: options.target,
    operation: 'render',
    sourceDependencies: [options.source],
    width: options.width,
    height: options.width,
    format: 'png',
    destination: options.destination,
    presetVersion: PRESET_VERSION,
  };
}

export function planAndroidAppIcon(
  resourceId: string,
  resource: AppIconResource,
  resourceDirectory: string,
  sources: Readonly<Record<string, string>>,
): GenerationTask[] {
  const android = resource.android;
  if (android === undefined) {
    return [];
  }

  const tasks: GenerationTask[] = [];
  const legacySource = sources['legacy'] ?? sources['adaptive.foreground'];
  if (legacySource !== undefined) {
    for (const [density, scale] of ANDROID_DENSITIES) {
      tasks.push(
        renderTask({
          id: `${resourceId}:android:legacy:${density}`,
          resourceId,
          target: 'android',
          source: legacySource,
          width: Math.round(48 * scale),
          destination: path.join(
            resourceDirectory,
            `mipmap-${density}`,
            'ic_launcher.png',
          ),
        }),
      );
    }
  }

  const roundSource = sources['round'] ?? legacySource;
  if (roundSource !== undefined) {
    for (const [density, scale] of ANDROID_DENSITIES) {
      tasks.push(
        renderTask({
          id: `${resourceId}:android:round:${density}`,
          resourceId,
          target: 'android',
          source: roundSource,
          width: Math.round(48 * scale),
          destination: path.join(
            resourceDirectory,
            `mipmap-${density}`,
            'ic_launcher_round.png',
          ),
        }),
      );
    }
  }

  if (android.adaptive !== undefined) {
    const foreground = sources['adaptive.foreground'];
    if (foreground === undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: `Missing resolved adaptive foreground source for "${resourceId}".`,
      });
    }
    const backgroundSource = sources['adaptive.background'];
    const monochrome = sources['adaptive.monochrome'];

    for (const [density, scale] of ANDROID_DENSITIES) {
      const width = Math.round(108 * scale);
      tasks.push(
        renderTask({
          id: `${resourceId}:android:adaptive-foreground:${density}`,
          resourceId,
          target: 'android',
          source: foreground,
          width,
          destination: path.join(
            resourceDirectory,
            `mipmap-${density}`,
            'ic_launcher_foreground.png',
          ),
        }),
      );
      if (backgroundSource !== undefined) {
        tasks.push(
          renderTask({
            id: `${resourceId}:android:adaptive-background:${density}`,
            resourceId,
            target: 'android',
            source: backgroundSource,
            width,
            destination: path.join(
              resourceDirectory,
              `mipmap-${density}`,
              'ic_launcher_background.png',
            ),
          }),
        );
      }
      if (monochrome !== undefined) {
        tasks.push(
          renderTask({
            id: `${resourceId}:android:adaptive-monochrome:${density}`,
            resourceId,
            target: 'android',
            source: monochrome,
            width,
            destination: path.join(
              resourceDirectory,
              `mipmap-${density}`,
              'ic_launcher_monochrome.png',
            ),
          }),
        );
      }
    }

    const adaptiveSources = [foreground];
    if (backgroundSource !== undefined) {
      adaptiveSources.push(backgroundSource);
    }
    if (monochrome !== undefined) {
      adaptiveSources.push(monochrome);
    }
    for (const filename of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
      tasks.push({
        id: `${resourceId}:android:adaptive-xml:${filename}`,
        resourceId,
        resourceType: 'app-icon',
        target: 'android',
        operation: 'write-xml',
        sourceDependencies: adaptiveSources,
        format: 'xml',
        destination: path.join(
          resourceDirectory,
          'mipmap-anydpi-v26',
          filename,
        ),
        presetVersion: PRESET_VERSION,
      });
    }
  }

  return tasks;
}

export function planIosAppIcon(
  resourceId: string,
  resource: AppIconResource,
  projectDirectory: string,
  assetCatalogDirectory: string,
  sources: Readonly<Record<string, string>>,
): GenerationTask[] {
  const ios = resource.ios;
  if (ios === undefined) {
    return [];
  }

  if (ios.mode === 'icon-composer') {
    const source = sources['icon-composer'];
    if (source === undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: `Missing resolved Icon Composer source for "${resourceId}".`,
      });
    }
    const name = ios.name ?? 'AppIcon';
    return [
      {
        id: `${resourceId}:ios:icon-composer`,
        resourceId,
        resourceType: 'app-icon',
        target: 'ios',
        operation: 'copy',
        sourceDependencies: [source],
        format: 'directory',
        destination: path.join(projectDirectory, `${name}.icon`),
        presetVersion: PRESET_VERSION,
      },
    ];
  }

  const directory = path.join(assetCatalogDirectory, 'AppIcon.appiconset');
  const appearances = [
    ['light', sources['light']],
    ['dark', sources['dark']],
    ['tinted', sources['tinted']],
  ] as const;
  const tasks: GenerationTask[] = [];
  for (const [appearance, source] of appearances) {
    if (source === undefined) {
      continue;
    }
    tasks.push(
      renderTask({
        id: `${resourceId}:ios:${appearance}`,
        resourceId,
        target: 'ios',
        source,
        width: 1024,
        destination: path.join(directory, `AppIcon-${appearance}.png`),
      }),
    );
  }
  tasks.push({
    id: `${resourceId}:ios:contents`,
    resourceId,
    resourceType: 'app-icon',
    target: 'ios',
    operation: 'write-json',
    sourceDependencies: appearances.flatMap(([, source]) =>
      source === undefined ? [] : [source],
    ),
    format: 'json',
    destination: path.join(directory, 'Contents.json'),
    presetVersion: PRESET_VERSION,
  });
  return tasks;
}
