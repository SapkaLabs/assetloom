import path from 'node:path';
import type { ResourceHandler } from '../../application/planning/contracts.js';
import type { CopyFileArtifact } from '../../domain/catalog/planning.js';
import type { FilesResource } from '../../domain/catalog/resources.js';
import type { ResolvedSource } from '../../domain/catalog/sources.js';
import { LoomError } from '../../domain/errors.js';
import {
  baseNameWithoutExtension,
  extensionWithoutDot,
  resolveTargetPath,
} from '../shared/paths.js';

const FILES_PRESET_VERSION = 'files-v1';

function outputRelativePath(
  template: string | undefined,
  source: ResolvedSource,
): string {
  if (template === undefined) {
    return source.relativePath;
  }
  return template
    .replaceAll('{relativePath}', source.relativePath)
    .replaceAll('{fileName}', path.basename(source.relativePath))
    .replaceAll('{baseName}', baseNameWithoutExtension(source.relativePath))
    .replaceAll('{extension}', extensionWithoutDot(source.relativePath));
}

export class FilesResourceHandler implements ResourceHandler<FilesResource> {
  readonly type = 'files' as const;

  validate(resource: FilesResource): void {
    if (resource.outputs.length === 0) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'A files resource requires at least one output.',
      });
    }
  }

  async plan(
    resourceId: string,
    resource: FilesResource,
    context: Parameters<ResourceHandler<FilesResource>['plan']>[2],
  ): Promise<readonly CopyFileArtifact[]> {
    const sources = await context.sourceResolver.resolve(
      resource.source,
      `/resources/${resourceId}/source`,
    );
    const artifacts: CopyFileArtifact[] = [];
    resource.outputs.forEach((output, outputIndex) => {
      const target = context.resolveTarget(output.target);
      const directory = resolveTargetPath(
        target.root,
        output.directory,
        `/resources/${resourceId}/outputs/${outputIndex}/directory`,
      );
      sources.forEach((source, sourceIndex) => {
        const relativePath = outputRelativePath(output.path, source);
        const destination = resolveTargetPath(
          directory,
          relativePath,
          `/resources/${resourceId}/outputs/${outputIndex}/path`,
        );
        artifacts.push({
          id: `${resourceId}:${output.target}:file:${outputIndex}:${sourceIndex}`,
          resourceId,
          resourceType: 'files',
          target: target.id,
          operation: 'copy-file',
          ownership: 'generated',
          publication: { mode: 'stable' },
          dependsOn: [],
          sourceDependencies: [source.absolutePath],
          source: source.absolutePath,
          destination,
          presetVersion: FILES_PRESET_VERSION,
        });
      });
    });
    return artifacts;
  }
}
