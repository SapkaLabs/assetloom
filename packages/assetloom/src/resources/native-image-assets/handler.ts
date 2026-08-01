import path from 'node:path';
import type { ResourceHandler } from '../../application/planning/contracts.js';
import type {
  CatalogPlannedArtifact,
  RenderImageArtifact,
  WriteTextArtifact,
} from '../../domain/catalog/planning.js';
import type {
  IosImageScale,
  NativeImageAssetsResource,
} from '../../domain/catalog/resources.js';
import type { ResolvedSource } from '../../domain/catalog/sources.js';
import { LoomError } from '../../domain/errors.js';
import { compareCodePoints } from '../../domain/ordering.js';
import { baseNameWithoutExtension, resolveTargetPath } from '../shared/paths.js';

const PRESET_VERSION = 'native-image-assets-v1';
const ANDROID_DENSITY_PATTERN =
  /^(?:ldpi|mdpi|tvdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)$/u;
const ANDROID_RESOURCE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/u;
const SUPPORTED_SOURCE_EXTENSIONS = new Set([
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
]);

function assertDimension(width: number, context: Readonly<Record<string, unknown>>): void {
  if (!Number.isSafeInteger(width) || width <= 0 || width > 16_384) {
    throw new LoomError({
      code: 'LOOM_RENDER_DIMENSION_INVALID',
      message: 'Native image widths must be positive safe integers up to 16384.',
      context: { ...context, width },
    });
  }
}

function assertUnique<T>(
  values: readonly T[],
  select: (value: T) => string,
  label: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = select(value);
    if (seen.has(key)) {
      throw new LoomError({
        code: 'LOOM_PLAN_COLLISION',
        message: `Native image ${label} entries must be unique.`,
        context: { [label]: key },
      });
    }
    seen.add(key);
  }
}

function outputExtension(format: NativeImageAssetsResource['format']): string {
  return format === 'jpeg' ? 'jpg' : format;
}

function imageName(source: ResolvedSource): string {
  return baseNameWithoutExtension(source.relativePath);
}

function preferredSourceExtensions(
  format: NativeImageAssetsResource['format'],
): ReadonlySet<string> {
  return new Set(format === 'jpeg' ? ['.jpg', '.jpeg'] : [`.${format}`]);
}

function selectDistinctSources(
  sources: readonly ResolvedSource[],
  resource: NativeImageAssetsResource,
): readonly ResolvedSource[] {
  const grouped = new Map<string, ResolvedSource[]>();
  for (const source of sources) {
    const key = imageName(source).toLocaleLowerCase('en-US');
    const group = grouped.get(key) ?? [];
    group.push(source);
    grouped.set(key, group);
  }
  const selected: ResolvedSource[] = [];
  for (const [name, candidates] of grouped) {
    if (candidates.length === 1) {
      const candidate = candidates[0];
      if (candidate !== undefined) {
        selected.push(candidate);
      }
      continue;
    }
    if (resource.onNameCollision === 'prefer-output-format') {
      const preferredExtensions = preferredSourceExtensions(resource.format);
      const preferred = candidates.filter((candidate) =>
        preferredExtensions.has(
          path.extname(candidate.relativePath).toLocaleLowerCase('en-US'),
        ),
      );
      if (preferred.length === 1) {
        const candidate = preferred[0];
        if (candidate !== undefined) {
          selected.push(candidate);
          continue;
        }
      }
    }
    throw new LoomError({
      code: 'LOOM_PLAN_COLLISION',
      message: `Multiple native image sources resolve to the name "${name}".`,
      context: {
        imageName: name,
        onNameCollision: resource.onNameCollision ?? 'error',
        sourcePaths: candidates.map((candidate) => candidate.absolutePath),
      },
    });
  }
  return selected;
}

function imageArtifact(options: {
  readonly destination: string;
  readonly format: NativeImageAssetsResource['format'];
  readonly id: string;
  readonly quality?: number;
  readonly resourceId: string;
  readonly source: ResolvedSource;
  readonly target: RenderImageArtifact['target'];
  readonly width: number;
}): RenderImageArtifact {
  return {
    id: options.id,
    resourceId: options.resourceId,
    resourceType: 'native-image-assets',
    target: options.target,
    operation: 'render-image',
    ownership: 'generated',
    publication: { mode: 'stable' },
    dependsOn: [],
    sourceDependencies: [options.source.absolutePath],
    destination: options.destination,
    presetVersion: PRESET_VERSION,
    width: options.width,
    format: options.format,
    ...(options.quality === undefined ? {} : { quality: options.quality }),
    recipe: {
      kind: 'resize',
      input: { kind: 'source', path: options.source.absolutePath },
      width: options.width,
      fit: 'inside',
    },
  };
}

function iosContents(name: string, scales: readonly IosImageScale[], extension: string): string {
  return JSON.stringify(
    {
      images: scales.map(({ scale }) => ({
        idiom: 'universal',
        scale,
        filename: `${name}${scale === '1x' ? '' : `@${scale}`}.${extension}`,
      })),
      info: {
        version: 1,
        author: 'xcode',
      },
    },
    null,
    2,
  );
}

export class NativeImageAssetsResourceHandler
  implements ResourceHandler<NativeImageAssetsResource>
{
  readonly type = 'native-image-assets' as const;

  validate(resource: NativeImageAssetsResource): void {
    const { android, ios } = resource.output;
    if (android === undefined && ios === undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'Native image assets require an Android or iOS output.',
      });
    }
    if (resource.quality !== undefined && (
      !Number.isSafeInteger(resource.quality) ||
      resource.quality < 1 ||
      resource.quality > 100
    )) {
      throw new LoomError({
        code: 'LOOM_RENDER_FAILED',
        message: 'Native image quality must be an integer from 1 through 100.',
        context: { quality: resource.quality },
      });
    }
    if (android !== undefined) {
      if (android.densities.length === 0) {
        throw new LoomError({
          code: 'LOOM_PLAN_INVALID',
          message: 'Android native image assets require at least one density.',
        });
      }
      assertUnique(android.densities, ({ density }) => density, 'density');
      for (const density of android.densities) {
        if (!ANDROID_DENSITY_PATTERN.test(density.density)) {
          throw new LoomError({
            code: 'LOOM_ANDROID_RESOURCE_INVALID',
            message: `Unsupported Android image density "${density.density}".`,
            context: { density: density.density },
          });
        }
        assertDimension(density.width, { density: density.density });
      }
    }
    if (ios !== undefined) {
      if (resource.format === 'webp') {
        throw new LoomError({
          code: 'LOOM_RENDER_FORMAT_UNSUPPORTED',
          message: 'iOS asset catalogs do not support WebP native image assets.',
          context: { format: resource.format },
        });
      }
      if (ios.scales.length === 0) {
        throw new LoomError({
          code: 'LOOM_PLAN_INVALID',
          message: 'iOS native image assets require at least one scale.',
        });
      }
      assertUnique(ios.scales, ({ scale }) => scale, 'scale');
      for (const scale of ios.scales) {
        assertDimension(scale.width, { scale: scale.scale });
      }
    }
  }

  async plan(
    resourceId: string,
    resource: NativeImageAssetsResource,
    context: Parameters<ResourceHandler<NativeImageAssetsResource>['plan']>[2],
  ): Promise<readonly CatalogPlannedArtifact[]> {
    const resolvedSources = [
      ...(await context.sourceResolver.resolve(
        resource.source,
        `/resources/${resourceId}/source`,
      )),
    ].sort((left, right) => compareCodePoints(left.relativePath, right.relativePath));
    const sources = selectDistinctSources(resolvedSources, resource);
    const target = context.resolveTarget(resource.output.target);
    if (target.kind !== 'react-native-app') {
      throw new LoomError({
        code: 'LOOM_PLAN_TARGET_UNSUPPORTED',
        message: 'Native image assets require a react-native-app target.',
        context: { target: target.id, targetKind: target.kind },
      });
    }
    const extension = outputExtension(resource.format);
    const artifacts: CatalogPlannedArtifact[] = [];

    sources.forEach((source, sourceIndex) => {
      const sourceExtension = path.extname(source.relativePath).toLocaleLowerCase('en-US');
      if (!SUPPORTED_SOURCE_EXTENSIONS.has(sourceExtension)) {
        throw new LoomError({
          code: 'LOOM_SRC_UNSUPPORTED',
          message: `Source format "${sourceExtension || '(none)'}" is not supported.`,
          context: { sourcePath: source.absolutePath },
        });
      }
      const name = imageName(source);
      const android = resource.output.android;
      if (android !== undefined) {
        if (!ANDROID_RESOURCE_NAME_PATTERN.test(name)) {
          throw new LoomError({
            code: 'LOOM_ANDROID_RESOURCE_INVALID',
            message: `Invalid Android image resource name "${name}".`,
            context: { resourceName: name, sourcePath: source.absolutePath },
          });
        }
        const resourceDirectory = resolveTargetPath(
          target.root,
          android.resourceDirectory,
          `/resources/${resourceId}/output/android/resourceDirectory`,
        );
        android.densities.forEach((density, densityIndex) => {
          artifacts.push(imageArtifact({
            id: `${resourceId}:${target.id}:android:${sourceIndex}:${densityIndex}`,
            resourceId,
            target: target.id,
            source,
            destination: resolveTargetPath(
              resourceDirectory,
              path.join(`drawable-${density.density}`, `${name}.${extension}`),
              `/resources/${resourceId}/output/android/densities/${densityIndex}`,
            ),
            width: density.width,
            format: resource.format,
            ...(resource.quality === undefined ? {} : { quality: resource.quality }),
          }));
        });
      }

      const ios = resource.output.ios;
      if (ios !== undefined) {
        const catalogDirectory = resolveTargetPath(
          target.root,
          ios.assetCatalogDirectory,
          `/resources/${resourceId}/output/ios/assetCatalogDirectory`,
        );
        const imagesetDirectory = resolveTargetPath(
          catalogDirectory,
          `${name}.imageset`,
          `/resources/${resourceId}/output/ios/assetCatalogDirectory`,
        );
        const imageIds: string[] = [];
        ios.scales.forEach((scale, scaleIndex) => {
          const id = `${resourceId}:${target.id}:ios:${sourceIndex}:${scaleIndex}`;
          imageIds.push(id);
          artifacts.push(imageArtifact({
            id,
            resourceId,
            target: target.id,
            source,
            destination: resolveTargetPath(
              imagesetDirectory,
              `${name}${scale.scale === '1x' ? '' : `@${scale.scale}`}.${extension}`,
              `/resources/${resourceId}/output/ios/scales/${scaleIndex}`,
            ),
            width: scale.width,
            format: resource.format,
            ...(resource.quality === undefined ? {} : { quality: resource.quality }),
          }));
        });
        artifacts.push({
          id: `${resourceId}:${target.id}:ios:${sourceIndex}:contents`,
          resourceId,
          resourceType: 'native-image-assets',
          target: target.id,
          operation: 'write-text',
          ownership: 'generated',
          publication: { mode: 'stable' },
          dependsOn: imageIds,
          sourceDependencies: [source.absolutePath],
          destination: resolveTargetPath(
            imagesetDirectory,
            'Contents.json',
            `/resources/${resourceId}/output/ios/assetCatalogDirectory`,
          ),
          presetVersion: PRESET_VERSION,
          content: iosContents(name, ios.scales, extension),
          encoding: 'utf8',
        } satisfies WriteTextArtifact);
      }
    });

    return artifacts;
  }
}
