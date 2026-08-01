import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanV2 } from '../src/api/clean-v2.js';
import { defaultCatalogReportOutputPath } from '../src/api/report-v2.js';
import { CatalogExecutor } from '../src/application/execution/catalog-executor.js';
import { CatalogMaterializerRegistry } from '../src/application/execution/catalog-materializer-registry.js';
import type {
  CatalogArtifactForOperation,
  CatalogArtifactMaterializer,
  CatalogMaterializationContext,
  IntegrationArtifactForAdapter,
  ProjectIntegrationAdapter,
  StoredIntegrationReceipt,
} from '../src/application/execution/contracts.js';
import { DefaultProjectIntegrationAdapterRegistry } from '../src/application/execution/project-integration-adapter-registry.js';
import { ProjectIntegrationLifecycle } from '../src/application/execution/project-integration-lifecycle.js';
import { assertNoRetainedPublicationOwnershipCollisions } from '../src/application/execution/retained-publication-ownership.js';
import { renderCatalogReport } from '../src/application/reporting/catalog-report-document.js';
import { createCatalogReportModel } from '../src/application/reporting/catalog-report-model.js';
import type {
  IntegrateProjectArtifact,
  WriteTextArtifact,
} from '../src/domain/catalog/planning.js';
import { targetId } from '../src/domain/catalog/targets.js';
import { LoomError } from '../src/domain/errors.js';
import type { LoadedVersionedConfiguration } from '../src/domain/types.js';
import { FileSystemCatalogPublicationResolver } from '../src/storage/catalog-publication-resolver.js';
import { sha256 } from '../src/storage/hash.js';
import { ManifestStore } from '../src/storage/manifest.js';
import {
  IntegrationReceiptStore,
  integrationReceiptId,
} from '../src/storage/integration-receipt-store.js';
import { OwnedOutputLifecycle } from '../src/storage/owned-output-lifecycle.js';
import { FileSystemProjectFileGateway } from '../src/storage/project-file-gateway.js';

const fixtures: string[] = [];

async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-execution-'));
  fixtures.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

const cache = {
  get: () => Promise.resolve(undefined),
  getAlias: () => Promise.resolve(undefined),
  put: (value: Uint8Array) => Promise.resolve(sha256(value)),
  putAlias: () => Promise.resolve(),
};

class TextMaterializer
  implements
    CatalogArtifactMaterializer<CatalogArtifactForOperation<'write-text'>>
{
  readonly operation = 'write-text' as const;

  materialize(
    artifact: CatalogArtifactForOperation<'write-text'>,
    context: CatalogMaterializationContext,
  ): Promise<{ readonly content: Uint8Array }> {
    const value =
      typeof artifact.content === 'string'
        ? artifact.content
        : context.outputs.resolve(artifact.content);
    return Promise.resolve({
      content:
        value instanceof Uint8Array
          ? value
          : Buffer.from(String(value), artifact.encoding),
    });
  }
}

class MarkerHtmlAdapter
  implements
    ProjectIntegrationAdapter<IntegrationArtifactForAdapter<'html-head'>>
{
  readonly adapter = 'html-head' as const;

  prepare(): Promise<{ readonly content: Uint8Array; readonly state: null }> {
    return Promise.resolve({ content: Buffer.from('<head></head>'), state: null });
  }

  remove(
    _receipt: StoredIntegrationReceipt,
    current: Uint8Array | undefined,
  ): Promise<Uint8Array | undefined> {
    return Promise.resolve(
      current === undefined
        ? undefined
        : Buffer.from(Buffer.from(current).toString().replace('<!-- managed -->', '')),
    );
  }

  verify(): Promise<void> {
    return Promise.resolve();
  }
}

function writeArtifact(options: {
  readonly content: WriteTextArtifact['content'];
  readonly dependsOn?: readonly string[];
  readonly destination: string;
  readonly id: string;
  readonly publication?: WriteTextArtifact['publication'];
}): WriteTextArtifact {
  return {
    id: options.id,
    resourceId: 'documents',
    resourceType: 'files',
    target: targetId('dashboard'),
    operation: 'write-text',
    ownership: 'generated',
    publication: options.publication ?? { mode: 'stable' },
    dependsOn: options.dependsOn ?? [],
    sourceDependencies: [],
    destination: options.destination,
    presetVersion: 'test-v1',
    content: options.content,
    encoding: 'utf8',
  };
}

function htmlIntegrationArtifact(options: {
  readonly destination: string;
  readonly id: string;
  readonly stateKey: string;
  readonly target: string;
}): IntegrateProjectArtifact {
  return {
    id: options.id,
    resourceId: 'branding',
    resourceType: 'web-app-branding',
    target: targetId(options.target),
    operation: 'integrate-project',
    ownership: 'project-integration',
    dependsOn: [],
    sourceDependencies: [],
    destination: options.destination,
    presetVersion: 'test-v1',
    integration: {
      adapter: 'html-head',
      stateKey: options.stateKey,
      elements: [],
    },
  };
}

function expectPlanCollision(
  operation: () => void,
  expectedContext: Readonly<Record<string, unknown>>,
): void {
  let failure: unknown;
  try {
    operation();
  } catch (cause) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(LoomError);
  if (!(failure instanceof LoomError)) {
    throw new Error('Expected a LoomError plan collision.');
  }
  expect(failure.code).toBe('LOOM_PLAN_COLLISION');
  expect(failure.context).toMatchObject(expectedContext);
}

describe('catalog execution', () => {
  it('orders dependencies and resolves content-hashed and fallback publications', async () => {
    const projectRoot = await fixture();
    const files = new FileSystemProjectFileGateway(projectRoot);
    const integrations = await new ProjectIntegrationLifecycle(
      projectRoot,
      new DefaultProjectIntegrationAdapterRegistry({}),
      files,
    ).open([], [], ['dashboard']);
    const producer = writeArtifact({
      id: 'producer',
      destination: path.join(projectRoot, 'logical.txt'),
      content: 'hello',
      publication: {
        mode: 'content-hash',
        directory: path.join(projectRoot, 'dist'),
        logicalName: 'asset',
        extension: 'txt',
        hashLength: 8,
        fallbackDestination: path.join(projectRoot, 'dist/latest.txt'),
        publicPath: {
          publicDirectory: path.join(projectRoot, 'dist'),
          publicBasePath: '/assets',
        },
      },
    });
    const consumer = writeArtifact({
      id: 'consumer',
      destination: path.join(projectRoot, 'digest.txt'),
      dependsOn: ['producer'],
      content: {
        kind: 'artifact-output',
        artifactId: 'producer',
        value: 'sha256',
      },
    });
    const prepared = await new CatalogExecutor({
      cache,
      integrations,
      materializers: new CatalogMaterializerRegistry({
        'write-text': new TextMaterializer(),
      }),
      normalizedConfiguration: '{}',
      projectRoot,
      publications: new FileSystemCatalogPublicationResolver(),
    }).prepare([consumer, producer]);

    const digest = sha256(Buffer.from('hello'));
    expect(prepared.outputs.get('producer')).toMatchObject({
      destination: path.join(projectRoot, 'dist', `asset.${digest.slice(0, 8)}.txt`),
      publicPath: `/assets/asset.${digest.slice(0, 8)}.txt`,
      sha256: digest,
    });
    expect(Buffer.from(prepared.outputs.get('consumer').content).toString()).toBe(
      digest,
    );
    expect(prepared.ownedOutputs.map((output) => output.destination)).toContain(
      path.join(projectRoot, 'dist/latest.txt'),
    );
  });

  it('rejects cycles before materialization', async () => {
    const projectRoot = await fixture();
    const files = new FileSystemProjectFileGateway(projectRoot);
    const integrations = await new ProjectIntegrationLifecycle(
      projectRoot,
      new DefaultProjectIntegrationAdapterRegistry({}),
      files,
    ).open([], [], ['dashboard']);
    const first = writeArtifact({
      id: 'first',
      destination: path.join(projectRoot, 'first.txt'),
      dependsOn: ['second'],
      content: 'first',
    });
    const second = writeArtifact({
      id: 'second',
      destination: path.join(projectRoot, 'second.txt'),
      dependsOn: ['first'],
      content: 'second',
    });
    await expect(
      new CatalogExecutor({
        cache,
        integrations,
        materializers: new CatalogMaterializerRegistry({
          'write-text': new TextMaterializer(),
        }),
        normalizedConfiguration: '{}',
        projectRoot,
        publications: new FileSystemCatalogPublicationResolver(),
      }).prepare([first, second]),
    ).rejects.toMatchObject({ code: 'LOOM_PLAN_INVALID' });
  });
});

describe('catalog-owned state', () => {
  it('preserves legacy manifest insertion-order bytes for all-target and filtered saves', async () => {
    const projectRoot = await fixture();
    const stateDirectory = path.join(projectRoot, '.assetloom');
    const store = new ManifestStore(projectRoot, stateDirectory);
    const allTargets = {
      version: 1 as const,
      files: {
        'ios/Zeta.imageset/image.png': {
          sha256: 'a'.repeat(64),
          taskId: 'ios-zeta',
          target: 'ios',
        },
        'android/res/drawable/alpha.png': {
          sha256: 'b'.repeat(64),
          taskId: 'android-alpha',
          target: 'android',
        },
      },
    };
    await store.save(allTargets);
    expect(await readFile(store.filename, 'utf8')).toBe(
      `${JSON.stringify(allTargets, null, 2)}\n`,
    );

    const filteredAndroid = {
      version: 1 as const,
      files: {
        'ios/Zeta.imageset/image.png': allTargets.files['ios/Zeta.imageset/image.png'],
        'android/res/drawable/beta.png': {
          sha256: 'c'.repeat(64),
          taskId: 'android-beta',
          target: 'android',
        },
      },
    };
    await store.save(filteredAndroid);
    expect(await readFile(store.filename, 'utf8')).toBe(
      `${JSON.stringify(filteredAndroid, null, 2)}\n`,
    );
  });

  it('loads mixed native and named target manifest entries without narrowing casts', async () => {
    const projectRoot = await fixture();
    const stateDirectory = path.join(projectRoot, '.assetloom');
    await mkdir(stateDirectory, { recursive: true });
    await writeFile(
      path.join(stateDirectory, 'manifest.json'),
      `${JSON.stringify({
        version: 1,
        files: {
          'android/icon.png': {
            sha256: 'a'.repeat(64),
            taskId: 'native',
            target: 'android',
          },
          'web/font.woff2': {
            sha256: 'b'.repeat(64),
            taskId: 'catalog',
            target: 'dashboard',
          },
        },
      })}\n`,
    );
    const manifest = await new ManifestStore(projectRoot, stateDirectory).load();
    expect(Object.values(manifest.files).map((entry) => entry.target)).toEqual([
      'android',
      'dashboard',
    ]);
  });

  it('rejects manifest paths that escape the project root', async () => {
    const projectRoot = await fixture();
    const stateDirectory = path.join(projectRoot, '.assetloom');
    await mkdir(stateDirectory, { recursive: true });
    await writeFile(
      path.join(stateDirectory, 'manifest.json'),
      `${JSON.stringify({
        version: 1,
        files: {
          '../outside.txt': {
            sha256: 'a'.repeat(64),
            taskId: 'malicious',
            target: 'dashboard',
          },
        },
      })}\n`,
    );
    await expect(
      new ManifestStore(projectRoot, stateDirectory).load(),
    ).rejects.toMatchObject({ code: 'LOOM_MANIFEST_INVALID' });
  });

  it('cleans a removed target while preserving native outputs', async () => {
    const projectRoot = await fixture();
    const stateDirectory = path.join(projectRoot, '.assetloom');
    const nativeFile = path.join(projectRoot, 'android/icon.png');
    const removedTargetFile = path.join(projectRoot, 'web/font.woff2');
    await mkdir(path.dirname(nativeFile), { recursive: true });
    await mkdir(path.dirname(removedTargetFile), { recursive: true });
    await writeFile(nativeFile, 'native');
    await writeFile(removedTargetFile, 'catalog');
    await new ManifestStore(projectRoot, stateDirectory).save({
      version: 1,
      files: {
        'android/icon.png': {
          sha256: sha256(Buffer.from('native')),
          taskId: 'native',
          target: 'android',
        },
        'web/font.woff2': {
          sha256: sha256(Buffer.from('catalog')),
          taskId: 'catalog',
          target: 'removed_dashboard',
        },
      },
    });
    const loaded: LoadedVersionedConfiguration = {
      config: {
        schemaVersion: 2,
        project: { root: '.' },
        targets: {},
        resources: {},
      },
      files: [],
      projectRoot,
      provenance: new Map(),
    };
    const result = await cleanV2(loaded, {
      integrationAdapters: new DefaultProjectIntegrationAdapterRegistry({}),
      target: 'removed_dashboard',
    });

    expect(result.removed).toEqual([removedTargetFile]);
    expect(await readFile(nativeFile, 'utf8')).toBe('native');
    await expect(readFile(removedTargetFile)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(
      await new ManifestStore(projectRoot, stateDirectory).load(),
    ).toMatchObject({
      files: { 'android/icon.png': { target: 'android' } },
    });
  });

  it('refuses to remove stale outputs modified after generation', async () => {
    const projectRoot = await fixture();
    const destination = path.join(projectRoot, 'generated/output.txt');
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, 'modified');
    await expect(
      new OwnedOutputLifecycle(projectRoot).prepare(
        [],
        {
          version: 1,
          files: {
            'generated/output.txt': {
              sha256: sha256(Buffer.from('original')),
              taskId: 'old',
              target: 'dashboard',
            },
          },
        },
        ['dashboard'],
      ),
    ).rejects.toMatchObject({ code: 'LOOM_CLEAN_UNOWNED_FILE' });
  });

  it('detects an external output change between preflight and publish', async () => {
    const projectRoot = await fixture();
    const destination = path.join(projectRoot, 'generated/output.txt');
    const lifecycle = new OwnedOutputLifecycle(projectRoot);
    const prepared = await lifecycle.prepare(
      [
        {
          artifactId: 'output',
          content: Buffer.from('generated'),
          destination,
          target: 'dashboard',
        },
      ],
      { version: 1, files: {} },
      ['dashboard'],
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, 'external');

    await expect(lifecycle.publish(prepared)).rejects.toMatchObject({
      code: 'LOOM_WRITE_CONFLICT',
    });
  });

  it('preserves retained output ownership after filtered cross-target generation fails, then cleans the owner', async () => {
    const projectRoot = await fixture();
    const destination = path.join(projectRoot, 'generated/output.txt');
    const lifecycle = new OwnedOutputLifecycle(projectRoot);
    const generatedForA = await lifecycle.prepare(
      [
        {
          artifactId: 'target-a-output',
          content: Buffer.from('target-a'),
          destination,
          target: 'target_a',
        },
      ],
      { version: 1, files: {} },
      ['target_a'],
    );
    await lifecycle.publish(generatedForA);

    await expect(
      lifecycle.prepare(
        [
          {
            artifactId: 'target-b-output',
            content: Buffer.from('target-b'),
            destination,
            target: 'target_b',
          },
        ],
        generatedForA.manifest,
        ['target_b'],
      ),
    ).rejects.toMatchObject({
      code: 'LOOM_PLAN_COLLISION',
      context: { retainedTarget: 'target_a', target: 'target_b' },
    });
    expect(await readFile(destination, 'utf8')).toBe('target-a');
    expect(generatedForA.manifest.files['generated/output.txt']?.target).toBe(
      'target_a',
    );

    const cleanA = await lifecycle.prepare([], generatedForA.manifest, ['target_a']);
    await lifecycle.publish(cleanA);
    expect(cleanA.manifest.files).toEqual({});
    await expect(readFile(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects case-only selected output collisions with retained target ownership', async () => {
    const projectRoot = await fixture();
    const lifecycle = new OwnedOutputLifecycle(projectRoot);
    await expect(
      lifecycle.prepare(
        [
          {
            artifactId: 'target-b-output',
            content: Buffer.from('target-b'),
            destination: path.join(projectRoot, 'generated/output.txt'),
            target: 'target_b',
          },
        ],
        {
          version: 1,
          files: {
            'Generated/Output.txt': {
              sha256: sha256(Buffer.from('target-a')),
              taskId: 'target-a-output',
              target: 'target_a',
            },
          },
        },
        ['target_b'],
      ),
    ).rejects.toMatchObject({
      code: 'LOOM_PLAN_COLLISION',
      context: {
        retainedDestination: 'Generated/Output.txt',
        retainedTarget: 'target_a',
      },
    });
  });

  it('preserves retained integration ownership after filtered cross-target generation fails, then cleans the owner', async () => {
    const projectRoot = await fixture();
    const destination = path.join(projectRoot, 'dashboard/index.html');
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, '<head><!-- managed --></head>');
    const receipt: StoredIntegrationReceipt = {
      adapter: 'html-head',
      artifactId: 'target-a-head',
      destination: 'dashboard/index.html',
      stateKey: 'branding',
      target: 'target_a',
      state: null,
    };
    const lifecycle = new ProjectIntegrationLifecycle(
      projectRoot,
      new DefaultProjectIntegrationAdapterRegistry({
        'html-head': new MarkerHtmlAdapter(),
      }),
      new FileSystemProjectFileGateway(projectRoot),
    );

    await expect(
      lifecycle.open(
        [
          htmlIntegrationArtifact({
            destination,
            id: 'target-b-head',
            stateKey: 'branding',
            target: 'target_b',
          }),
        ],
        [receipt],
        ['target_b'],
      ),
    ).rejects.toMatchObject({
      code: 'LOOM_PLAN_COLLISION',
      context: { retainedTarget: 'target_a', target: 'target_b' },
    });
    expect(receipt.target).toBe('target_a');
    expect(await readFile(destination, 'utf8')).toContain('<!-- managed -->');

    const cleanA = await lifecycle.open([], [receipt], ['target_a']);
    const prepared = cleanA.finalize();
    await cleanA.publish(prepared);
    expect(prepared.receipts).toEqual([]);
    expect(await readFile(destination, 'utf8')).toBe('<head></head>');
  });

  it('rejects case-only integration destinations owned by a retained target', async () => {
    const projectRoot = await fixture();
    const previous: StoredIntegrationReceipt = {
      adapter: 'html-head',
      artifactId: 'target-a-head',
      destination: 'Dashboard/Index.html',
      stateKey: 'branding',
      target: 'target_a',
      state: null,
    };
    await expect(
      new ProjectIntegrationLifecycle(
        projectRoot,
        new DefaultProjectIntegrationAdapterRegistry({}),
        new FileSystemProjectFileGateway(projectRoot),
      ).open(
        [
          htmlIntegrationArtifact({
            destination: path.join(projectRoot, 'dashboard/index.html'),
            id: 'target-b-head',
            stateKey: 'branding',
            target: 'target_b',
          }),
        ],
        [previous],
        ['target_b'],
      ),
    ).rejects.toMatchObject({
      code: 'LOOM_PLAN_COLLISION',
      context: {
        retainedDestination: 'Dashboard/Index.html',
        retainedTarget: 'target_a',
      },
    });
  });

  it('rejects a retained cross-target integration destination with a different state key', async () => {
    const projectRoot = await fixture();
    const destination = path.join(projectRoot, 'dashboard/index.html');
    const previous: StoredIntegrationReceipt = {
      adapter: 'html-head',
      artifactId: 'target-a-head',
      destination: 'dashboard/index.html',
      stateKey: 'target-a-branding',
      target: 'target_a',
      state: null,
    };
    await expect(
      new ProjectIntegrationLifecycle(
        projectRoot,
        new DefaultProjectIntegrationAdapterRegistry({}),
        new FileSystemProjectFileGateway(projectRoot),
      ).open(
        [
          htmlIntegrationArtifact({
            destination,
            id: 'target-b-head',
            stateKey: 'target-b-branding',
            target: 'target_b',
          }),
        ],
        [previous],
        ['target_b'],
      ),
    ).rejects.toMatchObject({
      code: 'LOOM_PLAN_COLLISION',
      context: {
        retainedStateKey: 'target-a-branding',
        retainedTarget: 'target_a',
        stateKey: 'target-b-branding',
        target: 'target_b',
      },
    });
  });

  it('rejects filtered cross-store ownership collisions in both publication directions', async () => {
    const projectRoot = await fixture();
    const generatedDestination = path.join(projectRoot, 'dashboard/generated.txt');
    const authoredDestination = path.join(projectRoot, 'dashboard/authored.html');
    const previousReceipt: StoredIntegrationReceipt = {
      adapter: 'html-head',
      artifactId: 'target-a-authored',
      destination: 'Dashboard/Generated.txt',
      stateKey: 'branding',
      target: 'target_a',
      state: null,
    };
    const previousManifest = {
      version: 1 as const,
      files: {
        'Dashboard/Authored.html': {
          sha256: 'a'.repeat(64),
          taskId: 'target-a-generated',
          target: 'target_a',
        },
      },
    };

    expectPlanCollision(
      () =>
      assertNoRetainedPublicationOwnershipCollisions({
        authoredChanges: [],
        generatedOutputs: [
          {
            artifactId: 'target-b-generated',
            content: Buffer.from('target-b'),
            destination: generatedDestination,
            target: 'target_b',
          },
        ],
        previousManifest: { version: 1, files: {} },
        previousReceipts: [previousReceipt],
        projectRoot,
        selectedTargets: ['target_b'],
      }),
      { retainedTarget: 'target_a' },
    );

    expectPlanCollision(
      () =>
      assertNoRetainedPublicationOwnershipCollisions({
        authoredChanges: [
          {
            content: Buffer.from('<head></head>'),
            destination: authoredDestination,
            expectedSha256: undefined,
          },
        ],
        generatedOutputs: [],
        previousManifest,
        previousReceipts: [],
        projectRoot,
        selectedTargets: ['target_b'],
      }),
      { retainedTarget: 'target_a' },
    );
  });

  it('removes managed authored state for a target no longer in configuration', async () => {
    const projectRoot = await fixture();
    const stateDirectory = path.join(projectRoot, '.assetloom');
    const html = path.join(projectRoot, 'dashboard/index.html');
    await mkdir(path.dirname(html), { recursive: true });
    await writeFile(html, '<head><!-- managed --></head>');
    const receipt: StoredIntegrationReceipt = {
      adapter: 'html-head',
      artifactId: 'old-head',
      destination: 'dashboard/index.html',
      stateKey: 'branding',
      target: 'removed_dashboard',
      state: null,
    };
    await new IntegrationReceiptStore(projectRoot, stateDirectory).save({
      version: 1,
      receipts: { [integrationReceiptId(receipt)]: receipt },
    });
    const loaded: LoadedVersionedConfiguration = {
      config: {
        schemaVersion: 2,
        project: { root: '.' },
        targets: {},
        resources: {},
      },
      files: [],
      projectRoot,
      provenance: new Map(),
    };
    await cleanV2(loaded, {
      integrationAdapters: new DefaultProjectIntegrationAdapterRegistry({
        'html-head': new MarkerHtmlAdapter(),
      }),
      target: 'removed_dashboard',
    });

    expect(await readFile(html, 'utf8')).toBe('<head></head>');
    expect(
      await new IntegrationReceiptStore(projectRoot, stateDirectory).load(),
    ).toEqual({ version: 1, receipts: {} });
  });
});

describe('catalog reporting', () => {
  it('renders a deterministic, escaped report for arbitrary resource types', () => {
    const model = createCatalogReportModel({
      artifacts: [
        {
          id: 'font-copy',
          resourceId: '<brand-font>',
          resourceType: 'font-family',
          target: 'dashboard',
          operation: 'copy-file',
          ownership: 'generated',
          destination: 'dist/font.woff2',
          sourceDependencies: ['font.woff2'],
          status: 'valid',
          bytes: 42,
        },
      ],
      configurationFiles: ['assetloom.json'],
      configurationFingerprint: 'a'.repeat(64),
      configurationName: 'Brand <Dashboard>',
      effectiveConfiguration: '{"schemaVersion":2}',
      targets: ['dashboard'],
    });

    expect(renderCatalogReport(model)).toBe(renderCatalogReport(model));
    expect(renderCatalogReport(model)).toContain('font-family');
    expect(renderCatalogReport(model)).toContain('Brand &lt;Dashboard&gt;');
    expect(renderCatalogReport(model)).not.toContain('<brand-font>');
  });

  it('uses the established safe deterministic report path convention', () => {
    expect(
      defaultCatalogReportOutputPath(
        'C:/workspace',
        'Bränd / Dashboard',
        'abc123456789',
        'Dashboard Preview',
      ),
    ).toBe(
      path.resolve(
        'C:/workspace',
        '.assetloom/reports/brand-dashboard-dashboard-preview.html',
      ),
    );
    expect(
      defaultCatalogReportOutputPath(
        'C:/workspace',
        '***',
        'abc123456789',
      ),
    ).toBe(
      path.resolve(
        'C:/workspace',
        '.assetloom/reports/configuration-abc1234567.html',
      ),
    );
  });
});
