import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CatalogExecutor } from '../application/execution/catalog-executor.js';
import type { CatalogMaterializerRegistry } from '../application/execution/catalog-materializer-registry.js';
import type { ProjectIntegrationAdapterRegistry, StoredIntegrationReceipt } from '../application/execution/contracts.js';
import { ProjectIntegrationLifecycle } from '../application/execution/project-integration-lifecycle.js';
import { createCompositeGenerationPlan } from '../application/planning/composite-planner.js';
import type { PlanningContext } from '../application/planning/contracts.js';
import type { ResourceHandlerRegistry } from '../application/planning/resource-handler-registry.js';
import {
  createCatalogReportModel,
  type CatalogReportArtifact,
  type CatalogReportStatus,
} from '../application/reporting/catalog-report-model.js';
import { renderCatalogReport } from '../application/reporting/catalog-report-document.js';
import type { IntegrateProjectArtifact } from '../domain/catalog/planning.js';
import type { LoadedVersionedConfiguration } from '../domain/types.js';
import { AtomicWriter } from '../storage/atomic-writer.js';
import { ContentCache } from '../storage/cache.js';
import { FileSystemCatalogPublicationResolver } from '../storage/catalog-publication-resolver.js';
import { sha256 } from '../storage/hash.js';
import { IntegrationReceiptStore } from '../storage/integration-receipt-store.js';
import { ProjectLock } from '../storage/lock.js';
import { ManifestStore } from '../storage/manifest.js';
import { FileSystemProjectFileGateway } from '../storage/project-file-gateway.js';
import { ProjectStatePathGuard } from '../storage/state-path-guard.js';
import { PendingGenerationStore } from '../storage/pending-generation-store.js';

export interface CreateCatalogReportOptions {
  readonly integrationAdapters: ProjectIntegrationAdapterRegistry;
  readonly materializers: CatalogMaterializerRegistry;
  readonly output?: string;
  readonly planningContext: PlanningContext;
  readonly resourceHandlers: ResourceHandlerRegistry;
  readonly target?: string;
}

export interface CatalogReportResult {
  readonly configurationFingerprint: string;
  readonly configurationName: string;
  readonly healthy: boolean;
  readonly issues: number;
  readonly outputs: number;
  readonly path: string;
  readonly sources: number;
  readonly written: boolean;
}

function slug(value: string, fingerprint: string): string {
  const normalized = value
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 72);
  return normalized || `configuration-${fingerprint.slice(0, 10)}`;
}

export function defaultCatalogReportOutputPath(
  projectRoot: string,
  configurationName: string,
  configurationFingerprint: string,
  target?: string,
): string {
  const targetSuffix =
    target === undefined ? '' : `-${slug(target, configurationFingerprint)}`;
  return path.resolve(
    projectRoot,
    '.assetloom',
    'reports',
    `${slug(configurationName, configurationFingerprint)}${targetSuffix}.html`,
  );
}

interface InspectedFile {
  readonly bytes: number;
  readonly sha256: string;
}

async function inspectFile(destination: string): Promise<InspectedFile | undefined> {
  try {
    const content = await readFile(destination);
    return { bytes: content.byteLength, sha256: sha256(content) };
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? error.code
        : undefined;
    if (code === 'ENOENT' || code === 'EISDIR') {
      return undefined;
    }
    throw error;
  }
}

function relative(projectRoot: string, destination: string): string {
  return path.relative(projectRoot, destination).split(path.sep).join('/');
}

function status(
  actual: InspectedFile | undefined,
  manifestSha256: string | undefined,
  expectedSha256?: string,
): CatalogReportStatus {
  if (actual === undefined) {
    return 'missing';
  }
  if (manifestSha256 === undefined) {
    return 'untracked';
  }
  return actual.sha256 === manifestSha256 &&
    (expectedSha256 === undefined || actual.sha256 === expectedSha256)
    ? 'valid'
    : 'modified';
}

function hasReceipt(
  artifact: IntegrateProjectArtifact,
  projectRoot: string,
  receipts: readonly StoredIntegrationReceipt[],
): boolean {
  const destination = relative(projectRoot, artifact.destination);
  return receipts.some(
    (receipt) =>
      receipt.adapter === artifact.integration.adapter &&
      receipt.destination === destination &&
      receipt.stateKey === artifact.integration.stateKey &&
      receipt.target === artifact.target,
  );
}

export async function createCatalogReport(
  loaded: LoadedVersionedConfiguration,
  options: CreateCatalogReportOptions,
): Promise<CatalogReportResult> {
  const plan = await createCompositeGenerationPlan(
    loaded,
    options.resourceHandlers,
    options.planningContext,
    options.target,
  );
  const stateDirectory = path.join(loaded.projectRoot, '.assetloom');
  const statePaths = new ProjectStatePathGuard(loaded.projectRoot, stateDirectory);
  const lock = new ProjectLock(stateDirectory, statePaths);
  await lock.acquire();
  try {
    await new PendingGenerationStore(
      stateDirectory,
      statePaths,
    ).assertNoPending('report');
    const [manifest, receiptDocument] = await Promise.all([
      new ManifestStore(loaded.projectRoot, stateDirectory, {
        fileOrdering: 'code-point',
        statePaths,
      }).load(),
      new IntegrationReceiptStore(
        loaded.projectRoot,
        stateDirectory,
        statePaths,
      ).load(),
    ]);
    const receipts = Object.values(receiptDocument.receipts);
    const files = new FileSystemProjectFileGateway(loaded.projectRoot);
    const integrations = plan.catalogArtifacts.filter(
      (artifact) => artifact.operation === 'integrate-project',
    );
    const session = await new ProjectIntegrationLifecycle(
      loaded.projectRoot,
      options.integrationAdapters,
      files,
    ).open(integrations, receipts, plan.targets);
    const execution = await new CatalogExecutor({
      cache: new ContentCache(stateDirectory, statePaths),
      integrations: session,
      materializers: options.materializers,
      normalizedConfiguration: options.planningContext.normalizedConfiguration,
      projectRoot: loaded.projectRoot,
      publications: new FileSystemCatalogPublicationResolver(),
    }).prepare(plan.catalogArtifacts);
    const artifacts: CatalogReportArtifact[] = [];

    for (const output of execution.ownedOutputs) {
      const actual = await inspectFile(output.destination);
      const entry = manifest.files[relative(loaded.projectRoot, output.destination)];
      const planned = plan.catalogArtifacts.find(
        (artifact) =>
          artifact.id === output.artifactId ||
          (artifact.operation === 'integrate-project' &&
            artifact.integration.adapter === 'web-app-manifest' &&
            artifact.integration.publishedCopy?.resultId === output.artifactId),
      );
      const resolved = execution.resolvedOutputs.find(
        (candidate) => candidate.artifactId === output.artifactId,
      );
      artifacts.push({
        id: output.artifactId,
        resourceId: planned?.resourceId ?? output.artifactId,
        resourceType: planned?.resourceType ?? 'published-integration',
        target: output.target,
        operation: planned?.operation ?? 'write',
        ownership: 'generated',
        destination: output.destination,
        sourceDependencies: planned?.sourceDependencies ?? [],
        status: status(actual, entry?.sha256, sha256(output.content)),
        expectedSha256: sha256(output.content),
        ...(actual === undefined
          ? {}
          : { actualSha256: actual.sha256, bytes: actual.bytes }),
        ...(resolved?.publicPath === undefined
          ? {}
          : { publicPath: resolved.publicPath }),
      });
    }

    for (const task of plan.nativeTasks) {
      if (task.operation === 'update-project') {
        const actual = await inspectFile(task.destination);
        artifacts.push({
          id: task.id,
          resourceId: task.resourceId,
          resourceType: task.resourceType,
          target: task.target,
          operation: task.operation,
          ownership: 'project-integration',
          destination: task.destination,
          sourceDependencies: task.sourceDependencies,
          status: actual === undefined ? 'missing' : 'valid',
          ...(actual === undefined
            ? {}
            : { actualSha256: actual.sha256, bytes: actual.bytes }),
        });
        continue;
      }
      const entries = Object.entries(manifest.files).filter(
        ([, entry]) => entry.taskId === task.id && entry.target === task.target,
      );
      const destinations =
        entries.length === 0
          ? [[relative(loaded.projectRoot, task.destination), undefined] as const]
          : entries;
      for (const [relativePath, entry] of destinations) {
        const destination = path.resolve(loaded.projectRoot, relativePath);
        const actual = await inspectFile(destination);
        artifacts.push({
          id: task.id,
          resourceId: task.resourceId,
          resourceType: task.resourceType,
          target: task.target,
          operation: task.operation,
          ownership: 'generated',
          destination,
          sourceDependencies: task.sourceDependencies,
          status: status(actual, entry?.sha256),
          ...(entry === undefined ? {} : { expectedSha256: entry.sha256 }),
          ...(actual === undefined
            ? {}
            : { actualSha256: actual.sha256, bytes: actual.bytes }),
        });
      }
    }

    for (const artifact of integrations) {
      const actual = await inspectFile(artifact.destination);
      artifacts.push({
        id: artifact.id,
        resourceId: artifact.resourceId,
        resourceType: artifact.resourceType,
        target: artifact.target,
        operation: artifact.operation,
        ownership: 'project-integration',
        destination: artifact.destination,
        sourceDependencies: artifact.sourceDependencies,
        status:
          actual === undefined
            ? 'missing'
            : hasReceipt(artifact, loaded.projectRoot, receipts)
              ? 'valid'
              : 'untracked',
        ...(actual === undefined
          ? {}
          : { actualSha256: actual.sha256, bytes: actual.bytes }),
      });
    }

    const configurationFingerprint = sha256(
      Buffer.from(options.planningContext.normalizedConfiguration),
    );
    const configurationName =
      loaded.config.metadata?.name ?? 'Assetloom resources';
    const model = createCatalogReportModel({
      artifacts,
      configurationFiles: loaded.files,
      configurationFingerprint,
      configurationName,
      effectiveConfiguration: options.planningContext.normalizedConfiguration,
      targets: plan.targets,
    });
    const destination = path.resolve(
      loaded.projectRoot,
      options.output ??
        defaultCatalogReportOutputPath(
          loaded.projectRoot,
          configurationName,
          configurationFingerprint,
          options.target,
        ),
    );
    const disposition = await new AtomicWriter(loaded.projectRoot).writeIfChanged(
      destination,
      Buffer.from(renderCatalogReport(model)),
    );
    return {
      path: destination,
      written: disposition === 'written',
      healthy: model.issues === 0,
      configurationFingerprint,
      configurationName,
      sources: new Set(
        artifacts.flatMap((artifact) => artifact.sourceDependencies),
      ).size,
      outputs: model.outputs,
      issues: model.issues,
    };
  } finally {
    await lock.release();
  }
}
