import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGenerationResultV1 } from '@sapkalabs/assetloom';

const applicationRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

async function text(relativePath) {
  return readFile(path.join(applicationRoot, relativePath), 'utf8');
}

function requireText(value, expected, owner) {
  if (!value.includes(expected)) {
    throw new Error(`${owner} must contain ${JSON.stringify(expected)}.`);
  }
}

const result = validateGenerationResultV1(
  JSON.parse(await text('.assetloom/results/react-native-demo.json')),
);

if (result.targets.join(',') !== 'android,ios') {
  throw new Error(
    `The React Native demo expects android and ios targets; received ${result.targets.join(', ') || 'none'}.`,
  );
}

const nativeUsage = result.usage.filter(
  (descriptor) => descriptor.kind === 'native.resource',
);
if (nativeUsage.length !== result.usage.length || nativeUsage.length === 0) {
  throw new Error('The React Native demo expects only typed native.resource usage descriptors.');
}

const descriptorPaths = nativeUsage.map((descriptor) => {
  const relativePath = descriptor.payload['relativePath'];
  if (typeof relativePath !== 'string') {
    throw new Error(`Descriptor ${descriptor.kind} has no portable relative path.`);
  }
  if (
    descriptor.targetId === 'android'
      ? !relativePath.startsWith('android/')
      : descriptor.targetId === 'ios'
        ? !relativePath.startsWith('ios/')
        : true
  ) {
    throw new Error(
      `Descriptor path ${relativePath} does not belong to target ${descriptor.targetId}.`,
    );
  }
  return relativePath;
});

for (const expected of [
  'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
  'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',
  'ios/AssetloomDemo/Images.xcassets/AppIcon.appiconset/Contents.json',
  'ios/AssetloomDemo/AssetloomLaunchScreen.storyboard',
]) {
  if (!descriptorPaths.includes(expected)) {
    throw new Error(`Generation result is missing required demo descriptor ${expected}.`);
  }
}

// These checks are deliberately caller-owned. AssetLoom returns descriptors;
// this application decides how its committed native projects consume them.
const androidManifest = await text('android/app/src/main/AndroidManifest.xml');
requireText(androidManifest, 'android:icon="@mipmap/ic_launcher"', 'AndroidManifest.xml');
requireText(
  androidManifest,
  'android:roundIcon="@mipmap/ic_launcher_round"',
  'AndroidManifest.xml',
);
requireText(androidManifest, 'android:theme="@style/AssetloomTheme"', 'AndroidManifest.xml');

const xcodeProject = await text('ios/AssetloomDemo.xcodeproj/project.pbxproj');
requireText(xcodeProject, 'Images.xcassets in Resources', 'project.pbxproj');
requireText(
  xcodeProject,
  'AssetloomLaunchScreen.storyboard in Resources',
  'project.pbxproj',
);
requireText(
  xcodeProject,
  'ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;',
  'project.pbxproj',
);

const informationPropertyList = await text('ios/AssetloomDemo/Info.plist');
requireText(
  informationPropertyList,
  '<string>AssetloomLaunchScreen</string>',
  'Info.plist',
);

process.stdout.write(
  `Consumed AssetLoom result v${result.resultVersion}: ${result.artifacts.length} artifacts and ${nativeUsage.length} native usage descriptors for ${result.targets.join(', ')}.\n`,
);
