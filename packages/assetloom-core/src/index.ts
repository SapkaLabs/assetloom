import { createHash } from 'node:crypto';
import path from 'node:path';

export type JsonSafeValue = null | boolean | number | string |
  readonly JsonSafeValue[] | { readonly [key: string]: JsonSafeValue };

export interface ContentHashV1 {
  readonly algorithm: 'sha256';
  readonly value: string;
  readonly token: string;
}

export type PublishedArtifactDisposition = 'created' | 'updated' | 'unchanged';

export interface PublishedArtifactV1 {
  readonly artifactId: string;
  readonly resourceId: string;
  readonly targetId: string;
  readonly role: string;
  readonly outputRootId: string;
  readonly relativePath: string;
  readonly publicPath?: string;
  readonly disposition: PublishedArtifactDisposition;
  readonly mediaType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sizeBytes: number;
  readonly contentHash: ContentHashV1;
}

export interface RemovedArtifactV1 {
  readonly artifactId: string;
  readonly targetId: string;
  readonly outputRootId: string;
  readonly relativePath: string;
  readonly disposition: 'removed';
  readonly contentHash: Omit<ContentHashV1, 'token'>;
}

export interface UsageDescriptorV1<TPayload extends JsonSafeValue = JsonSafeValue> {
  readonly kind: string;
  readonly version: 1;
  readonly targetId: string;
  readonly artifactIds: readonly string[];
  readonly payload: TPayload;
}

export interface DiagnosticV1 {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly context?: Readonly<Record<string, JsonSafeValue>>;
}

export interface GenerationResultV1 {
  readonly resultVersion: 1;
  readonly targets: readonly string[];
  readonly artifacts: readonly PublishedArtifactV1[];
  readonly removed: readonly RemovedArtifactV1[];
  readonly usage: readonly UsageDescriptorV1[];
  readonly diagnostics: readonly DiagnosticV1[];
}

export interface PlannedArtifactV1 {
  readonly artifactId: string;
  readonly resourceId: string;
  readonly targetId: string;
  readonly role: string;
  readonly outputRootId: string;
  readonly relativePath: string;
  readonly mediaType?: string;
}

export class CoreLoomError extends Error {
  readonly code: string;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(code: string, message: string, context: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = 'LoomError';
    this.code = code;
    this.context = Object.freeze({ ...context });
  }
}

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function isJsonSafeValue(value: unknown): value is JsonSafeValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonSafeValue);
  if (typeof value !== 'object') return false;
  return Object.entries(value as Readonly<Record<string, unknown>>)
    .every(([key, child]) => key.length > 0 && isJsonSafeValue(child));
}

export function isPortableResultPath(value: string): boolean {
  if (value.length === 0 || value.includes('\0') || value.includes('\\') ||
    path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || compare(values[index - 1] ?? '', value) < 0);
}

function canonical(value: JsonSafeValue): JsonSafeValue {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => compare(a, b))
    .map(([key, child]) => [key, canonical(child)]));
}

function invalid(message: string, context: Readonly<Record<string, unknown>> = {}): never {
  throw new CoreLoomError('LOOM_RESULT_INVALID', message, context);
}

const digestPattern = /^[0-9a-f]{64}$/u;
const tokenPattern = /^[0-9a-f]{8,64}$/u;

export function validateGenerationResultV1(value: unknown): GenerationResultV1 {
  if (typeof value !== 'object' || value === null || (value as { resultVersion?: unknown }).resultVersion !== 1) {
    invalid('Generation results must declare resultVersion 1.');
  }
  const result = value as Partial<GenerationResultV1>;
  if (!Array.isArray(result.targets) || !result.targets.every((item) => typeof item === 'string') || !sortedUnique(result.targets)) {
    invalid('Generation result targets must be sorted and unique.');
  }
  if (!Array.isArray(result.artifacts) || !Array.isArray(result.removed) ||
    !Array.isArray(result.usage) || !Array.isArray(result.diagnostics)) {
    invalid('Generation result collections must be arrays.');
  }
  const artifacts = result.artifacts as unknown as readonly PublishedArtifactV1[];
  const removed = result.removed as unknown as readonly RemovedArtifactV1[];
  const usage = result.usage as unknown as readonly UsageDescriptorV1[];
  const diagnostics = result.diagnostics as unknown as readonly DiagnosticV1[];
  const artifactKeys: string[] = [];
  const artifactIds = new Set<string>();
  for (const artifact of artifacts) {
    if (!isPortableResultPath(artifact.relativePath) || !digestPattern.test(artifact.contentHash.value) ||
      !tokenPattern.test(artifact.contentHash.token) || !artifact.contentHash.value.startsWith(artifact.contentHash.token)) {
      invalid('A published artifact has invalid portable identity or content hash.');
    }
    artifactKeys.push([artifact.targetId, artifact.resourceId, artifact.role, artifact.outputRootId, artifact.relativePath, artifact.artifactId].join('\0'));
    if (artifactIds.has(artifact.artifactId)) invalid('Generation result artifact IDs must be unique.');
    artifactIds.add(artifact.artifactId);
  }
  if (!sortedUnique(artifactKeys)) invalid('Generation result artifacts must have deterministic unique ordering.');
  const removalKeys = removed.map((artifact) => {
    if (!isPortableResultPath(artifact.relativePath) || !digestPattern.test(artifact.contentHash.value)) {
      invalid('A removed artifact has invalid portable identity or content hash.');
    }
    return [artifact.targetId, artifact.outputRootId, artifact.relativePath, artifact.artifactId].join('\0');
  });
  if (!sortedUnique(removalKeys)) invalid('Generation result removals must have deterministic unique ordering.');
  const usageKeys = usage.map((descriptor) => {
    if ((descriptor as { readonly version: unknown }).version !== 1 ||
      !sortedUnique(descriptor.artifactIds) || !isJsonSafeValue(descriptor.payload)) {
      invalid('A usage descriptor must be versioned, sorted, and JSON-safe.');
    }
    for (const artifactId of descriptor.artifactIds) {
      if (!artifactIds.has(artifactId)) invalid('A usage descriptor references an artifact outside the current catalog.', { artifactId });
    }
    return [descriptor.targetId, descriptor.kind, '1', JSON.stringify(descriptor.artifactIds), JSON.stringify(canonical(descriptor.payload))].join('\0');
  });
  if (!sortedUnique(usageKeys)) invalid('Generation result usage must have deterministic unique ordering.');
  const diagnosticKeys = diagnostics.map((item) => [item.severity, item.code, item.message].join('\0'));
  if (!sortedUnique(diagnosticKeys)) invalid('Generation result diagnostics must have deterministic unique ordering.');
  return value as GenerationResultV1;
}

export function stableGenerationResultJson(result: GenerationResultV1): string {
  return `${JSON.stringify(canonical(validateGenerationResultV1(result) as unknown as JsonSafeValue))}\n`;
}
