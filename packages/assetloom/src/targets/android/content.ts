import { LoomError } from '../../domain/errors.js';
import type {
  AssetloomConfiguration,
  GenerationTask,
} from '../../domain/types.js';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function appIcon(config: AssetloomConfiguration) {
  return Object.values(config.resources).find(
    (resource) => resource.type === 'app-icon' && resource.android !== undefined,
  );
}

function notificationIcon(config: AssetloomConfiguration) {
  return Object.values(config.resources).find(
    (resource) => resource.type === 'notification-icon',
  );
}

function splash(config: AssetloomConfiguration) {
  return Object.values(config.resources).find(
    (resource) => resource.type === 'splash-screen',
  );
}

function valuesXml(config: AssetloomConfiguration, night: boolean): string {
  const icon = appIcon(config);
  const notification = notificationIcon(config);
  const splashResource = splash(config);
  const splashAppearance =
    night && splashResource?.dark !== undefined
      ? splashResource.dark
      : splashResource?.light;
  const background =
    icon?.type === 'app-icon' &&
    icon.android?.adaptive !== undefined &&
    'color' in icon.android.adaptive.background
      ? icon.android.adaptive.background.color
      : '#FFFFFF';
  const notificationColor =
    notification?.type === 'notification-icon'
      ? (notification.android.color ?? '#000000')
      : '#000000';
  const splashColor = splashAppearance?.backgroundColor ?? '#FFFFFF';

  const style = night
    ? ''
    : `
  <style name="AssetloomTheme" parent="@style/AppTheme">
    <item name="android:windowBackground">@drawable/assetloom_splash_screen</item>
  </style>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="assetloom_adaptive_icon_background">${escapeXml(background)}</color>
  <color name="assetloom_notification_color">${escapeXml(notificationColor)}</color>
  <color name="assetloom_splash_background">${escapeXml(splashColor)}</color>${style}
</resources>
`;
}

function valuesV31Xml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <style name="AssetloomTheme" parent="@style/AppTheme">
    <item name="android:windowBackground">@drawable/assetloom_splash_screen</item>
    <item name="android:windowSplashScreenBackground">@color/assetloom_splash_background</item>
    <item name="android:windowSplashScreenAnimatedIcon">@drawable/assetloom_splash</item>
  </style>
</resources>
`;
}

function splashDrawableXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@color/assetloom_splash_background" />
  <item>
    <bitmap
      android:gravity="center"
      android:src="@drawable/assetloom_splash" />
  </item>
</layer-list>
`;
}

function adaptiveIconXml(config: AssetloomConfiguration): string {
  const icon = appIcon(config);
  if (icon?.type !== 'app-icon' || icon.android?.adaptive === undefined) {
    throw new LoomError({
      code: 'LOOM_PLAN_INVALID',
      message: 'Adaptive icon XML was planned without an adaptive icon resource.',
    });
  }
  const background =
    'source' in icon.android.adaptive.background
      ? '@mipmap/ic_launcher_background'
      : '@color/assetloom_adaptive_icon_background';
  const monochrome =
    icon.android.adaptive.monochrome === undefined
      ? ''
      : '\n  <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />';
  return `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="${background}" />
  <foreground android:drawable="@mipmap/ic_launcher_foreground" />${monochrome}
</adaptive-icon>
`;
}

export function androidTaskContent(
  task: GenerationTask,
  config: AssetloomConfiguration,
): Buffer {
  if (task.id.includes(':adaptive-xml:')) {
    return Buffer.from(adaptiveIconXml(config));
  }
  if (task.id === 'android:values') {
    return Buffer.from(valuesXml(config, false));
  }
  if (task.id === 'android:values-night') {
    return Buffer.from(valuesXml(config, true));
  }
  if (task.id === 'android:values-v31') {
    return Buffer.from(valuesV31Xml());
  }
  if (task.id === 'android:splash-drawable') {
    return Buffer.from(splashDrawableXml());
  }
  throw new LoomError({
    code: 'LOOM_PLAN_INVALID',
    message: `Unknown Android content task "${task.id}".`,
    context: { taskId: task.id },
  });
}
