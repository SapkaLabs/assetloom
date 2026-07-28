import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { generate, loadConfiguration } from '../lib/index.js';

const root = mkdtempSync(path.join(tmpdir(), 'assetloom-benchmark-'));

try {
  mkdirSync(path.join(root, 'android/app/src/main/res/values'), {
    recursive: true,
  });
  writeFileSync(
    path.join(root, 'icon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
      <rect width="108" height="108" fill="#172033"/>
      <circle cx="54" cy="54" r="28" fill="#69e0ba"/>
    </svg>`,
  );
  writeFileSync(
    path.join(root, 'android/app/src/main/AndroidManifest.xml'),
    `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:theme="@style/AppTheme"/>
    </manifest>`,
  );
  writeFileSync(
    path.join(root, 'android/app/src/main/res/values/styles.xml'),
    '<resources><style name="AppTheme" parent="android:style/Theme.Material.Light.NoActionBar"/></resources>',
  );
  writeFileSync(
    path.join(root, 'assetloom.json'),
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
        icon: {
          type: 'app-icon',
          android: {
            legacy: { source: './icon.svg' },
            adaptive: {
              foreground: { source: './icon.svg' },
              background: { color: '#172033' },
              monochrome: { source: './icon.svg' },
            },
          },
        },
      },
    }),
  );

  const loaded = await loadConfiguration(['assetloom.json'], { cwd: root });
  const coldStart = performance.now();
  const cold = await generate(loaded);
  const coldMilliseconds = performance.now() - coldStart;
  const warmStart = performance.now();
  const warm = await generate(loaded);
  const warmMilliseconds = performance.now() - warmStart;
  if (warm.written.length !== 0) {
    throw new Error('Benchmark warm run unexpectedly wrote output files.');
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        tasks: cold.plan.tasks.length,
        coldMilliseconds: Number(coldMilliseconds.toFixed(2)),
        warmMilliseconds: Number(warmMilliseconds.toFixed(2)),
        coldWrites: cold.written.length,
        warmWrites: warm.written.length,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  rmSync(root, { force: true, recursive: true });
}
