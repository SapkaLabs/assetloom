import path from 'node:path';
import { CatalogExecutor } from '../application/execution/catalog-executor.js';
import type { CatalogMaterializerRegistry } from '../application/execution/catalog-materializer-registry.js';
import { createCompositeGenerationPlan } from '../application/planning/composite-planner.js';
import type { PlanningContext } from '../application/planning/contracts.js';
import type { ResourceHandlerRegistry } from '../application/planning/resource-handler-registry.js';
import {
  createCatalogReportModel,
  type CatalogReportArtifact,
  type CatalogReportModel,
  type CatalogReportStatus,
} from '../application/reporting/catalog-report-model.js';
import type { LoadedVersionedConfiguration } from '../domain/types.js';
import { renderReportDocument } from '../reporting/document.js';
import { humanize } from '../reporting/html.js';
import type { ReportModel, ReportOutput, ReportResource, ReportSource } from '../reporting/model.js';
import { AtomicWriter } from '../storage/atomic-writer.js';
import { ContentCache } from '../storage/cache.js';
import { FileSystemCatalogPublicationResolver } from '../storage/catalog-publication-resolver.js';
import { sha256 } from '../storage/hash.js';
import { ProjectLock } from '../storage/lock.js';
import { ManifestStore } from '../storage/manifest.js';
import { PendingGenerationStore } from '../storage/pending-generation-store.js';
import { ProjectStatePathGuard } from '../storage/state-path-guard.js';
import { inspectReportFile, type InspectedReportFile, reportRelativePath } from './report.js';

export interface CreateCatalogReportOptions {
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
  const normalized = value.normalize('NFKD').replaceAll(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US').replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '').slice(0, 72);
  return normalized || `configuration-${fingerprint.slice(0, 10)}`;
}

export function defaultCatalogReportOutputPath(
  projectRoot: string,
  configurationName: string,
  configurationFingerprint: string,
  target?: string,
): string {
  const suffix = target === undefined ? '' : `-${slug(target, configurationFingerprint)}`;
  return path.resolve(projectRoot, '.assetloom', 'reports', `${slug(configurationName, configurationFingerprint)}${suffix}.html`);
}

function relative(projectRoot: string, destination: string): string {
  return path.relative(projectRoot, destination).split(path.sep).join('/');
}

function status(
  actual: InspectedReportFile | undefined,
  manifestSha256: string | undefined,
  expectedSha256?: string,
): CatalogReportStatus {
  if (actual === undefined) return 'missing';
  if (manifestSha256 === undefined) return 'untracked';
  return actual.sha256 === manifestSha256 &&
    (expectedSha256 === undefined || actual.sha256 === expectedSha256)
    ? 'valid' : 'modified';
}

function inspectedArtifact(actual: InspectedReportFile | undefined): Partial<CatalogReportArtifact> {
  if (actual === undefined) return {};
  return {
    ...(actual.bytes === undefined ? {} : { bytes: actual.bytes }),
    ...(actual.sha256 === undefined ? {} : { actualSha256: actual.sha256 }),
    ...(actual.format === undefined ? {} : { format: actual.format }),
    ...(actual.width === undefined ? {} : { width: actual.width }),
    ...(actual.height === undefined ? {} : { height: actual.height }),
    ...(actual.hasAlpha === undefined ? {} : { hasAlpha: actual.hasAlpha }),
    ...(actual.media === undefined ? {} : { media: actual.media }),
  };
}

function outputFromArtifact(projectRoot: string, artifact: CatalogReportArtifact): ReportOutput {
  return {
    taskId: artifact.id,
    label: `${humanize(artifact.operation)} · ${path.basename(artifact.destination)}`,
    path: reportRelativePath(projectRoot, artifact.destination),
    target: artifact.target,
    operation: artifact.operation,
    ...(artifact.format === undefined ? {} : { format: artifact.format }),
    ...(artifact.width === undefined ? {} : { width: artifact.width }),
    ...(artifact.height === undefined ? {} : { height: artifact.height }),
    ...(artifact.hasAlpha === undefined ? {} : { hasAlpha: artifact.hasAlpha }),
    ...(artifact.bytes === undefined ? {} : { bytes: artifact.bytes }),
    ...(artifact.expectedSha256 === undefined ? {} : { expectedSha256: artifact.expectedSha256 }),
    ...(artifact.actualSha256 === undefined ? {} : { actualSha256: artifact.actualSha256 }),
    status: artifact.status,
    managed: true,
    ...(artifact.media === undefined ? {} : { media: artifact.media }),
  };
}

async function sourcesFromArtifacts(
  projectRoot: string,
  artifacts: readonly CatalogReportArtifact[],
): Promise<readonly ReportSource[]> {
  const paths = [...new Set(artifacts.flatMap((artifact) => artifact.sourceDependencies))].sort();
  return Promise.all(paths.map(async (sourcePath) => {
    const absolute = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(projectRoot, sourcePath);
    const inspected = await inspectReportFile(absolute);
    return {
      path: reportRelativePath(projectRoot, absolute),
      name: path.basename(absolute),
      ...(inspected.bytes === undefined ? {} : { bytes: inspected.bytes }),
      ...(inspected.sha256 === undefined ? {} : { sha256: inspected.sha256 }),
      ...(inspected.media === undefined ? {} : { media: inspected.media }),
    };
  }));
}

function prettyConfiguration(configuration: string): string {
  try { return `${JSON.stringify(JSON.parse(configuration), null, 2)}\n`; }
  catch { return configuration; }
}

async function richReportModel(
  loaded: LoadedVersionedConfiguration,
  catalog: CatalogReportModel,
): Promise<ReportModel> {
  const targetGroup = catalog.resources.find((resource) => resource.id === '__target__');
  const resources: ReportResource[] = await Promise.all(
    catalog.resources.filter((resource) => resource.id !== '__target__').map(async (resource) => ({
      id: resource.id,
      title: humanize(resource.id),
      type: resource.type,
      targets: resource.targets,
      config: loaded.config.resources[resource.id] ?? { type: resource.type },
      sources: await sourcesFromArtifacts(loaded.projectRoot, resource.artifacts),
      outputs: resource.artifacts.map((artifact) => outputFromArtifact(loaded.projectRoot, artifact)),
      issues: resource.issues,
    })),
  );
  const targetOutputs = (targetGroup?.artifacts ?? []).map((artifact) =>
    outputFromArtifact(loaded.projectRoot, artifact),
  );
  const allOutputs = [...resources.flatMap((resource) => resource.outputs), ...targetOutputs];
  const sources = new Set(resources.flatMap((resource) => resource.sources.map((source) => source.path))).size;
  const issues = allOutputs.filter((output) => output.status !== 'valid').length;
  return {
    configurationName: catalog.configurationName,
    ...(loaded.config.metadata?.description === undefined ? {} : { description: loaded.config.metadata.description }),
    fingerprint: catalog.configurationFingerprint,
    configurationFiles: loaded.files.map((file) => reportRelativePath(loaded.projectRoot, file)),
    targets: catalog.targets,
    resources,
    targetOutputs: {
      outputs: targetOutputs,
      issues: targetOutputs.filter((output) => output.status !== 'valid').length,
    },
    effectiveConfiguration: prettyConfiguration(catalog.effectiveConfiguration),
    sources,
    outputs: allOutputs.length,
    validOutputs: allOutputs.filter((output) => output.status === 'valid').length,
    issues,
  };
}

export async function createCatalogReport(
  loaded: LoadedVersionedConfiguration,
  options: CreateCatalogReportOptions,
): Promise<CatalogReportResult> {
  const plan = await createCompositeGenerationPlan(
    loaded, options.resourceHandlers, options.planningContext, options.target,
  );
  const stateDirectory = path.join(loaded.projectRoot, '.assetloom');
  const statePaths = new ProjectStatePathGuard(loaded.projectRoot, stateDirectory);
  const lock = new ProjectLock(stateDirectory, statePaths);
  await lock.acquire();
  try {
    await new PendingGenerationStore(stateDirectory, statePaths).assertNoPending('report');
    const manifest = await new ManifestStore(loaded.projectRoot, stateDirectory, {
      fileOrdering: 'code-point', statePaths,
    }).load();
    const execution = await new CatalogExecutor({
      cache: new ContentCache(stateDirectory, statePaths),
      materializers: options.materializers,
      normalizedConfiguration: options.planningContext.normalizedConfiguration,
      projectRoot: loaded.projectRoot,
      publications: new FileSystemCatalogPublicationResolver(),
    }).prepare(plan.catalogArtifacts);
    const artifacts: CatalogReportArtifact[] = [];
    for (const output of execution.ownedOutputs) {
      const actualInspection = await inspectReportFile(output.destination);
      const actual = actualInspection.exists ? actualInspection : undefined;
      const entry = manifest.files[relative(loaded.projectRoot, output.destination)];
      const planned = plan.catalogArtifacts.find((artifact) => artifact.id === output.artifactId);
      const resolved = execution.resolvedOutputs.find((candidate) => candidate.artifactId === output.artifactId);
      artifacts.push({
        id: output.artifactId,
        resourceId: planned?.resourceId ?? output.artifactId,
        resourceType: planned?.resourceType ?? 'generated-resource',
        target: output.target,
        operation: planned?.operation ?? 'write',
        ownership: 'generated',
        destination: output.destination,
        sourceDependencies: planned?.sourceDependencies ?? [],
        status: status(actual, entry?.sha256, sha256(output.content)),
        expectedSha256: sha256(output.content),
        ...inspectedArtifact(actual),
        ...(resolved?.publicPath === undefined ? {} : { publicPath: resolved.publicPath }),
      });
    }
    for (const task of plan.nativeTasks) {
      const entries = Object.entries(manifest.files).filter(([, entry]) =>
        entry.taskId === task.id && entry.target === task.target,
      );
      const destinations = entries.length === 0
        ? [[relative(loaded.projectRoot, task.destination), undefined] as const]
        : entries;
      for (const [relativePath, entry] of destinations) {
        const destination = path.resolve(loaded.projectRoot, relativePath);
        const inspected = await inspectReportFile(destination);
        const actual = inspected.exists ? inspected : undefined;
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
          ...inspectedArtifact(actual),
        });
      }
    }
    const configurationFingerprint = sha256(Buffer.from(options.planningContext.normalizedConfiguration));
    const configurationName = loaded.config.metadata?.name ?? 'Assetloom resources';
    const model = createCatalogReportModel({
      artifacts,
      configurationFiles: loaded.files,
      configurationFingerprint,
      configurationName,
      effectiveConfiguration: options.planningContext.normalizedConfiguration,
      targets: plan.targets,
    });
    const reportModel = await richReportModel(loaded, model);
    const destination = path.resolve(
      loaded.projectRoot,
      options.output ?? defaultCatalogReportOutputPath(
        loaded.projectRoot, configurationName, configurationFingerprint, options.target,
      ),
    );
    const disposition = await new AtomicWriter(loaded.projectRoot).writeIfChanged(
      destination, Buffer.from(renderReportDocument(reportModel)),
    );
    return {
      path: destination,
      written: disposition === 'written',
      healthy: reportModel.issues === 0,
      configurationFingerprint,
      configurationName,
      sources: reportModel.sources,
      outputs: reportModel.outputs,
      issues: reportModel.issues,
    };
  } finally {
    await lock.release();
  }
}
