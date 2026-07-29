import {
  lstat,
  readFile,
  readdir,
} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { assertSafeDestination } from '../config/paths.js';
import type {
  GenerationTask,
  HtmlReportResult,
  LoadedConfiguration,
  TargetPlatform,
} from '../domain/types.js';
import { createGenerationPlan } from '../planner/index.js';
import { renderReportDocument } from '../reporting/document.js';
import { humanize } from '../reporting/html.js';
import type {
  ReportAssetStatus,
  ReportMedia,
  ReportModel,
  ReportOutput,
  ReportResource,
  ReportSource,
} from '../reporting/model.js';
import { AtomicWriter } from '../storage/atomic-writer.js';
import { sha256 } from '../storage/hash.js';
import {
  type AssetloomManifest,
  ManifestStore,
} from '../storage/manifest.js';

const TEXT_PREVIEW_LIMIT = 8_000;

export interface CreateHtmlReportOptions {
  readonly target?: TargetPlatform;
  readonly output?: string;
}

interface InspectedFile {
  readonly exists: boolean;
  readonly bytes?: number;
  readonly sha256?: string;
  readonly media?: ReportMedia;
  readonly validContent?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly format?: string;
  readonly hasAlpha?: boolean;
}

interface DirectoryInspection {
  readonly bytes: number;
  readonly sha256: string;
  readonly listing: string;
}

function isMissingError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function relativePath(root: string, filename: string): string {
  return path.relative(root, filename).split(path.sep).join('/') || '.';
}

function mimeType(filename: string): string | undefined {
  switch (path.extname(filename).toLocaleLowerCase('en-US')) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.json':
      return 'application/json';
    case '.xml':
    case '.storyboard':
    case '.plist':
      return 'application/xml';
    case '.md':
    case '.txt':
    case '.pbxproj':
      return 'text/plain';
    default:
      return undefined;
  }
}

function mediaFor(filename: string, content: Buffer): ReportMedia {
  const mime = mimeType(filename);
  if (mime?.startsWith('image/') === true) {
    return {
      kind: 'image',
      mimeType: mime,
      dataUrl: `data:${mime};base64,${content.toString('base64')}`,
    };
  }
  if (
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'text/plain'
  ) {
    const complete = content.toString('utf8');
    const text =
      complete.length <= TEXT_PREVIEW_LIMIT
        ? complete
        : `${complete.slice(0, TEXT_PREVIEW_LIMIT)}\n\n… preview truncated …`;
    return { kind: 'text', mimeType: mime, text };
  }
  return {
    kind: 'binary',
    mimeType: mime ?? 'application/octet-stream',
  };
}

async function inspectDirectory(
  directory: string,
  prefix = '',
): Promise<DirectoryInspection> {
  const entries = (await readdir(directory, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  let bytes = 0;
  const digestParts: string[] = [];
  const listing: string[] = [];
  for (const entry of entries) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      listing.push(`${relative} [symbolic link omitted]`);
      digestParts.push(`${relative}:symbolic-link`);
    } else if (entry.isDirectory()) {
      listing.push(`${relative}/`);
      const child = await inspectDirectory(absolute, relative);
      bytes += child.bytes;
      digestParts.push(`${relative}:${child.sha256}`);
      if (child.listing !== '') {
        listing.push(child.listing);
      }
    } else if (entry.isFile()) {
      const content = await readFile(absolute);
      bytes += content.byteLength;
      digestParts.push(`${relative}:${sha256(content)}`);
      listing.push(`${relative}  ${content.byteLength} B`);
    }
  }
  const serialized = digestParts.join('\n');
  return {
    bytes,
    sha256: sha256(serialized),
    listing: listing.join('\n'),
  };
}

async function inspectFile(filename: string): Promise<InspectedFile> {
  try {
    const details = await lstat(filename);
    if (details.isSymbolicLink()) {
      return { exists: true };
    }
    if (details.isDirectory()) {
      const directory = await inspectDirectory(filename);
      return {
        exists: true,
        bytes: directory.bytes,
        sha256: directory.sha256,
        media: {
          kind: 'text',
          mimeType: 'text/plain',
          text: directory.listing || '(empty directory)',
        },
      };
    }
    if (!details.isFile()) {
      return { exists: true };
    }
    const content = await readFile(filename);
    const media = mediaFor(filename, content);
    let validContent = true;
    let width: number | undefined;
    let height: number | undefined;
    let format: string | undefined;
    let hasAlpha: boolean | undefined;
    if (media.kind === 'image') {
      try {
        const metadata = await sharp(content).metadata();
        width = metadata.width;
        height = metadata.height;
        format = metadata.format;
        hasAlpha = metadata.hasAlpha;
      } catch {
        validContent = false;
      }
    } else if (media.mimeType === 'application/json') {
      try {
        JSON.parse(content.toString('utf8'));
      } catch {
        validContent = false;
      }
    } else if (
      media.mimeType === 'application/xml' &&
      !content.toString('utf8').trimStart().startsWith('<?xml')
    ) {
      validContent = false;
    }
    return {
      exists: true,
      bytes: content.byteLength,
      sha256: sha256(content),
      media,
      validContent,
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
      ...(format === undefined ? {} : { format }),
      ...(hasAlpha === undefined ? {} : { hasAlpha }),
    };
  } catch (error) {
    if (isMissingError(error)) {
      return { exists: false };
    }
    throw error;
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function effectiveConfiguration(loaded: LoadedConfiguration): string {
  return `${JSON.stringify(stableValue(loaded.config), null, 2)}\n`;
}

function defaultConfigurationName(loaded: LoadedConfiguration): string {
  const configured = loaded.config.metadata?.name.trim();
  if (configured !== undefined && configured !== '') {
    return configured;
  }
  const fallback = path.basename(loaded.files.at(-1) ?? 'assetloom');
  return (
    fallback
      .replace(/\.assetloom\.json$/i, '')
      .replace(/\.json$/i, '') || 'Assetloom configuration'
  );
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

function outputLabel(
  task: GenerationTask,
  childPath?: string,
): string {
  const prefix = `${task.resourceId}:`;
  const suffix = task.id.startsWith(prefix)
    ? task.id.slice(prefix.length)
    : task.id;
  const label = suffix
    .split(':')
    .map(humanize)
    .join(' · ');
  if (
    childPath !== undefined &&
    path.resolve(childPath) !== path.resolve(task.destination)
  ) {
    return `${label} · ${path.basename(childPath)}`;
  }
  return label;
}

async function reportOutput(
  loaded: LoadedConfiguration,
  task: GenerationTask,
  filename: string,
  expectedSha256: string | undefined,
  managed: boolean,
): Promise<ReportOutput> {
  await assertSafeDestination(loaded.projectRoot, filename);
  const inspected = await inspectFile(filename);
  let status: ReportAssetStatus;
  if (!inspected.exists) {
    status = 'missing';
  } else if (!managed) {
    status = 'valid';
  } else if (expectedSha256 === undefined) {
    status = 'untracked';
  } else if (inspected.sha256 !== expectedSha256) {
    status = 'modified';
  } else if (
    inspected.validContent === false ||
    (task.operation === 'render' &&
      (inspected.width !== task.width ||
        inspected.height !== task.height ||
        inspected.format !== task.format ||
        (task.target === 'ios' &&
          task.resourceType === 'app-icon' &&
          inspected.hasAlpha === true)))
  ) {
    status = 'invalid';
  } else {
    status = 'valid';
  }
  const expectedFormat =
    task.operation === 'copy' && task.format === 'directory'
      ? undefined
      : task.format;
  return {
    taskId: task.id,
    label: outputLabel(task, filename),
    path: relativePath(loaded.projectRoot, filename),
    target: task.target,
    operation: task.operation,
    ...(inspected.format === undefined
      ? expectedFormat === undefined
        ? {}
        : { format: expectedFormat }
      : { format: inspected.format }),
    ...(expectedFormat === undefined ? {} : { expectedFormat }),
    ...(inspected.width === undefined ? {} : { width: inspected.width }),
    ...(inspected.height === undefined ? {} : { height: inspected.height }),
    ...(task.width === undefined ? {} : { expectedWidth: task.width }),
    ...(task.height === undefined ? {} : { expectedHeight: task.height }),
    ...(inspected.hasAlpha === undefined
      ? {}
      : { hasAlpha: inspected.hasAlpha }),
    ...(inspected.bytes === undefined ? {} : { bytes: inspected.bytes }),
    ...(expectedSha256 === undefined ? {} : { expectedSha256 }),
    ...(inspected.sha256 === undefined
      ? {}
      : { actualSha256: inspected.sha256 }),
    status,
    managed,
    ...(inspected.media === undefined ? {} : { media: inspected.media }),
  };
}

async function outputsForTask(
  loaded: LoadedConfiguration,
  task: GenerationTask,
  manifest: AssetloomManifest,
): Promise<ReportOutput[]> {
  if (task.operation === 'update-project') {
    return [await reportOutput(loaded, task, task.destination, undefined, false)];
  }
  const entries = Object.entries(manifest.files)
    .filter(([, entry]) => entry.taskId === task.id)
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return [await reportOutput(loaded, task, task.destination, undefined, true)];
  }
  return Promise.all(
    entries.map(async ([relative, entry]) =>
      reportOutput(
        loaded,
        task,
        path.resolve(loaded.projectRoot, relative),
        entry.sha256,
        true,
      ),
    ),
  );
}

async function reportSources(
  loaded: LoadedConfiguration,
  tasks: readonly GenerationTask[],
): Promise<ReportSource[]> {
  const filenames = [
    ...new Set(tasks.flatMap((task) => task.sourceDependencies)),
  ].sort((left, right) => left.localeCompare(right));
  return Promise.all(
    filenames.map(async (filename) => {
      await assertSafeDestination(loaded.projectRoot, filename);
      const inspected = await inspectFile(filename);
      return {
        path: relativePath(loaded.projectRoot, filename),
        name: path.basename(filename),
        ...(inspected.bytes === undefined ? {} : { bytes: inspected.bytes }),
        ...(inspected.sha256 === undefined
          ? {}
          : { sha256: inspected.sha256 }),
        ...(inspected.media === undefined ? {} : { media: inspected.media }),
      };
    }),
  );
}

async function buildReportModel(
  loaded: LoadedConfiguration,
  target?: TargetPlatform,
): Promise<ReportModel> {
  const plan = await createGenerationPlan(loaded, target);
  const stateDirectory = path.join(loaded.projectRoot, '.assetloom');
  const manifest = await new ManifestStore(
    loaded.projectRoot,
    stateDirectory,
  ).load();
  const configuration = effectiveConfiguration(loaded);
  const fingerprint = sha256(
    JSON.stringify({
      configuration: stableValue(loaded.config),
      targets: plan.targets,
    }),
  );
  const resources: ReportResource[] = [];
  for (const [resourceId, config] of Object.entries(loaded.config.resources)) {
    const tasks = plan.tasks.filter((task) => task.resourceId === resourceId);
    if (tasks.length === 0) {
      continue;
    }
    const outputs = (
      await Promise.all(
        tasks.map(async (task) =>
          outputsForTask(loaded, task, manifest),
        ),
      )
    ).flat();
    const sources = await reportSources(loaded, tasks);
    const targets = [
      ...new Set(tasks.map((task) => task.target)),
    ].sort() as TargetPlatform[];
    resources.push({
      id: resourceId,
      title: humanize(resourceId),
      type: config.type,
      targets,
      config,
      sources,
      outputs,
      issues: outputs.filter((output) => output.status !== 'valid').length,
    });
  }

  const integrationTasks = plan.tasks.filter(
    (task) => task.resourceId === '__target__',
  );
  const integrationOutputs = (
    await Promise.all(
      integrationTasks.map(async (task) =>
        outputsForTask(loaded, task, manifest),
      ),
    )
  ).flat();
  const allOutputs = [
    ...resources.flatMap((resource) => resource.outputs),
    ...integrationOutputs,
  ];
  const uniqueSources = new Set(
    resources.flatMap((resource) =>
      resource.sources.map((source) => source.path),
    ),
  );
  const issues = allOutputs.filter(
    (output) => output.status !== 'valid',
  ).length;
  return {
    configurationName: defaultConfigurationName(loaded),
    ...(loaded.config.metadata?.description === undefined
      ? {}
      : { description: loaded.config.metadata.description }),
    fingerprint,
    configurationFiles: loaded.files.map((file) =>
      relativePath(loaded.projectRoot, file),
    ),
    targets: plan.targets,
    resources,
    integration: {
      outputs: integrationOutputs,
      issues: integrationOutputs.filter(
        (output) => output.status !== 'valid',
      ).length,
    },
    effectiveConfiguration: configuration,
    sources: uniqueSources.size,
    outputs: allOutputs.length,
    validOutputs: allOutputs.filter(
      (output) => output.status === 'valid',
    ).length,
    issues,
  };
}

export async function createHtmlReport(
  loaded: LoadedConfiguration,
  options: CreateHtmlReportOptions = {},
): Promise<HtmlReportResult> {
  const model = await buildReportModel(loaded, options.target);
  const targetSuffix =
    options.target === undefined ? '' : `-${options.target}`;
  const configuredOutput =
    options.output ??
    path.join(
      '.assetloom',
      'reports',
      `${slug(model.configurationName, model.fingerprint)}${targetSuffix}.html`,
    );
  const output = path.resolve(loaded.projectRoot, configuredOutput);
  const disposition = await new AtomicWriter(
    loaded.projectRoot,
  ).writeIfChanged(output, Buffer.from(renderReportDocument(model), 'utf8'));
  return {
    path: output,
    written: disposition === 'written',
    healthy: model.issues === 0,
    configurationName: model.configurationName,
    configurationFingerprint: model.fingerprint,
    sources: model.sources,
    outputs: model.outputs,
    issues: model.issues,
  };
}
