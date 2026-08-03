import path from 'node:path';
import type {
  RenderImageArtifact,
} from '../../domain/catalog/planning.js';
import type { ImageVariantsResource } from '../../domain/catalog/resources.js';
import { LoomError } from '../../domain/errors.js';
import type {
  PlanningContext,
  ResourceHandler,
} from '../../application/planning/contracts.js';

function destinationInside(root: string, configuredPath: string): string {
  const destination = path.resolve(root, configuredPath);
  const relative = path.relative(root, destination);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new LoomError({
      code: 'LOOM_CFG_PATH_INVALID',
      message: 'Image output resolves outside its target root.',
      context: { targetRoot: root, path: configuredPath },
    });
  }
  return destination;
}

export class ImageVariantsResourceHandler
  implements ResourceHandler<ImageVariantsResource>
{
  readonly type = 'image-variants' as const;

  validate(resource: ImageVariantsResource): void {
    if (resource.outputs.length === 0) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'Image variants resource requires at least one output.',
      });
    }
    for (const output of resource.outputs) {
      if (
        !Number.isSafeInteger(output.width) ||
        !Number.isSafeInteger(output.height) ||
        output.width <= 0 ||
        output.height <= 0
      ) {
        throw new LoomError({
          code: 'LOOM_RENDER_DIMENSION_INVALID',
          message: 'Image variant dimensions must be positive safe integers.',
          context: { width: output.width, height: output.height },
        });
      }
    }
  }

  async plan(
    resourceId: string,
    resource: ImageVariantsResource,
    context: PlanningContext,
  ): Promise<readonly RenderImageArtifact[]> {
    const sources = await context.sourceResolver.resolve(
      resource.source,
      `/resources/${resourceId}/source`,
    );
    if (sources.length !== 1) {
      throw new LoomError({
        code: 'LOOM_SRC_INVALID',
        message: 'Image variants require exactly one resolved source.',
        context: { resourceId, sourceCount: sources.length },
      });
    }
    const source = sources[0];
    if (source === undefined) {
      throw new LoomError({
        code: 'LOOM_SRC_NOT_FOUND',
        message: 'Image variant source was not found.',
        context: { resourceId },
      });
    }

    return resource.outputs.map((output, index) => {
      const target = context.resolveTarget(output.target);
      const destination = destinationInside(target.root, output.path);
      const id = `${resourceId}:${target.id}:image:${index}`;
      return {
        id,
        resourceId,
        resourceType: 'image-variants',
        target: target.id,
        operation: 'render-image',
        ownership: 'generated',
        publication: { mode: 'stable' },
        dependsOn: [],
        sourceDependencies: [source.absolutePath],
        destination,
        presetVersion: 'image-variants-v1',
        width: output.width,
        height: output.height,
        format: output.format,
        ...(output.quality === undefined ? {} : { quality: output.quality }),
        recipe:
          output.format === 'ico'
            ? {
                kind: 'ico',
                images: [
                  {
                    recipe: {
                      kind: 'resize',
                      input: { kind: 'source', path: source.absolutePath },
                      width: output.width,
                      height: output.height,
                      fit: output.fit ?? 'contain',
                      ...(output.background === undefined
                        ? {}
                        : { background: output.background }),
                    },
                  },
                ],
              }
            : {
                kind: 'resize',
                input: { kind: 'source', path: source.absolutePath },
                width: output.width,
                height: output.height,
                fit: output.fit ?? 'contain',
                ...(output.background === undefined
                  ? {}
                  : { background: output.background }),
              },
      } satisfies RenderImageArtifact;
    });
  }
}
