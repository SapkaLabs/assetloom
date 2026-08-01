import path from 'node:path';
import type {
  PlanningContext,
  ResourceHandler,
} from '../../application/planning/contracts.js';
import type {
  TransformSvgArtifact,
  WriteTextArtifact,
} from '../../domain/catalog/planning.js';
import type {
  SvgComponentsResource,
} from '../../domain/catalog/resources.js';
import { LoomError } from '../../domain/errors.js';
import { compareCodePoints } from '../../domain/ordering.js';
import { resolveTargetPath } from '../shared/paths.js';
import { SvgComponentPresetRegistry } from './presets.js';

function barrelContent(
  components: readonly TransformSvgArtifact[],
  directory: string,
): string {
  return `${[...components]
    .sort(
      (left, right) =>
        compareCodePoints(left.componentName, right.componentName) ||
        compareCodePoints(left.destination, right.destination),
    )
    .map((component) => {
      const relative = path
        .relative(directory, component.destination)
        .split(path.sep)
        .join('/')
        .replace(/\.tsx$/u, '');
      const specifier = relative.startsWith('.') ? relative : `./${relative}`;
      return `export { default as ${component.componentName} } from '${specifier}';`;
    })
    .join('\n')}\n`;
}

export class SvgComponentsResourceHandler
implements ResourceHandler<SvgComponentsResource> {
  readonly type = 'svg-components' as const;
  readonly #presets: SvgComponentPresetRegistry;

  constructor(presets = new SvgComponentPresetRegistry()) {
    this.#presets = presets;
  }

  validate(resource: SvgComponentsResource): void {
    for (const output of resource.outputs) {
      this.#presets.get(output.preset);
    }
  }

  async plan(
    resourceId: string,
    resource: SvgComponentsResource,
    context: PlanningContext,
  ): Promise<readonly (TransformSvgArtifact | WriteTextArtifact)[]> {
    const sources = await context.sourceResolver.resolve(
      resource.source,
      `/resources/${resourceId}/source`,
    );
    const artifacts: Array<TransformSvgArtifact | WriteTextArtifact> = [];
    resource.outputs.forEach((output, outputIndex) => {
      const target = context.resolveTarget(output.target);
      const directory = resolveTargetPath(
        target.root,
        output.directory,
        `/resources/${resourceId}/outputs/${outputIndex}/directory`,
      );
      const preset = this.#presets.get(output.preset);
      const outputArtifacts: TransformSvgArtifact[] = [];
      sources.forEach((source, sourceIndex) => {
        if (path.extname(source.absolutePath).toLowerCase() !== '.svg') {
          throw new LoomError({
            code: 'LOOM_SRC_UNSUPPORTED',
            message: 'svg-components sources must be SVG files.',
            context: { sourcePath: source.absolutePath, resourceId },
          });
        }
        const names = preset.planName(
          source,
          output.naming,
          output.componentNaming,
        );
        const artifact: TransformSvgArtifact = {
          id: `${resourceId}:${output.target}:svg:${outputIndex}:${sourceIndex}`,
          resourceId,
          resourceType: 'svg-components',
          target: target.id,
          operation: 'transform-svg',
          ownership: 'generated',
          publication: { mode: 'stable' },
          dependsOn: [],
          sourceDependencies: [source.absolutePath],
          source: source.absolutePath,
          destination: resolveTargetPath(
            directory,
            names.relativePath,
            `/resources/${resourceId}/outputs/${outputIndex}/directory`,
          ),
          presetVersion: preset.version,
          runtime: output.runtime,
          preset: output.preset,
          componentName: names.componentName,
        };
        outputArtifacts.push(artifact);
        artifacts.push(artifact);
      });
      if (output.generateBarrel === true) {
        const componentNames = new Set<string>();
        for (const artifact of outputArtifacts) {
          if (componentNames.has(artifact.componentName)) {
            throw new LoomError({
              code: 'LOOM_PLAN_COLLISION',
              message: 'SVG barrel exports require unique component names.',
              context: {
                resourceId,
                target: output.target,
                componentName: artifact.componentName,
              },
            });
          }
          componentNames.add(artifact.componentName);
        }
        artifacts.push({
          id: `${resourceId}:${output.target}:barrel:${outputIndex}`,
          resourceId,
          resourceType: 'svg-components',
          target: target.id,
          operation: 'write-text',
          ownership: 'generated',
          publication: { mode: 'stable' },
          dependsOn: outputArtifacts.map((artifact) => artifact.id),
          sourceDependencies: outputArtifacts.flatMap(
            (artifact) => artifact.sourceDependencies,
          ),
          destination: resolveTargetPath(
            directory,
            'index.ts',
            `/resources/${resourceId}/outputs/${outputIndex}/directory`,
          ),
          presetVersion: preset.version,
          content: barrelContent(outputArtifacts, directory),
          encoding: 'utf8',
        });
      }
    });
    return artifacts;
  }
}
