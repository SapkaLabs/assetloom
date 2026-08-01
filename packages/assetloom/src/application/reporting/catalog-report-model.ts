import { compareCodePoints } from '../../domain/ordering.js';

export type CatalogReportStatus =
  | 'valid'
  | 'modified'
  | 'missing'
  | 'untracked';

export interface CatalogReportArtifact {
  readonly actualSha256?: string;
  readonly bytes?: number;
  readonly destination: string;
  readonly expectedSha256?: string;
  readonly id: string;
  readonly operation: string;
  readonly ownership: 'generated' | 'project-integration';
  readonly publicPath?: string;
  readonly resourceId: string;
  readonly resourceType: string;
  readonly sourceDependencies: readonly string[];
  readonly status: CatalogReportStatus;
  readonly target: string;
}

export interface CatalogReportResource {
  readonly artifacts: readonly CatalogReportArtifact[];
  readonly id: string;
  readonly issues: number;
  readonly targets: readonly string[];
  readonly type: string;
}

export interface CatalogReportModel {
  readonly configurationFiles: readonly string[];
  readonly configurationFingerprint: string;
  readonly configurationName: string;
  readonly effectiveConfiguration: string;
  readonly issues: number;
  readonly outputs: number;
  readonly resources: readonly CatalogReportResource[];
  readonly targets: readonly string[];
}

export function createCatalogReportModel(options: {
  readonly artifacts: readonly CatalogReportArtifact[];
  readonly configurationFiles: readonly string[];
  readonly configurationFingerprint: string;
  readonly configurationName: string;
  readonly effectiveConfiguration: string;
  readonly targets: readonly string[];
}): CatalogReportModel {
  const groups = new Map<string, CatalogReportArtifact[]>();
  for (const artifact of options.artifacts) {
    const key = JSON.stringify([artifact.resourceId, artifact.resourceType]);
    const group = groups.get(key) ?? [];
    group.push(artifact);
    groups.set(key, group);
  }
  const resources: CatalogReportResource[] = [];
  for (const artifacts of groups.values()) {
    const first = artifacts[0];
    if (first === undefined) {
      continue;
    }
    const ordered = [...artifacts].sort((left, right) =>
      compareCodePoints(left.destination, right.destination),
    );
    resources.push({
      id: first.resourceId,
      type: first.resourceType,
      artifacts: ordered,
      targets: [...new Set(ordered.map((artifact) => artifact.target))].sort(
        compareCodePoints,
      ),
      issues: ordered.filter((artifact) => artifact.status !== 'valid').length,
    });
  }
  resources.sort((left, right) => compareCodePoints(left.id, right.id));
  return {
    configurationFiles: options.configurationFiles,
    configurationFingerprint: options.configurationFingerprint,
    configurationName: options.configurationName,
    effectiveConfiguration: options.effectiveConfiguration,
    targets: options.targets,
    resources,
    outputs: options.artifacts.length,
    issues: options.artifacts.filter((artifact) => artifact.status !== 'valid')
      .length,
  };
}
