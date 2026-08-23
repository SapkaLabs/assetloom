import { LoomError } from '../../domain/errors.js';
import type {
  AppIconResource,
  AssetloomConfiguration,
  GenerationTask,
  SplashScreenResource,
} from '../../domain/types.js';

function json(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function appIcon(config: AssetloomConfiguration): AppIconResource | undefined {
  const resource = Object.values(config.resources).find(
    (candidate) => candidate.type === 'app-icon' && candidate.ios !== undefined,
  );
  return resource?.type === 'app-icon' ? resource : undefined;
}

function splash(
  config: AssetloomConfiguration,
): SplashScreenResource | undefined {
  const resource = Object.values(config.resources).find(
    (candidate) => candidate.type === 'splash-screen',
  );
  return resource?.type === 'splash-screen' ? resource : undefined;
}

function appIconContents(config: AssetloomConfiguration): Buffer {
  const resource = appIcon(config);
  if (resource?.ios === undefined || resource.ios.mode !== 'variants') {
    throw new LoomError({
      code: 'LOOM_IOS_ASSET_CATALOG_INVALID',
      message: 'iOS app icon contents were planned without variant sources.',
    });
  }
  const images: Array<Record<string, unknown>> = [
    {
      filename: 'AppIcon-light.png',
      idiom: 'universal',
      platform: 'ios',
      size: '1024x1024',
    },
  ];
  if (resource.ios.dark !== undefined) {
    images.push({
      appearances: [{ appearance: 'luminosity', value: 'dark' }],
      filename: 'AppIcon-dark.png',
      idiom: 'universal',
      platform: 'ios',
      size: '1024x1024',
    });
  }
  if (resource.ios.tinted !== undefined) {
    images.push({
      appearances: [{ appearance: 'luminosity', value: 'tinted' }],
      filename: 'AppIcon-tinted.png',
      idiom: 'universal',
      platform: 'ios',
      size: '1024x1024',
    });
  }
  return json({
    images,
    info: { author: 'assetloom', version: 1 },
  });
}

function splashImageContents(config: AssetloomConfiguration): Buffer {
  const resource = splash(config);
  if (resource === undefined) {
    throw new LoomError({
      code: 'LOOM_IOS_ASSET_CATALOG_INVALID',
      message: 'iOS splash contents were planned without a splash resource.',
    });
  }
  const images: Array<Record<string, unknown>> = [];
  for (const appearance of ['light', 'dark'] as const) {
    if (resource[appearance] === undefined) {
      continue;
    }
    for (const scale of [1, 2, 3]) {
      const item: Record<string, unknown> = {
        filename: `AssetloomSplash-${appearance}@${scale}x.png`,
        idiom: 'universal',
        scale: `${scale}x`,
      };
      if (appearance === 'dark') {
        item['appearances'] = [
          { appearance: 'luminosity', value: 'dark' },
        ];
      }
      images.push(item);
    }
  }
  return json({
    images,
    info: { author: 'assetloom', version: 1 },
  });
}

function component(hex: string, offset: number): string {
  return (Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).toFixed(3);
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function storyboardColor(hex: string): string {
  const value = hex.slice(1);
  return `red="${component(value, 0)}" green="${component(value, 2)}" blue="${component(value, 4)}" alpha="${value.length === 8 ? component(value, 6) : '1.000'}" colorSpace="custom" customColorSpace="sRGB"`;
}

function colorEntry(hex: string, appearance?: 'dark'): Record<string, unknown> {
  const value = hex.slice(1);
  const entry: Record<string, unknown> = {
    color: {
      'color-space': 'srgb',
      components: {
        alpha: value.length === 8 ? component(value, 6) : '1.000',
        blue: component(value, 4),
        green: component(value, 2),
        red: component(value, 0),
      },
    },
    idiom: 'universal',
  };
  if (appearance !== undefined) {
    entry['appearances'] = [
      { appearance: 'luminosity', value: appearance },
    ];
  }
  return entry;
}

function splashColorContents(config: AssetloomConfiguration): Buffer {
  const resource = splash(config);
  if (resource === undefined) {
    throw new LoomError({
      code: 'LOOM_IOS_ASSET_CATALOG_INVALID',
      message: 'iOS splash color was planned without a splash resource.',
    });
  }
  const colors = [colorEntry(resource.light.backgroundColor)];
  if (resource.dark !== undefined) {
    colors.push(colorEntry(resource.dark.backgroundColor, 'dark'));
  }
  return json({
    colors,
    info: { author: 'assetloom', version: 1 },
  });
}

function launchStoryboard(config: AssetloomConfiguration): Buffer {
  const resource = splash(config);
  if (resource === undefined) {
    throw new LoomError({
      code: 'LOOM_IOS_ASSET_CATALOG_INVALID',
      message: 'iOS launch storyboard was planned without a splash resource.',
    });
  }
  const imageWidth = resource.light.imageWidth;
  const imageHeight = resource.light.imageHeight ?? imageWidth;
  const footer =
    resource.text === undefined || resource.textColor === undefined
      ? ''
      : `
              <label opaque="NO" userInteractionEnabled="NO" contentMode="left" horizontalHuggingPriority="251" verticalHuggingPriority="251" text="${escapeXml(resource.text)}" textAlignment="center" lineBreakMode="tailTruncation" numberOfLines="0" baselineAdjustment="alignBaselines" adjustsFontSizeToFit="NO" translatesAutoresizingMaskIntoConstraints="NO" id="assetloom-footer">
                <rect key="frame" x="24" y="801" width="345" height="20" />
                <fontDescription key="fontDescription" type="system" pointSize="13" />
                <color key="textColor" ${storyboardColor(resource.textColor)} />
                <nil key="highlightedColor" />
              </label>`;
  const footerConstraints =
    resource.text === undefined || resource.textColor === undefined
      ? ''
      : `
              <constraint firstItem="assetloom-footer" firstAttribute="leading" secondItem="assetloom-safe-area" secondAttribute="leading" constant="24" id="assetloom-footer-leading" />
              <constraint firstItem="assetloom-safe-area" firstAttribute="trailing" secondItem="assetloom-footer" secondAttribute="trailing" constant="24" id="assetloom-footer-trailing" />
              <constraint firstItem="assetloom-footer" firstAttribute="bottom" secondItem="assetloom-safe-area" secondAttribute="bottom" constant="-24" id="assetloom-footer-bottom" />`;
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="23094" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="assetloom-view-controller">
  <device id="retina6_12" orientation="portrait" appearance="light" />
  <dependencies>
    <deployment identifier="iOS" />
    <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="23084" />
    <capability name="Named colors" minToolsVersion="9.0" />
    <capability name="Safe area layout guides" minToolsVersion="9.0" />
  </dependencies>
  <scenes>
    <scene sceneID="assetloom-scene">
      <objects>
        <viewController id="assetloom-view-controller" sceneMemberID="viewController">
          <view key="view" contentMode="scaleToFill" id="assetloom-root">
            <rect key="frame" x="0.0" y="0.0" width="393" height="852" />
            <autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES" />
            <subviews>
              <imageView clipsSubviews="YES" userInteractionEnabled="NO" contentMode="scaleAspectFit" image="AssetloomSplash" translatesAutoresizingMaskIntoConstraints="NO" id="assetloom-image">
                <rect key="frame" x="${(393 - imageWidth) / 2}" y="${(852 - imageHeight) / 2}" width="${imageWidth}" height="${imageHeight}" />
              </imageView>${footer}
            </subviews>
            <viewLayoutGuide key="safeArea" id="assetloom-safe-area" />
            <color key="backgroundColor" name="AssetloomSplashBackground" />
            <constraints>
              <constraint firstItem="assetloom-image" firstAttribute="centerX" secondItem="assetloom-root" secondAttribute="centerX" id="assetloom-center-x" />
              <constraint firstItem="assetloom-image" firstAttribute="centerY" secondItem="assetloom-root" secondAttribute="centerY" id="assetloom-center-y" />
              <constraint firstItem="assetloom-image" firstAttribute="width" constant="${imageWidth}" id="assetloom-image-width" />
              <constraint firstItem="assetloom-image" firstAttribute="height" constant="${imageHeight}" id="assetloom-image-height" />${footerConstraints}
            </constraints>
          </view>
        </viewController>
        <placeholder placeholderIdentifier="IBFirstResponder" id="assetloom-first-responder" userLabel="First Responder" sceneMemberID="firstResponder" />
      </objects>
      <point key="canvasLocation" x="0.0" y="0.0" />
    </scene>
  </scenes>
  <resources>
    <image name="AssetloomSplash" width="${imageWidth}" height="${imageHeight}" />
    <namedColor name="AssetloomSplashBackground">
      <color ${storyboardColor(resource.light.backgroundColor)} />
    </namedColor>
  </resources>
</document>
`);
}

export function iosTaskContent(
  task: GenerationTask,
  config: AssetloomConfiguration,
): Buffer {
  if (task.id.endsWith(':ios:contents')) {
    return appIconContents(config);
  }
  if (task.id.endsWith(':ios:image-contents')) {
    return splashImageContents(config);
  }
  if (task.id.endsWith(':ios:color-contents')) {
    return splashColorContents(config);
  }
  if (task.id.endsWith(':ios:storyboard')) {
    return launchStoryboard(config);
  }
  throw new LoomError({
    code: 'LOOM_PLAN_INVALID',
    message: `Unknown iOS content task "${task.id}".`,
    context: { taskId: task.id },
  });
}
