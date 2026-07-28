import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clean, generate } from '../src/api/generate.js';
import { loadConfiguration } from '../src/config/load.js';
import { verify } from '../src/verification/index.js';

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <rect width="108" height="108" fill="#172033"/>
  <circle cx="54" cy="54" r="30" fill="#ffffff"/>
</svg>`;

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-generate-'));
  await mkdir(path.join(directory, 'android/app/src/main/res/values'), {
    recursive: true,
  });
  await writeFile(path.join(directory, 'icon.svg'), iconSvg);
  await writeFile(path.join(directory, 'splash.svg'), iconSvg);
  await writeFile(
    path.join(directory, 'android/app/src/main/res/values/styles.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources><style name="AppTheme" parent="android:style/Theme.Material.Light.NoActionBar" /></resources>
`,
  );
  await writeFile(
    path.join(directory, 'android/app/src/main/AndroidManifest.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:label="Fixture"></application>
</manifest>
`,
  );
  await writeFile(
    path.join(directory, 'assetloom.json'),
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
        appIcon: {
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
        notification: {
          type: 'notification-icon',
          android: { source: './icon.svg', color: '#172033' },
        },
        splash: {
          type: 'splash-screen',
          light: {
            image: './splash.svg',
            backgroundColor: '#FFFFFF',
            imageWidth: 100,
          },
          dark: {
            image: './splash.svg',
            backgroundColor: '#000000',
            imageWidth: 100,
          },
        },
      },
    }),
  );
  return {
    directory,
    loaded: await loadConfiguration(['assetloom.json'], { cwd: directory }),
  };
}

describe('generation lifecycle', () => {
  it('writes once, verifies, and performs a no-op second run', async () => {
    const { loaded } = await fixture();
    const first = await generate(loaded);
    expect(first.written.length).toBeGreaterThan(20);

    const second = await generate(loaded);
    expect(second.written).toEqual([]);
    expect(second.removed).toEqual([]);
    expect(second.unchanged.length).toBe(first.plan.tasks.length);

    const result = await verify(loaded);
    expect(result.ok).toBe(true);
  });

  it('refuses to clean an output modified by another tool', async () => {
    const { directory, loaded } = await fixture();
    await generate(loaded);
    const generated = path.join(
      directory,
      'android/app/src/main/res/mipmap-mdpi/ic_launcher.png',
    );
    const original = await readFile(generated);
    await writeFile(generated, Buffer.concat([original, Buffer.from('changed')]));
    await expect(clean(loaded)).rejects.toMatchObject({
      code: 'LOOM_CLEAN_UNOWNED_FILE',
    });
  });

  it('refuses to overwrite an owned output modified by another tool', async () => {
    const { directory, loaded } = await fixture();
    await generate(loaded);
    const generated = path.join(
      directory,
      'android/app/src/main/res/mipmap-mdpi/ic_launcher.png',
    );
    await writeFile(generated, Buffer.from('not an Assetloom image'));
    await expect(generate(loaded)).rejects.toMatchObject({
      code: 'LOOM_WRITE_CONFLICT',
    });
  });

  it('reproduces identical owned bytes after a clean regeneration', async () => {
    const { directory, loaded } = await fixture();
    await generate(loaded);
    const before = JSON.parse(
      await readFile(
        path.join(directory, '.assetloom', 'manifest.json'),
        'utf8',
      ),
    ) as { files: Record<string, { sha256: string }> };
    await clean(loaded);
    await generate(loaded);
    const after = JSON.parse(
      await readFile(
        path.join(directory, '.assetloom', 'manifest.json'),
        'utf8',
      ),
    ) as { files: Record<string, { sha256: string }> };
    expect(
      Object.fromEntries(
        Object.entries(after.files).map(([filename, value]) => [
          filename,
          value.sha256,
        ]),
      ),
    ).toEqual(
      Object.fromEntries(
        Object.entries(before.files).map(([filename, value]) => [
          filename,
          value.sha256,
        ]),
      ),
    );
  });
});
