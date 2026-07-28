import path from 'node:path';
import { resolveProjectPath, resolveSourcePath } from '../config/paths.js';
import { LoomError } from '../domain/errors.js';
import type {
  AppIconResource,
  GenerationPlan,
  GenerationTask,
  LoadedConfiguration,
  SplashScreenResource,
  TargetPlatform,
} from '../domain/types.js';
import {
  planAndroidAppIcon,
  planIosAppIcon,
} from '../resources/app-icon/plan.js';
import { planAndroidNotificationIcon } from '../resources/notification-icon/plan.js';
import {
  planAndroidSplashScreen,
  planIosSplashScreen,
} from '../resources/splash-screen/plan.js';

const SUPPORTED_TARGETS = ['android', 'ios'] as const;

export function parseTarget(value: string): TargetPlatform {
  if (value === 'android' || value === 'ios') {
    return value;
  }
  throw new LoomError({
    code: 'LOOM_PLAN_TARGET_UNSUPPORTED',
    message: `Unsupported target "${value}".`,
    context: {
      target: value,
      supportedTargets: [...SUPPORTED_TARGETS],
    },
  });
}

function selectedTargets(
  loaded: LoadedConfiguration,
  filter?: TargetPlatform,
): TargetPlatform[] {
  const targets = SUPPORTED_TARGETS.filter(
    (target) => loaded.config.targets[target]?.enabled === true,
  );
  if (filter === undefined) {
    if (targets.length === 0) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'No native generation targets are enabled.',
      });
    }
    return targets;
  }
  if (!targets.includes(filter)) {
    throw new LoomError({
      code: 'LOOM_PLAN_INVALID',
      message: `Target "${filter}" is not enabled in the Assetloom configuration.`,
      context: { target: filter },
    });
  }
  return [filter];
}

async function resolveAppIconSources(
  loaded: LoadedConfiguration,
  resourceId: string,
  resource: AppIconResource,
  target: TargetPlatform,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (target === 'android' && resource.android !== undefined) {
    const android = resource.android;
    const entries: Array<[string, string | undefined]> = [
      ['legacy', android.legacy?.source],
      ['round', android.round?.source],
      ['adaptive.foreground', android.adaptive?.foreground.source],
      [
        'adaptive.background',
        android.adaptive?.background.source,
      ],
      ['adaptive.monochrome', android.adaptive?.monochrome?.source],
    ];
    await Promise.all(
      entries.map(async ([key, source]) => {
        if (source !== undefined) {
          result[key] = await resolveSourcePath(
            loaded.projectRoot,
            source,
            `/resources/${resourceId}/android/${key.replaceAll('.', '/')}/source`,
          );
        }
      }),
    );
  }
  if (target === 'ios' && resource.ios !== undefined) {
    const ios = resource.ios;
    if (ios.mode === 'icon-composer') {
      result['icon-composer'] = await resolveSourcePath(
        loaded.projectRoot,
        ios.source,
        `/resources/${resourceId}/ios/source`,
      );
    } else {
      const entries: Array<[string, string | undefined]> = [
        ['light', ios.light.source],
        ['dark', ios.dark?.source],
        ['tinted', ios.tinted?.source],
      ];
      await Promise.all(
        entries.map(async ([key, source]) => {
          if (source !== undefined) {
            result[key] = await resolveSourcePath(
              loaded.projectRoot,
              source,
              `/resources/${resourceId}/ios/${key}/source`,
            );
          }
        }),
      );
    }
  }
  return result;
}

async function resolveSplashSources(
  loaded: LoadedConfiguration,
  resourceId: string,
  resource: SplashScreenResource,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {
    light: await resolveSourcePath(
      loaded.projectRoot,
      resource.light.image,
      `/resources/${resourceId}/light/image`,
    ),
  };
  if (resource.dark !== undefined) {
    result['dark'] = await resolveSourcePath(
      loaded.projectRoot,
      resource.dark.image,
      `/resources/${resourceId}/dark/image`,
    );
  }
  return result;
}

function assertNoCollisions(tasks: readonly GenerationTask[]): void {
  const destinations = new Map<string, GenerationTask>();
  for (const task of tasks) {
    const key = path.resolve(task.destination).toLocaleLowerCase('en-US');
    const previous = destinations.get(key);
    if (previous !== undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_COLLISION',
        message: 'Multiple generation tasks resolve to the same destination.',
        context: {
          destination: task.destination,
          taskIds: [previous.id, task.id],
        },
      });
    }
    destinations.set(key, task);
  }
}

export async function createGenerationPlan(
  loaded: LoadedConfiguration,
  targetFilter?: TargetPlatform,
): Promise<GenerationPlan> {
  const targets = selectedTargets(loaded, targetFilter);
  const tasks: GenerationTask[] = [];
  const androidTarget = loaded.config.targets.android;
  const iosTarget = loaded.config.targets.ios;

  for (const [resourceId, resource] of Object.entries(
    loaded.config.resources,
  )) {
    if (
      resource.type === 'app-icon' &&
      targets.includes('android') &&
      androidTarget !== undefined
    ) {
      const sources = await resolveAppIconSources(
        loaded,
        resourceId,
        resource,
        'android',
      );
      tasks.push(
        ...planAndroidAppIcon(
          resourceId,
          resource,
          resolveProjectPath(
            loaded.projectRoot,
            androidTarget.resourceDirectory,
            '/targets/android/resourceDirectory',
          ),
          sources,
        ),
      );
    }
    if (
      resource.type === 'app-icon' &&
      targets.includes('ios') &&
      iosTarget !== undefined
    ) {
      const sources = await resolveAppIconSources(
        loaded,
        resourceId,
        resource,
        'ios',
      );
      tasks.push(
        ...planIosAppIcon(
          resourceId,
          resource,
          resolveProjectPath(
            loaded.projectRoot,
            iosTarget.projectDirectory,
            '/targets/ios/projectDirectory',
          ),
          resolveProjectPath(
            loaded.projectRoot,
            iosTarget.assetCatalogDirectory,
            '/targets/ios/assetCatalogDirectory',
          ),
          sources,
        ),
      );
    }
    if (
      resource.type === 'notification-icon' &&
      targets.includes('android') &&
      androidTarget !== undefined
    ) {
      const source = await resolveSourcePath(
        loaded.projectRoot,
        resource.android.source,
        `/resources/${resourceId}/android/source`,
      );
      tasks.push(
        ...planAndroidNotificationIcon(
          resourceId,
          resource,
          resolveProjectPath(
            loaded.projectRoot,
            androidTarget.resourceDirectory,
            '/targets/android/resourceDirectory',
          ),
          source,
        ),
      );
    }
    if (resource.type === 'splash-screen') {
      const sources = await resolveSplashSources(loaded, resourceId, resource);
      if (targets.includes('android') && androidTarget !== undefined) {
        tasks.push(
          ...planAndroidSplashScreen(
            resourceId,
            resource,
            resolveProjectPath(
              loaded.projectRoot,
              androidTarget.resourceDirectory,
              '/targets/android/resourceDirectory',
            ),
            sources,
          ),
        );
      }
      if (targets.includes('ios') && iosTarget !== undefined) {
        tasks.push(
          ...planIosSplashScreen(
            resourceId,
            resource,
            resolveProjectPath(
              loaded.projectRoot,
              iosTarget.projectDirectory,
              '/targets/ios/projectDirectory',
            ),
            resolveProjectPath(
              loaded.projectRoot,
              iosTarget.assetCatalogDirectory,
              '/targets/ios/assetCatalogDirectory',
            ),
            sources,
          ),
        );
      }
    }
  }

  if (targets.includes('android') && androidTarget !== undefined) {
    const resourceDirectory = resolveProjectPath(
      loaded.projectRoot,
      androidTarget.resourceDirectory,
      '/targets/android/resourceDirectory',
    );
    const hasSplash = Object.values(loaded.config.resources).some(
      (resource) => resource.type === 'splash-screen',
    );
    const hasDarkSplash = Object.values(loaded.config.resources).some(
      (resource) =>
        resource.type === 'splash-screen' && resource.dark !== undefined,
    );
    tasks.push(
      {
        id: 'android:values',
        resourceId: '__target__',
        resourceType: 'target-integration',
        target: 'android',
        operation: 'write-xml',
        sourceDependencies: [],
        format: 'xml',
        destination: path.join(
          resourceDirectory,
          'values',
          'assetloom.xml',
        ),
        presetVersion: '1',
      },
      {
        id: 'android:manifest',
        resourceId: '__target__',
        resourceType: 'target-integration',
        target: 'android',
        operation: 'update-project',
        sourceDependencies: [],
        format: 'xml',
        destination: resolveProjectPath(
          loaded.projectRoot,
          androidTarget.manifestPath,
          '/targets/android/manifestPath',
        ),
        presetVersion: '1',
      },
    );
    if (hasDarkSplash) {
      tasks.push({
        id: 'android:values-night',
        resourceId: '__target__',
        resourceType: 'target-integration',
        target: 'android',
        operation: 'write-xml',
        sourceDependencies: [],
        format: 'xml',
        destination: path.join(
          resourceDirectory,
          'values-night',
          'assetloom.xml',
        ),
        presetVersion: '1',
      });
    }
    if (hasSplash) {
      tasks.push(
        {
          id: 'android:values-v31',
          resourceId: '__target__',
          resourceType: 'target-integration',
          target: 'android',
          operation: 'write-xml',
          sourceDependencies: [],
          format: 'xml',
          destination: path.join(
            resourceDirectory,
            'values-v31',
            'assetloom.xml',
          ),
          presetVersion: '1',
        },
        {
          id: 'android:splash-drawable',
          resourceId: '__target__',
          resourceType: 'target-integration',
          target: 'android',
          operation: 'write-xml',
          sourceDependencies: [],
          format: 'xml',
          destination: path.join(
            resourceDirectory,
            'drawable',
            'assetloom_splash_screen.xml',
          ),
          presetVersion: '1',
        },
      );
    }
  }

  if (targets.includes('ios') && iosTarget !== undefined) {
    tasks.push({
      id: 'ios:project',
      resourceId: '__target__',
      resourceType: 'target-integration',
      target: 'ios',
      operation: 'update-project',
      sourceDependencies: [],
      destination: resolveProjectPath(
        loaded.projectRoot,
        iosTarget.projectFile,
        '/targets/ios/projectFile',
      ),
      presetVersion: '1',
    });
  }

  tasks.sort((left, right) => left.destination.localeCompare(right.destination));
  assertNoCollisions(tasks);
  return {
    projectRoot: loaded.projectRoot,
    targets,
    tasks,
  };
}
