import path from 'node:path';
import type {
  GenerationTask,
  NotificationIconResource,
} from '../../domain/types.js';

const ANDROID_DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
] as const;

export function planAndroidNotificationIcon(
  resourceId: string,
  resource: NotificationIconResource,
  resourceDirectory: string,
  source: string,
): GenerationTask[] {
  return ANDROID_DENSITIES.map(([density, scale]) => {
    const width = Math.round(24 * scale);
    return {
      id: `${resourceId}:android:${density}`,
      resourceId,
      resourceType: resource.type,
      target: 'android',
      operation: 'render',
      renderMode: 'monochrome',
      sourceDependencies: [source],
      width,
      height: width,
      format: 'png',
      destination: path.join(
        resourceDirectory,
        `drawable-${density}`,
        'assetloom_notification.png',
      ),
      presetVersion: '1',
    };
  });
}
