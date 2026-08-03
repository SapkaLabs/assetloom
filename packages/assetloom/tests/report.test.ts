import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { generate } from '../src/api/generate.js';
import { createHtmlReport } from '../src/api/report.js';
import { loadConfiguration } from '../src/config/load.js';
import { sha256 } from '../src/storage/hash.js';

const artwork = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <rect width="108" height="108" rx="22" fill="#172033"/>
  <path d="M28 54h52M54 28v52" stroke="#69E0BA" stroke-width="12"/>
</svg>`;

async function reportFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-report-'));
  await mkdir(path.join(directory, 'android/app/src/main/res/values'), {
    recursive: true,
  });
  await writeFile(path.join(directory, 'icon.svg'), artwork);
  await writeFile(path.join(directory, 'splash.svg'), artwork);
  await writeFile(
    path.join(directory, 'android/app/src/main/res/values/styles.xml'),
    '<resources><style name="AppTheme" parent="android:style/Theme.Material.Light.NoActionBar" /></resources>',
  );
  await writeFile(
    path.join(directory, 'android/app/src/main/AndroidManifest.xml'),
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application /></manifest>',
  );
  await writeFile(
    path.join(directory, 'base.assetloom.json'),
    JSON.stringify({
      schemaVersion: 1,
      metadata: {
        name: 'Acme Customer',
        description: 'Production white-label artwork',
      },
      project: { root: '.' },
      targets: {
        android: {
          enabled: true,
          resourceDirectory: './android/app/src/main/res',
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
        notificationIcon: {
          type: 'notification-icon',
          android: { source: './icon.svg', color: '#69E0BA' },
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
    loaded: await loadConfiguration(['base.assetloom.json'], {
      cwd: directory,
    }),
  };
}

describe('HTML asset report', () => {
  it('embeds configured inputs and verified outputs in a deterministic file', async () => {
    const { loaded } = await reportFixture();
    await generate(loaded);

    const first = await createHtmlReport(loaded);
    expect(first.healthy).toBe(true);
    expect(first.written).toBe(true);
    expect(first.configurationName).toBe('Acme Customer');
    expect(first.sources).toBe(2);
    expect(first.outputs).toBeGreaterThan(20);
    expect(
      first.path.endsWith(
        path.join('.assetloom', 'reports', 'acme-customer.html'),
      ),
    ).toBe(true);

    const html = await readFile(first.path, 'utf8');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Production white-label artwork');
    expect(html).toContain('data:image/svg+xml;base64,');
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('Platform contexts');
    expect(html).toContain('Android system notification');
    expect(html).toContain('android-notification-card');
    expect(html).toContain('Native assets are ready');
    expect(html).toContain('Launch-screen contexts');
    expect(html).toContain('Generated file browser');
    expect(html).toContain('role="tree"');
    expect(html).toContain('Preview &amp; details');
    expect(html).toContain('data-file-open="generated-file-');
    expect(html).toContain('data-file-panel="generated-file-');
    expect(html).toContain('5 files · 48–192 px');
    expect(html).toContain(
      'android/app/src/main/res/mipmap-mdpi/ic_launcher.png',
    );
    expect(html).toContain(
      'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png',
    );
    expect(html).not.toContain('class="asset-card output-card"');
    expect(html).toContain('View effective merged configuration');
    expect(html).toContain('All outputs verified');

    const second = await createHtmlReport(loaded);
    expect(second.written).toBe(false);
    expect(await readFile(second.path)).toEqual(await readFile(first.path));
  });

  it('preserves the report and flags an output modified after generation', async () => {
    const { directory, loaded } = await reportFixture();
    await generate(loaded);
    const generated = path.join(
      directory,
      'android/app/src/main/res/mipmap-mdpi/ic_launcher.png',
    );
    await writeFile(generated, Buffer.from('externally modified'));

    const result = await createHtmlReport(loaded);
    expect(result.healthy).toBe(false);
    expect(result.issues).toBe(1);
    expect(await readFile(result.path, 'utf8')).toContain('Modified');
  });

  it('shows actual image dimensions and flags invalid manifest-owned output', async () => {
    const { directory, loaded } = await reportFixture();
    await generate(loaded);
    const relative =
      'android/app/src/main/res/mipmap-mdpi/ic_launcher.png';
    const generated = path.join(directory, relative);
    const invalidDimensions = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 4,
        background: '#172033',
      },
    })
      .png()
      .toBuffer();
    await writeFile(generated, invalidDimensions);
    const manifestPath = path.join(directory, '.assetloom', 'manifest.json');
    const manifest = JSON.parse(
      await readFile(manifestPath, 'utf8'),
    ) as {
      files: Record<string, { sha256: string }>;
    };
    const entry = manifest.files[relative];
    if (entry === undefined) {
      throw new Error('Expected generated fixture output in the manifest.');
    }
    entry.sha256 = sha256(invalidDimensions);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = await createHtmlReport(loaded);
    const html = await readFile(result.path, 'utf8');
    expect(result.healthy).toBe(false);
    expect(result.issues).toBe(1);
    expect(html).toContain('Invalid');
    expect(html).toContain('32×32');
    expect(html).toContain(
      '<dt>Expected dimensions</dt><dd>48×48</dd>',
    );
  });

  it('uses merged configuration metadata to keep customer reports separate', async () => {
    const { directory } = await reportFixture();
    await writeFile(
      path.join(directory, 'second-customer.assetloom.json'),
      JSON.stringify({
        metadata: {
          name: 'Beta & Sons',
          description: 'Customer-specific override',
        },
      }),
    );
    const acme = await loadConfiguration(['base.assetloom.json'], {
      cwd: directory,
    });
    const beta = await loadConfiguration(
      ['base.assetloom.json', 'second-customer.assetloom.json'],
      { cwd: directory },
    );
    await generate(acme);
    const acmeReport = await createHtmlReport(acme);
    await generate(beta);
    const betaReport = await createHtmlReport(beta);

    expect(acmeReport.path).not.toBe(betaReport.path);
    expect(
      betaReport.path.endsWith(
        path.join('.assetloom', 'reports', 'beta-sons.html'),
      ),
    ).toBe(true);
    expect(await readFile(acmeReport.path, 'utf8')).toContain('Acme Customer');
    expect(await readFile(betaReport.path, 'utf8')).toContain(
      'Beta &amp; Sons',
    );
  });
});
