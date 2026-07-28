import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
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

function launchStoryboard(): Buffer {
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
                <rect key="frame" x="96.5" y="326" width="200" height="200" />
              </imageView>
            </subviews>
            <viewLayoutGuide key="safeArea" id="assetloom-safe-area" />
            <color key="backgroundColor" name="AssetloomSplashBackground" />
            <constraints>
              <constraint firstItem="assetloom-image" firstAttribute="centerX" secondItem="assetloom-root" secondAttribute="centerX" id="assetloom-center-x" />
              <constraint firstItem="assetloom-image" firstAttribute="centerY" secondItem="assetloom-root" secondAttribute="centerY" id="assetloom-center-y" />
            </constraints>
          </view>
        </viewController>
        <placeholder placeholderIdentifier="IBFirstResponder" id="assetloom-first-responder" userLabel="First Responder" sceneMemberID="firstResponder" />
      </objects>
      <point key="canvasLocation" x="0.0" y="0.0" />
    </scene>
  </scenes>
  <resources>
    <image name="AssetloomSplash" width="200" height="200" />
    <namedColor name="AssetloomSplashBackground">
      <color red="1" green="1" blue="1" alpha="1" colorSpace="custom" customColorSpace="sRGB" />
    </namedColor>
  </resources>
</document>
`);
}

function pbxId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24).toUpperCase();
}

function addProjectResource(
  source: string,
  projectFile: string,
  resourcePath: string,
  fileType: 'file.storyboard' | 'folder.iconcomposer.icon',
): string {
  const normalizedPath = resourcePath.split(path.sep).join('/');
  const pathValue = /^[A-Za-z0-9_./-]+$/.test(normalizedPath)
    ? normalizedPath
    : JSON.stringify(normalizedPath);
  if (source.includes(`path = ${pathValue};`)) {
    if (fileType === 'folder.iconcomposer.icon') {
      return source.replace(
        `lastKnownFileType = folder; path = ${pathValue};`,
        `lastKnownFileType = folder.iconcomposer.icon; path = ${pathValue};`,
      );
    }
    return source;
  }
  if (source.includes('PBXFileSystemSynchronizedRootGroup')) {
    return source;
  }

  const fileId = pbxId(`file:${normalizedPath}`);
  const buildId = pbxId(`build:${normalizedPath}`);
  const label = path.basename(normalizedPath);
  const requiredMarkers = [
    '/* End PBXBuildFile section */',
    '/* End PBXFileReference section */',
    '/* Begin PBXGroup section */',
    '/* Begin PBXResourcesBuildPhase section */',
  ];
  if (!requiredMarkers.every((marker) => source.includes(marker))) {
    throw new LoomError({
      code: 'LOOM_IOS_PROJECT_UPDATE_FAILED',
      message: 'Xcode project does not contain the sections required for resource integration.',
      context: { projectFile },
    });
  }

  let updated = source.replace(
    '/* End PBXBuildFile section */',
    `\t\t${buildId} /* ${label} in Resources */ = {isa = PBXBuildFile; fileRef = ${fileId} /* ${label} */; };\n/* End PBXBuildFile section */`,
  );
  updated = updated.replace(
    '/* End PBXFileReference section */',
    `\t\t${fileId} /* ${label} */ = {isa = PBXFileReference; lastKnownFileType = ${fileType}; path = ${pathValue}; sourceTree = "<group>"; };\n/* End PBXFileReference section */`,
  );
  const groupSection = updated.indexOf('/* Begin PBXGroup section */');
  const children = updated.indexOf('children = (', groupSection);
  if (children === -1) {
    throw new LoomError({
      code: 'LOOM_IOS_PROJECT_UPDATE_FAILED',
      message: 'Xcode project does not contain a mutable root group.',
      context: { projectFile },
    });
  }
  const childInsertion = children + 'children = ('.length;
  updated = `${updated.slice(0, childInsertion)}\n\t\t\t\t${fileId} /* ${label} */,${updated.slice(childInsertion)}`;

  const resourcesSection = updated.indexOf(
    '/* Begin PBXResourcesBuildPhase section */',
  );
  const resourceFiles = updated.indexOf('files = (', resourcesSection);
  if (resourceFiles === -1) {
    throw new LoomError({
      code: 'LOOM_IOS_PROJECT_UPDATE_FAILED',
      message: 'Xcode project does not contain a resources build phase.',
      context: { projectFile },
    });
  }
  const resourceInsertion = resourceFiles + 'files = ('.length;
  return `${updated.slice(0, resourceInsertion)}\n\t\t\t\t${buildId} /* ${label} in Resources */,${updated.slice(resourceInsertion)}`;
}

function updateProjectBuildSettings(
  source: string,
  appIconName: string,
): string {
  if (!source.includes('buildSettings = {')) {
    throw new LoomError({
      code: 'LOOM_IOS_PROJECT_UPDATE_FAILED',
      message: 'Xcode project does not contain build settings.',
    });
  }
  return source.replace(
    /buildSettings = \{([\s\S]*?)\n(\s*)\};/g,
    (_match, body: string, indent: string) => {
      const cleaned = body
        .replace(/\n\s*ASSETCATALOG_COMPILER_APPICON_NAME\s*=[^;]+;/g, '')
        .replace(/\n\s*INFOPLIST_KEY_UILaunchStoryboardName\s*=[^;]+;/g, '');
      return `buildSettings = {
\t\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = ${appIconName};
\t\t\t\tINFOPLIST_KEY_UILaunchStoryboardName = AssetloomLaunchScreen;${cleaned}
${indent}};`;
    },
  );
}

async function updateProject(
  task: GenerationTask,
  config: AssetloomConfiguration,
  projectRoot: string,
): Promise<Buffer> {
  try {
    let source = await readFile(task.destination, 'utf8');
    const icon = appIcon(config);
    const appIconName =
      icon?.ios?.mode === 'icon-composer'
        ? (icon.ios.name ?? 'AppIcon')
        : 'AppIcon';
    source = updateProjectBuildSettings(source, appIconName);

    const iosTarget = config.targets.ios;
    if (iosTarget !== undefined && splash(config) !== undefined) {
      const storyboard = path.resolve(
        projectRoot,
        iosTarget.projectDirectory,
        'AssetloomLaunchScreen.storyboard',
      );
      const relative = path.relative(
        path.dirname(path.dirname(task.destination)),
        storyboard,
      );
      source = addProjectResource(
        source,
        task.destination,
        relative,
        'file.storyboard',
      );
    }
    if (
      iosTarget !== undefined &&
      icon?.ios?.mode === 'icon-composer'
    ) {
      const composerDirectory = path.resolve(
        projectRoot,
        iosTarget.projectDirectory,
        `${icon.ios.name ?? 'AppIcon'}.icon`,
      );
      const relative = path.relative(
        path.dirname(path.dirname(task.destination)),
        composerDirectory,
      );
      source = addProjectResource(
        source,
        task.destination,
        relative,
        'folder.iconcomposer.icon',
      );
    }
    return Buffer.from(source.endsWith('\n') ? source : `${source}\n`);
  } catch (cause) {
    if (cause instanceof LoomError) {
      throw cause;
    }
    throw new LoomError({
      code: 'LOOM_IOS_PROJECT_UPDATE_FAILED',
      message: 'Failed to update the iOS Xcode project.',
      cause,
      context: { projectFile: task.destination },
    });
  }
}

export async function iosTaskContent(
  task: GenerationTask,
  config: AssetloomConfiguration,
  projectRoot: string,
): Promise<Buffer> {
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
    return launchStoryboard();
  }
  if (task.id === 'ios:project') {
    return updateProject(task, config, projectRoot);
  }
  throw new LoomError({
    code: 'LOOM_PLAN_INVALID',
    message: `Unknown iOS content task "${task.id}".`,
    context: { taskId: task.id },
  });
}
