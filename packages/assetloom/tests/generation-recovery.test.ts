import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanV2 } from '../src/api/clean-v2.js';
import { generateV2, type GenerateV2Options } from '../src/api/generate-v2.js';
import { createCatalogReport } from '../src/api/report-v2.js';
import { verifyV2 } from '../src/api/verify-v2.js';
import { CatalogMaterializerRegistry } from '../src/application/execution/catalog-materializer-registry.js';
import type { NativeTaskExecutor } from '../src/application/execution/native-execution.js';
import { ProjectIntegrationSession } from '../src/application/execution/project-integration-lifecycle.js';
import type {
  PlanningContext,
  ResourceHandler,
} from '../src/application/planning/contracts.js';
import { ResourceHandlerRegistry } from '../src/application/planning/resource-handler-registry.js';
import { normalizeConfiguration } from '../src/config/normalize.js';
import type {
  CatalogPlannedArtifact,
  IntegrateProjectArtifact,
  WriteTextArtifact,
} from '../src/domain/catalog/planning.js';
import { LoomError } from '../src/domain/errors.js';
import type { FilesResource } from '../src/domain/catalog/resources.js';
import { targetId } from '../src/domain/catalog/targets.js';
import type {
  LoadedConfiguration,
  LoadedVersionedConfiguration,
} from '../src/domain/types.js';
import { NodeSourceResolver } from '../src/infrastructure/sources/node-source-resolver.js';
import { WebManifestIntegrationAdapter } from '../src/infrastructure/web-integration/web-manifest-adapter.js';
import { DefaultProjectIntegrationAdapterRegistry } from '../src/application/execution/project-integration-adapter-registry.js';
import { WriteTextMaterializer } from '../src/resources/font-family/materialize.js';
import { AtomicWriter } from '../src/storage/atomic-writer.js';
import { GitIgnoreManager } from '../src/storage/gitignore-manager.js';
import { sha256 } from '../src/storage/hash.js';
import { IntegrationReceiptStore } from '../src/storage/integration-receipt-store.js';
import { ManifestStore } from '../src/storage/manifest.js';
import { OwnedOutputLifecycle } from '../src/storage/owned-output-lifecycle.js';
import { PendingGenerationStore } from '../src/storage/pending-generation-store.js';
import { FileSystemProjectFileGateway } from '../src/storage/project-file-gateway.js';
import { ProjectStatePathGuard } from '../src/storage/state-path-guard.js';

const fixtures: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    fixtures.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function fixtureDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-recovery-'));
  fixtures.push(directory);
  await mkdir(path.join(directory, '.git/info'), { recursive: true });
  await writeFile(path.join(directory, 'source.txt'), 'A');
  return directory;
}

class RecoveryResourceHandler implements ResourceHandler<FilesResource> {
  readonly type = 'files' as const;

  validate(): void {}

  async plan(
    resourceId: string,
    resource: FilesResource,
    context: PlanningContext,
  ): Promise<readonly CatalogPlannedArtifact[]> {
    const targetName = resource.outputs[0]?.target;
    if (targetName === undefined) {
      throw new Error('Recovery fixture requires an output target.');
    }
    const target = context.resolveTarget(targetName);
    const source = await readFile(path.join(context.projectRoot, 'source.txt'), 'utf8');
    const firstId = `${resourceId}:${target.id}:first`;
    const secondId = `${resourceId}:${target.id}:second`;
    const owned = (id: string, filename: string): WriteTextArtifact => ({
      id,
      resourceId,
      resourceType: 'files',
      target: target.id,
      operation: 'write-text',
      ownership: 'generated',
      publication: { mode: 'stable' },
      dependsOn: [],
      sourceDependencies: [path.join(context.projectRoot, 'source.txt')],
      destination: path.join(target.root, 'generated', filename),
      presetVersion: 'recovery-test-v1',
      content: `${source}:${filename}`,
      encoding: 'utf8',
    });
    const integration: IntegrateProjectArtifact = {
      id: `${resourceId}:${target.id}:manifest`,
      resourceId,
      resourceType: 'files',
      target: target.id,
      operation: 'integrate-project',
      ownership: 'project-integration',
      dependsOn: [firstId, secondId],
      sourceDependencies: [path.join(context.projectRoot, 'source.txt')],
      destination: path.join(target.root, 'authored/manifest.json'),
      presetVersion: 'recovery-test-v1',
      integration: {
        adapter: 'web-app-manifest',
        stateKey: 'recovery-manifest',
        manifest: { name: source },
      },
    };
    return [
      owned(firstId, 'first.txt'),
      owned(secondId, 'second.txt'),
      integration,
    ];
  }
}

async function inspectedHash(filename: string): Promise<string | undefined> {
  try {
    return sha256(await readFile(filename));
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return undefined;
    }
    throw error;
  }
}

class RecoveryNativeExecutor implements NativeTaskExecutor {
  readonly #projectRoot: string;

  constructor(projectRoot: string) {
    this.#projectRoot = projectRoot;
  }

  async prepare(): Promise<{
    readonly integrations: readonly {
      readonly content: Uint8Array;
      readonly destination: string;
      readonly expectedSha256: string | undefined;
    }[];
    readonly ownedOutputs: readonly [];
  }> {
    const source = await readFile(path.join(this.#projectRoot, 'source.txt'), 'utf8');
    const destinations = [
      path.join(this.#projectRoot, 'native/first.txt'),
      path.join(this.#projectRoot, 'native/second.txt'),
    ];
    return {
      ownedOutputs: [],
      integrations: await Promise.all(
        destinations.map(async (destination) => ({
          destination,
          content: Buffer.from(`native:${source}:${path.basename(destination)}`),
          expectedSha256: await inspectedHash(destination),
        })),
      ),
    };
  }
}

interface RecoveryFixture {
  readonly loaded: LoadedVersionedConfiguration;
  readonly options: GenerateV2Options;
  readonly projectRoot: string;
  readonly stateDirectory: string;
  readonly statePaths: ProjectStatePathGuard;
}

async function recoveryFixture(): Promise<RecoveryFixture> {
  const projectRoot = await fixtureDirectory();
  const config = {
    schemaVersion: 2 as const,
    project: { root: '.' },
    targets: {
      app: { kind: 'directory' as const, root: '.' },
      other: { kind: 'directory' as const, root: '.' },
    },
    resources: {
      recovery: {
        type: 'files' as const,
        source: { file: 'source.txt' },
        outputs: [{ target: 'app', directory: 'generated' }],
      },
    },
  };
  const loaded: LoadedVersionedConfiguration = {
    config,
    files: [],
    projectRoot,
    provenance: new Map(),
  };
  const planningContext: PlanningContext = {
    projectRoot,
    normalizedConfiguration: normalizeConfiguration(config),
    sourceResolver: new NodeSourceResolver({ projectRoot }),
    resolveTarget: (requested) => ({
      id: targetId(requested),
      kind: 'directory',
      root: projectRoot,
      configuration: { kind: 'directory', root: '.' },
    }),
  };
  const options: GenerateV2Options = {
    planningContext,
    resourceHandlers: new ResourceHandlerRegistry({
      files: new RecoveryResourceHandler(),
    }),
    materializers: new CatalogMaterializerRegistry({
      'write-text': new WriteTextMaterializer(),
    }),
    integrationAdapters: new DefaultProjectIntegrationAdapterRegistry({
      'web-app-manifest': new WebManifestIntegrationAdapter(),
    }),
    nativeExecutor: new RecoveryNativeExecutor(projectRoot),
  };
  const stateDirectory = path.join(projectRoot, '.assetloom');
  return {
    loaded,
    options,
    projectRoot,
    stateDirectory,
    statePaths: new ProjectStatePathGuard(projectRoot, stateDirectory),
  };
}

async function pending(fixture: RecoveryFixture) {
  return new PendingGenerationStore(
    fixture.stateDirectory,
    fixture.statePaths,
  ).load();
}

async function manifest(fixture: RecoveryFixture) {
  return new ManifestStore(
    fixture.projectRoot,
    fixture.stateDirectory,
    { fileOrdering: 'code-point', statePaths: fixture.statePaths },
  ).load();
}

async function receipts(fixture: RecoveryFixture) {
  return new IntegrationReceiptStore(
    fixture.projectRoot,
    fixture.stateDirectory,
    fixture.statePaths,
  ).load();
}

function injectedFailure(): Error {
  return new Error('injected publication failure');
}

async function rejectedLoomError(operation: Promise<unknown>): Promise<LoomError> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof LoomError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected the operation to reject with LoomError.');
}

type FailurePhase =
  | 'owned-nth'
  | 'manifest'
  | 'catalog-authored'
  | 'receipt'
  | 'native-nth'
  | 'gitignore'
  | 'pending-clear';

function injectFailure(phase: FailurePhase): void {
  if (phase === 'owned-nth') {
    vi.spyOn(AtomicWriter.prototype, 'writeIfChanged').mockImplementation(
      async (destination, content) => {
        if (destination.endsWith(path.join('generated', 'second.txt'))) {
          throw injectedFailure();
        }
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, content);
        return 'written';
      },
    );
    return;
  }
  if (phase === 'manifest') {
    vi.spyOn(ManifestStore.prototype, 'save').mockRejectedValueOnce(
      injectedFailure(),
    );
    return;
  }
  if (phase === 'catalog-authored') {
    vi.spyOn(ProjectIntegrationSession.prototype, 'publish').mockImplementationOnce(
      async (publication) => {
        const change = publication.changes[0];
        if (change !== undefined) {
          await mkdir(path.dirname(change.destination), { recursive: true });
          await writeFile(change.destination, change.content);
        }
        throw injectedFailure();
      },
    );
    return;
  }
  if (phase === 'receipt') {
    vi.spyOn(IntegrationReceiptStore.prototype, 'save').mockRejectedValueOnce(
      injectedFailure(),
    );
    return;
  }
  if (phase === 'native-nth') {
    vi.spyOn(FileSystemProjectFileGateway.prototype, 'publish').mockImplementation(
      async (destination, content) => {
        if (destination.endsWith(path.join('native', 'second.txt'))) {
          throw injectedFailure();
        }
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, content);
        return 'written';
      },
    );
    return;
  }
  if (phase === 'gitignore') {
    vi.spyOn(GitIgnoreManager.prototype, 'update').mockRejectedValueOnce(
      injectedFailure(),
    );
    return;
  }
  vi.spyOn(PendingGenerationStore.prototype, 'clear').mockRejectedValueOnce(
    injectedFailure(),
  );
}

describe('durable generation recovery', () => {
  it.each([
    'owned-nth',
    'manifest',
    'catalog-authored',
    'receipt',
    'native-nth',
    'gitignore',
    'pending-clear',
  ] as const)('retries the identical prepared intent after %s failure', async (phase) => {
    const prepared = await recoveryFixture();
    injectFailure(phase);

    await expect(generateV2(prepared.loaded, prepared.options)).rejects.toThrow(
      'injected publication failure',
    );
    const durablePending = await pending(prepared);
    expect(durablePending?.fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(durablePending?.selectedTargets).toEqual(['app', 'other']);

    const durableManifest = await manifest(prepared);
    const manifestMustExist = !['owned-nth', 'manifest'].includes(phase);
    expect(Object.keys(durableManifest.files).length > 0).toBe(manifestMustExist);
    const durableReceipts = await receipts(prepared);
    const receiptsMustExist = ['native-nth', 'gitignore', 'pending-clear'].includes(
      phase,
    );
    expect(Object.keys(durableReceipts.receipts).length > 0).toBe(
      receiptsMustExist,
    );

    vi.restoreAllMocks();
    await expect(generateV2(prepared.loaded, prepared.options)).resolves.toBeDefined();
    expect(await pending(prepared)).toBeUndefined();
    await expect(
      readFile(path.join(prepared.projectRoot, 'generated/first.txt'), 'utf8'),
    ).resolves.toBe('A:first.txt');
    await expect(
      readFile(path.join(prepared.projectRoot, 'generated/second.txt'), 'utf8'),
    ).resolves.toBe('A:second.txt');
    expect(JSON.parse(
      await readFile(
        path.join(prepared.projectRoot, 'authored/manifest.json'),
        'utf8',
      ),
    )).toMatchObject({ name: 'A' });
  });

  it('reports pending recovery after catalog publication when source changes', async () => {
    const prepared = await recoveryFixture();
    vi.spyOn(IntegrationReceiptStore.prototype, 'save').mockRejectedValueOnce(
      injectedFailure(),
    );

    await expect(generateV2(prepared.loaded, prepared.options)).rejects.toThrow(
      'injected publication failure',
    );
    const durablePending = await pending(prepared);
    expect(durablePending).toBeDefined();
    expect(
      JSON.parse(
        await readFile(
          path.join(prepared.projectRoot, 'authored/manifest.json'),
          'utf8',
        ),
      ),
    ).toMatchObject({ name: 'A' });

    vi.restoreAllMocks();
    await writeFile(path.join(prepared.projectRoot, 'source.txt'), 'B');
    await expect(
      generateV2(prepared.loaded, prepared.options),
    ).rejects.toMatchObject({
      code: 'LOOM_GENERATION_RECOVERY_REQUIRED',
      context: {
        pendingFingerprint: durablePending?.fingerprint,
        pendingTargets: ['app', 'other'],
      },
    });
  });

  it('recovers after stale deletion before the manifest save', async () => {
    const prepared = await recoveryFixture();
    const stale = path.join(prepared.projectRoot, 'generated/stale.txt');
    await mkdir(path.dirname(stale), { recursive: true });
    await writeFile(stale, 'stale');
    await new ManifestStore(
      prepared.projectRoot,
      prepared.stateDirectory,
      { fileOrdering: 'code-point', statePaths: prepared.statePaths },
    ).save({
      version: 1,
      files: {
        'generated/stale.txt': {
          sha256: sha256(Buffer.from('stale')),
          target: 'app',
          taskId: 'stale',
        },
      },
    });
    vi.spyOn(OwnedOutputLifecycle.prototype, 'publish').mockImplementationOnce(
      async (publication) => {
        for (const output of publication.outputs) {
          await mkdir(path.dirname(output.destination), { recursive: true });
          await writeFile(output.destination, output.content);
        }
        for (const staleOutput of publication.stale) {
          await rm(staleOutput.absolutePath, { force: true });
        }
        throw injectedFailure();
      },
    );

    await expect(generateV2(prepared.loaded, prepared.options)).rejects.toThrow(
      'injected publication failure',
    );
    await expect(readFile(stale)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await pending(prepared)).toBeDefined();

    vi.restoreAllMocks();
    await generateV2(prepared.loaded, prepared.options);
    expect(await pending(prepared)).toBeUndefined();
    expect(await manifest(prepared)).not.toHaveProperty(
      'files.generated/stale.txt',
    );
  });

  it('rejects changed source, configuration, and target scope while pending', async () => {
    const changedSource = await recoveryFixture();
    vi.spyOn(ProjectIntegrationSession.prototype, 'publish').mockRejectedValueOnce(
      injectedFailure(),
    );
    await expect(
      generateV2(changedSource.loaded, changedSource.options),
    ).rejects.toThrow('injected publication failure');
    vi.restoreAllMocks();
    const changedSourcePending = await pending(changedSource);
    expect(changedSourcePending).toBeDefined();
    await writeFile(path.join(changedSource.projectRoot, 'source.txt'), 'B');
    const changedSourceError = await rejectedLoomError(
      generateV2(changedSource.loaded, changedSource.options),
    );
    expect(changedSourceError).toMatchObject({
      code: 'LOOM_GENERATION_RECOVERY_REQUIRED',
      context: {
        pendingFingerprint: changedSourcePending?.fingerprint,
        pendingTargets: ['app', 'other'],
        requestedTargets: ['app', 'other'],
      },
    });
    expect(changedSourceError.context.requestedFingerprint).toMatch(
      /^[0-9a-f]{64}$/u,
    );
    expect(changedSourceError.context.requestedFingerprint).not.toBe(
      changedSourcePending?.fingerprint,
    );

    const changedConfig = await recoveryFixture();
    vi.spyOn(ProjectIntegrationSession.prototype, 'publish').mockRejectedValueOnce(
      injectedFailure(),
    );
    await expect(
      generateV2(changedConfig.loaded, changedConfig.options),
    ).rejects.toThrow('injected publication failure');
    vi.restoreAllMocks();
    const changedConfigPending = await pending(changedConfig);
    expect(changedConfigPending).toBeDefined();
    const changedConfigError = await rejectedLoomError(
      generateV2(
        {
          ...changedConfig.loaded,
          config: {
            ...changedConfig.loaded.config,
            metadata: { name: 'changed configuration' },
          },
        },
        changedConfig.options,
      ),
    );
    expect(changedConfigError).toMatchObject({
      code: 'LOOM_GENERATION_RECOVERY_REQUIRED',
      context: {
        pendingFingerprint: changedConfigPending?.fingerprint,
        pendingTargets: ['app', 'other'],
        requestedTargets: ['app', 'other'],
      },
    });
    expect(changedConfigError.context.requestedFingerprint).toMatch(
      /^[0-9a-f]{64}$/u,
    );
    const changedTargetError = await rejectedLoomError(
      generateV2(changedConfig.loaded, {
        ...changedConfig.options,
        target: 'other',
      }),
    );
    expect(changedTargetError).toMatchObject({
      code: 'LOOM_GENERATION_RECOVERY_REQUIRED',
      context: {
        pendingFingerprint: changedConfigPending?.fingerprint,
        pendingTargets: ['app', 'other'],
        requestedTargets: ['other'],
      },
    });
    expect(changedTargetError.context.requestedFingerprint).toMatch(
      /^[0-9a-f]{64}$/u,
    );
  });

  it('blocks verify, report, clean, and schema-v1 mutation while pending', async () => {
    const prepared = await recoveryFixture();
    vi.spyOn(ProjectIntegrationSession.prototype, 'publish').mockRejectedValueOnce(
      injectedFailure(),
    );
    await expect(generateV2(prepared.loaded, prepared.options)).rejects.toThrow(
      'injected publication failure',
    );
    vi.restoreAllMocks();

    await expect(
      verifyV2(prepared.loaded, prepared.options),
    ).rejects.toMatchObject({ code: 'LOOM_GENERATION_RECOVERY_REQUIRED' });
    await expect(
      createCatalogReport(prepared.loaded, prepared.options),
    ).rejects.toMatchObject({ code: 'LOOM_GENERATION_RECOVERY_REQUIRED' });
    await expect(
      cleanV2(prepared.loaded, {
        integrationAdapters: prepared.options.integrationAdapters,
      }),
    ).rejects.toMatchObject({ code: 'LOOM_GENERATION_RECOVERY_REQUIRED' });

    const versionOne: LoadedConfiguration = {
      config: {
        schemaVersion: 1,
        project: { root: '.' },
        targets: {
          android: {
            enabled: true,
            resourceDirectory: './android/res',
            manifestPath: './android/AndroidManifest.xml',
          },
        },
        resources: {},
      },
      files: [],
      projectRoot: prepared.projectRoot,
      provenance: new Map(),
    };
    const { clean, generate } = await import('../src/api/generate.js');
    await expect(generate(versionOne)).rejects.toMatchObject({
      code: 'LOOM_GENERATION_RECOVERY_REQUIRED',
    });
    await expect(clean(versionOne)).rejects.toMatchObject({
      code: 'LOOM_GENERATION_RECOVERY_REQUIRED',
    });
  });

  it('fails closed for malformed pending state', async () => {
    const prepared = await recoveryFixture();
    await mkdir(prepared.stateDirectory, { recursive: true });
    await writeFile(
      path.join(prepared.stateDirectory, 'pending-generation.json'),
      '{"version":1,"fingerprint":"bad"}\n',
    );
    await expect(generateV2(prepared.loaded, prepared.options)).rejects.toMatchObject({
      code: 'LOOM_GENERATION_INTENT_INVALID',
    });
  });

  it('guards the pending state file against symbolic-link traversal', async (context) => {
    const prepared = await recoveryFixture();
    await mkdir(prepared.stateDirectory, { recursive: true });
    const target = path.join(prepared.projectRoot, 'linked-intent.json');
    await writeFile(
      target,
      `${JSON.stringify({
        version: 1,
        fingerprint: 'a'.repeat(64),
        selectedTargets: ['app'],
      })}\n`,
    );
    try {
      await symlink(
        target,
        path.join(prepared.stateDirectory, 'pending-generation.json'),
        'file',
      );
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;
      if (code === 'EPERM' || code === 'EACCES') {
        context.skip(`File links are unsupported (${code}).`);
        return;
      }
      throw error;
    }
    await expect(pending(prepared)).rejects.toMatchObject({
      code: 'LOOM_STATE_PATH_UNSAFE',
    });
  });
});
