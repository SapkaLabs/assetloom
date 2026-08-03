import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256, validateGenerationResultV1 } from '@sapkalabs/assetloom-core';
import { imageRendererCompatibilityVersion, inspectImage } from '@sapkalabs/assetloom-images';
import { assertNativeResourceName, createNativeResourceUsageV1 } from '@sapkalabs/assetloom-native';
import {
  appendWebCacheBustQuery,
  assertWebHashTokenLength,
  DEFAULT_WEB_CACHE_BUST_POLICY,
  DEFAULT_WEB_HASH_TOKEN_LENGTH,
  resolveWebPublicPath,
  webContentHashToken,
} from '@sapkalabs/assetloom-web';

const root = path.resolve(import.meta.dirname, '../../..');
const expected = [
  '@sapkalabs/assetloom',
  '@sapkalabs/assetloom-core',
  '@sapkalabs/assetloom-images',
  '@sapkalabs/assetloom-native',
  '@sapkalabs/assetloom-web',
] as const;

interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly bin?: string;
  readonly exports: Readonly<Record<string, { readonly types?: string; readonly default?: string } | string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
}

async function manifests(): Promise<Map<string, { readonly directory: string; readonly value: Manifest }>> {
  const result = new Map<string, { readonly directory: string; readonly value: Manifest }>();
  for (const entry of await readdir(path.join(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(root, 'packages', entry.name);
    try {
      const value = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')) as Manifest;
      if (value.name.startsWith('@sapkalabs/assetloom')) result.set(value.name, { directory, value });
    } catch { /* not a package */ }
  }
  return result;
}

async function sourceFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await sourceFiles(child));
    else if (entry.name.endsWith('.ts')) result.push(child);
  }
  return result;
}

describe('workspace package architecture', () => {
  it('enforces the exact acyclic manifest graph, lockstep versions, and exports', async () => {
    const packages = await manifests();
    expect([...packages.keys()].sort()).toEqual([...expected].sort());
    const allowed: Readonly<Record<string, readonly string[]>> = {
      '@sapkalabs/assetloom-core': [],
      '@sapkalabs/assetloom-images': ['@sapkalabs/assetloom-core'],
      '@sapkalabs/assetloom-native': ['@sapkalabs/assetloom-core', '@sapkalabs/assetloom-images'],
      '@sapkalabs/assetloom-web': ['@sapkalabs/assetloom-core', '@sapkalabs/assetloom-images'],
      '@sapkalabs/assetloom': [
        '@sapkalabs/assetloom-core', '@sapkalabs/assetloom-images',
        '@sapkalabs/assetloom-native', '@sapkalabs/assetloom-web',
      ],
    };
    for (const [name, item] of packages) {
      expect(item.value.version).toBe('0.2.0');
      const internal = Object.keys(item.value.dependencies ?? {})
        .filter((dependency) => dependency.startsWith('@sapkalabs/assetloom'))
        .sort();
      expect(internal).toEqual([...(allowed[name] ?? [])].sort());
      expect(item.value.exports['.']).toMatchObject({ types: './lib/index.d.ts', default: './lib/index.js' });
      expect(name === '@sapkalabs/assetloom' ? item.value.bin : undefined)
        .toBe(name === '@sapkalabs/assetloom' ? './lib/cli.js' : undefined);
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (name: string): void => {
      if (visiting.has(name)) throw new Error(`Workspace dependency cycle at ${name}`);
      if (visited.has(name)) return;
      visiting.add(name);
      for (const dependency of allowed[name] ?? []) visit(dependency);
      visiting.delete(name);
      visited.add(name);
    };
    expected.forEach(visit);
  });

  it('forbids private workspace imports and keeps CLI code in the facade', async () => {
    const packages = await manifests();
    for (const [name, item] of packages) {
      const files = await sourceFiles(path.join(item.directory, 'src'));
      const text = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
      expect(text).not.toMatch(/@sapkalabs\/assetloom-(?:core|images|native|web)\/src(?:\/|')/gu);
      if (name === '@sapkalabs/assetloom-core') {
        expect(text).not.toMatch(/\b(?:sharp|commander|android|ios|web-app|image recipe)\b/iu);
      }
      if (name !== '@sapkalabs/assetloom') {
        expect(text).not.toMatch(/\bCommander\b|new Command\(|\.command\(/gu);
      }
    }
  });

  it('executes representative APIs from every focused package', async () => {
    expect(sha256('bytes')).toMatch(/^[0-9a-f]{64}$/u);
    expect(() => validateGenerationResultV1({ resultVersion: 2 })).toThrow();
    expect(imageRendererCompatibilityVersion).toMatch(/^sharp-/u);
    const image = await inspectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"/>'));
    expect(image).toMatchObject({ format: 'svg', width: 2, height: 3 });
    expect(assertNativeResourceName('android', 'app_icon')).toBe('app_icon');
    expect(createNativeResourceUsageV1({
      targetId: 'android', artifactIds: ['b', 'a', 'a'],
      payload: { platform: 'android', role: 'icon', name: 'app_icon', relativePath: 'res/app_icon.png', manualSetup: [] },
    }).artifactIds).toEqual(['a', 'b']);
    expect(resolveWebPublicPath('/assets/', '/logo.png')).toBe('/assets/logo.png');
    expect(assertWebHashTokenLength(12)).toBe(12);
    expect(DEFAULT_WEB_CACHE_BUST_POLICY).toBe('none');
    expect(DEFAULT_WEB_HASH_TOKEN_LENGTH).toBe(12);
    const digest = sha256('web bytes');
    const token = webContentHashToken(digest);
    expect(token).toBe(digest.slice(0, 12));
    expect(appendWebCacheBustQuery('/assets/logo.png', token)).toBe(
      `/assets/logo.png?v=${token}`,
    );
    expect(appendWebCacheBustQuery('/assets/logo.png?v=old#icon', token)).toBe(
      `/assets/logo.png?v=${token}#icon`,
    );
    expect(() => assertWebHashTokenLength(7)).toThrow(RangeError);
    expect(() => assertWebHashTokenLength(65)).toThrow(RangeError);
  });

  it('keeps packed-consumer verification aligned with the public contract', async () => {
    const smoke = await readFile(
      path.join(root, 'packages/assetloom/scripts/pack-smoke.mjs'),
      'utf8',
    );
    expect(smoke).toContain("'workspace:'");
    expect(smoke).toContain('consumer.mts');
    expect(smoke).toContain("'typescript', 'bin', 'tsc'");
    expect(smoke).toContain("'--result-file'");
    expect(smoke).toContain("parsed.resultVersion === 1");
    expect(smoke).toContain("parsed.artifacts[0].disposition === 'unchanged'");
    expect(smoke).toContain("'.assetloom', 'results'");
    expect(smoke).toContain('ProjectFileGateway');
  });
});
