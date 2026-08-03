import { afterEach, describe, expect, it } from 'vitest';
import { createGenerationPlan } from '../src/planner/index.js';
import { loadConfiguration } from '../src/config/load.js';
import { createPublicationFixture } from './helpers/publication-fixture.js';
import type { WebHtmlLinkUsageV1 } from '@sapkalabs/assetloom-web';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

describe('typed native usage descriptors', () => {
  it('describes Android resource setup without a consumer project path', async () => {
    const fixture = await createPublicationFixture('assetloom-native-usage-');
    cleanups.push(() => fixture.cleanup());
    await fixture.write('icon.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32"/></svg>');
    await fixture.write('assetloom.json', JSON.stringify({
      schemaVersion: 1,
      project: { root: '.' },
      targets: { android: { enabled: true, resourceDirectory: './android/res' } },
      resources: {
        notification: { type: 'notification-icon', android: { source: './icon.svg' } },
      },
    }));
    const loaded = await loadConfiguration(['assetloom.json'], { cwd: fixture.projectRoot });
    const plan = await createGenerationPlan(loaded);
    expect(plan.tasks).not.toHaveLength(0);
    expect(plan.tasks.map((task) => task.operation)).not.toContain('update-project');
    const usage = plan.tasks.flatMap((task) => task.usage ?? []);
    expect(usage.length).toBe(plan.tasks.length);
    expect(usage.every((descriptor) => descriptor.kind === 'native.resource')).toBe(true);
    expect(JSON.parse(JSON.stringify(usage))).toEqual(usage);
    expect(JSON.stringify(usage)).not.toContain('destination');
    expect(JSON.stringify(usage)).not.toContain(fixture.projectRoot);
    expect(JSON.stringify(usage)).toContain('caller-owned');
  });
});

describe('typed web usage descriptors', () => {
  it('preserves filename and query public paths as deterministic caller data', () => {
    const descriptors: readonly WebHtmlLinkUsageV1[] = [
      {
        kind: 'web.html-link',
        version: 1,
        targetId: 'website',
        artifactIds: ['branding:web:favicon-32'],
        payload: {
          rel: 'icon',
          type: 'image/png',
          sizes: '32x32',
          href: '/assets/favicon.87bc5d74e6f1.png',
        },
      },
      {
        kind: 'web.html-link',
        version: 1,
        targetId: 'website',
        artifactIds: ['branding:web:logo'],
        payload: {
          rel: 'preload',
          type: 'image/png',
          href: '/assets/logo.png?v=87bc5d74e6f1',
        },
      },
    ];

    expect(JSON.parse(JSON.stringify(descriptors))).toEqual(descriptors);
    expect(descriptors.map((descriptor) => descriptor.payload.href)).toEqual([
      '/assets/favicon.87bc5d74e6f1.png',
      '/assets/logo.png?v=87bc5d74e6f1',
    ]);
    expect(JSON.stringify(descriptors)).not.toContain('index.html');
  });
});
