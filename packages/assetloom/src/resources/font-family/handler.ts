import path from 'node:path';
import type {
  PlanningContext,
  ResourceHandler,
} from '../../application/planning/contracts.js';
import type {
  CopyFileArtifact,
  WriteTextArtifact,
} from '../../domain/catalog/planning.js';
import type {
  FontFaceDefinition,
  FontFamilyResource,
  FontFormat,
} from '../../domain/catalog/resources.js';
import { LoomError } from '../../domain/errors.js';
import { resolveTargetPath } from '../shared/paths.js';
import { fontStylesheet, type ResolvedFontFace } from './css.js';

const FONT_PRESET_VERSION = 'font-family-v1';
const FONT_FORMATS = new Set<FontFormat>(['ttf', 'otf', 'woff', 'woff2']);

function inferredFormat(
  face: FontFaceDefinition,
  filename: string,
  resourceId: string,
): FontFormat {
  const extension = path.extname(filename).slice(1).toLowerCase();
  if (!FONT_FORMATS.has(extension as FontFormat)) {
    throw new LoomError({
      code: 'LOOM_SRC_UNSUPPORTED',
      message: 'Unsupported font source format.',
      context: { resourceId, sourcePath: filename, format: extension },
    });
  }
  const detected = extension as FontFormat;
  if (face.format !== undefined && face.format !== detected) {
    throw new LoomError({
      code: 'LOOM_SRC_INVALID',
      message: 'Configured font format does not match the source extension.',
      context: {
        resourceId,
        sourcePath: filename,
        configuredFormat: face.format,
        detectedFormat: detected,
      },
    });
  }
  return face.format ?? detected;
}

export class FontFamilyResourceHandler
implements ResourceHandler<FontFamilyResource> {
  readonly type = 'font-family' as const;

  validate(resource: FontFamilyResource): void {
    const aliases = new Set<string>();
    for (const face of resource.faces) {
      if (aliases.has(face.alias)) {
        throw new LoomError({
          code: 'LOOM_PLAN_INVALID',
          message: 'Font face aliases must be unique within a family.',
          context: { family: resource.family, alias: face.alias },
        });
      }
      aliases.add(face.alias);
    }
    for (const output of resource.outputs) {
      if (output.directory === undefined && output.stylesheet === undefined) {
        throw new LoomError({
          code: 'LOOM_PLAN_INVALID',
          message: 'A font output must emit font files or a stylesheet.',
          context: { family: resource.family, target: output.target },
        });
      }
      if (output.stylesheet !== undefined && output.directory === undefined) {
        throw new LoomError({
          code: 'LOOM_PLAN_INVALID',
          message: 'A font stylesheet output requires a font output directory.',
          context: { family: resource.family, target: output.target },
        });
      }
    }
  }

  async plan(
    resourceId: string,
    resource: FontFamilyResource,
    context: PlanningContext,
  ): Promise<readonly (CopyFileArtifact | WriteTextArtifact)[]> {
    const resolvedFaces = await Promise.all(
      resource.faces.map(async (definition, faceIndex) => {
        const sources = await context.sourceResolver.resolve(
          definition.source,
          `/resources/${resourceId}/faces/${faceIndex}/source`,
        );
        if (sources.length !== 1) {
          throw new LoomError({
            code: 'LOOM_PLAN_INVALID',
            message: 'Each font face must resolve to exactly one source file.',
            context: { resourceId, faceIndex, sources: sources.length },
          });
        }
        const source = sources[0];
        if (source === undefined) {
          throw new LoomError({
            code: 'LOOM_INTERNAL',
            message: 'Resolved font source is unexpectedly missing.',
          });
        }
        return {
          definition,
          source: source.absolutePath,
          fileName: path.basename(source.absolutePath),
          format: inferredFormat(definition, source.absolutePath, resourceId),
        };
      }),
    );

    const artifacts: Array<CopyFileArtifact | WriteTextArtifact> = [];
    resource.outputs.forEach((output, outputIndex) => {
      const target = context.resolveTarget(output.target);
      const outputDirectory =
        output.directory === undefined
          ? undefined
          : resolveTargetPath(
              target.root,
              output.directory,
              `/resources/${resourceId}/outputs/${outputIndex}/directory`,
            );
      const publishedFaces: ResolvedFontFace[] = [];
      const copyArtifacts: CopyFileArtifact[] = [];
      if (outputDirectory !== undefined) {
        resolvedFaces.forEach((face, faceIndex) => {
          const destination = resolveTargetPath(
            outputDirectory,
            face.fileName,
            `/resources/${resourceId}/outputs/${outputIndex}/directory`,
          );
          publishedFaces.push({
            definition: face.definition,
            source: face.source,
            destination,
            format: face.format,
          });
          const copyArtifact: CopyFileArtifact = {
            id: `${resourceId}:${output.target}:font:${outputIndex}:${faceIndex}`,
            resourceId,
            resourceType: 'font-family',
            target: target.id,
            operation: 'copy-file',
            ownership: 'generated',
            publication: { mode: 'stable' },
            dependsOn: [],
            sourceDependencies: [face.source],
            source: face.source,
            destination,
            presetVersion: FONT_PRESET_VERSION,
          };
          copyArtifacts.push(copyArtifact);
          artifacts.push(copyArtifact);
        });
      }
      if (output.stylesheet !== undefined) {
        const stylesheetPath = resolveTargetPath(
          target.root,
          output.stylesheet,
          `/resources/${resourceId}/outputs/${outputIndex}/stylesheet`,
        );
        artifacts.push({
          id: `${resourceId}:${output.target}:stylesheet:${outputIndex}`,
          resourceId,
          resourceType: 'font-family',
          target: target.id,
          operation: 'write-text',
          ownership: 'generated',
          publication: { mode: 'stable' },
          dependsOn: copyArtifacts.map((artifact) => artifact.id),
          sourceDependencies: publishedFaces.map((face) => face.source),
          destination: stylesheetPath,
          presetVersion: FONT_PRESET_VERSION,
          content: fontStylesheet(stylesheetPath, publishedFaces),
          encoding: 'utf8',
        });
      }
    });
    return artifacts;
  }
}
