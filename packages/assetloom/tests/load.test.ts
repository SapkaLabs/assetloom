import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfiguration } from '../src/config/load.js';

describe('configuration loading', () => {
  it('loads ordered native target configuration with provenance', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-config-'));
    await writeFile(
      path.join(directory, 'base.json'),
      JSON.stringify({
        schemaVersion: 1,
        project: { root: '.' },
        targets: {
          android: {
            enabled: true,
            resourceDirectory: 'android/app/src/main/res',
            manifestPath: 'android/app/src/main/AndroidManifest.xml',
          },
        },
        resources: {
          icon: {
            type: 'app-icon',
            android: { legacy: { source: 'icon.svg' } },
          },
        },
      }),
    );
    await writeFile(
      path.join(directory, 'brand.json'),
      JSON.stringify({
        resources: {
          icon: {
            android: {
              round: { source: 'round.svg' },
            },
          },
        },
      }),
    );

    const loaded = await loadConfiguration(['base.json', 'brand.json'], {
      cwd: directory,
    });
    expect(loaded.config.targets.android?.enabled).toBe(true);
    expect(
      loaded.provenance.get('/resources/icon/android/round/source')?.file,
    ).toBe(path.join(directory, 'brand.json'));
  });

  it('rejects non-native target properties', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-config-'));
    await writeFile(
      path.join(directory, 'invalid.json'),
      JSON.stringify({
        schemaVersion: 1,
        project: { root: '.' },
        targets: {
          web: { enabled: true },
        },
        resources: {
          icon: {
            type: 'app-icon',
            android: { legacy: { source: 'icon.svg' } },
          },
        },
      }),
    );
    await expect(
      loadConfiguration(['invalid.json'], { cwd: directory }),
    ).rejects.toMatchObject({ code: 'LOOM_CFG_VALIDATE' });
  });

  it('reports mutually exclusive adaptive backgrounds with file provenance', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-config-'));
    await writeFile(
      path.join(directory, 'invalid.json'),
      JSON.stringify({
        schemaVersion: 1,
        project: { root: '.' },
        targets: {
          android: {
            enabled: true,
            resourceDirectory: 'android/app/src/main/res',
            manifestPath: 'android/app/src/main/AndroidManifest.xml',
          },
        },
        resources: {
          icon: {
            type: 'app-icon',
            android: {
              adaptive: {
                foreground: { source: 'icon.svg' },
                background: {
                  color: '#172033',
                  source: 'background.svg',
                },
              },
            },
          },
        },
      }),
    );
    await expect(
      loadConfiguration(['invalid.json'], { cwd: directory }),
    ).rejects.toMatchObject({
      code: 'LOOM_CFG_VALIDATE',
      context: {
        file: path.join(directory, 'invalid.json'),
        jsonPointer: '/resources/icon/android/adaptive/background',
        reason: 'Specify either "color" or "source", but not both.',
      },
    });
  });
});
