import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(import.meta.dirname, '..');

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(packageRoot, relativePath), 'utf8');
}

describe('publish-and-describe foundation architecture', () => {
  it('contains no callable consumer-project mutation capability', async () => {
    const walk = async (directory: string): Promise<string[]> => {
      const result: string[] = [];
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const child = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...await walk(child));
        else if (/\.(?:ts|json)$/u.test(entry.name)) result.push(child);
      }
      return result;
    };
    const currentSurface = (
      await Promise.all([
        ...await walk(path.join(packageRoot, 'src')),
        path.join(packageRoot, 'schema/config.schema.json'),
        path.join(packageRoot, 'package.json'),
      ].map((filename) => readFile(filename, 'utf8')))
    ).join('\n');
    expect(currentSurface).not.toMatch(
      /integrate-project|update-project|ProjectIntegration|IntegrationReceipt|ProjectFileGateway|GitIgnoreManager|html-head-adapter|web-manifest-adapter|static-web-app-config-adapter/gu,
    );
  });

  it('keeps portable result and bounded publication contracts free of mutation ports', async () => {
    const foundation = (
      await Promise.all(
        [
          'src/domain/generation-result.ts',
          'src/application/planning/output-root-registry.ts',
          'src/application/execution/generation-result-builder.ts',
          'src/storage/owned-output-lifecycle.ts',
        ].map(source),
      )
    ).join('\n');

    expect(foundation).not.toMatch(
      /project-integration|project-file-gateway|gitignore-manager|html-head-adapter|web-manifest-adapter|static-web-app-config-adapter/iu,
    );
    expect(foundation).not.toMatch(/\b(?:sharp|commander)\b/iu);
    expect(foundation).not.toMatch(
      /PatchFile|MergeFile|AppendHtml|UpdateManifest|UpdatePlist|RegisterXcodeResource|IntegrateProjectArtifact/gu,
    );
  });

  it('keeps the versioned public result free of absolute path fields and time identity', async () => {
    const contract = await readFile(
      path.resolve(packageRoot, '../assetloom-core/src/index.ts'),
      'utf8',
    );
    expect(contract).not.toMatch(/absolutePath|projectRoot|timestamp|createdAt|updatedAt/gu);
    expect(contract).toContain("readonly resultVersion: 1");
    expect(contract).toContain("readonly algorithm: 'sha256'");
  });
});
