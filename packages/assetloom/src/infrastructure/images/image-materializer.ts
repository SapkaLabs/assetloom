import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { imageRendererCompatibilityVersion } from '@sapkalabs/assetloom-images';
import type {
  ImageInput,
  ImageRecipe,
  RasterImageRecipe,
  RenderImageArtifact,
} from '../../domain/catalog/planning.js';
import { LoomError } from '../../domain/errors.js';
import type {
  CatalogArtifactMaterializer,
  CatalogMaterializationContext,
} from '../../application/execution/contracts.js';
import { sha256 } from '../../storage/hash.js';
import { encodePngIco } from './ico-encoder.js';

const SUPPORTED_EXTENSIONS = new Set([
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
]);

const IMAGE_FINGERPRINT_REVISION = 2;

function rasterRecipeFingerprint(
  recipe: RasterImageRecipe,
  inputOffset: number,
): { readonly value: unknown; readonly nextInputOffset: number } {
  if (recipe.kind === 'resize') {
    return {
      value: {
        kind: recipe.kind,
        input: inputOffset,
        width: recipe.width,
        height: recipe.height,
        fit: recipe.fit,
        background: recipe.background,
      },
      nextInputOffset: inputOffset + 1,
    };
  }
  return {
    value: {
      kind: recipe.kind,
      canvas: recipe.canvas,
      layers: recipe.layers.map((layer, index) => ({
        input: inputOffset + index,
        left: layer.left,
        top: layer.top,
        width: layer.width,
        height: layer.height,
        fit: layer.fit,
        blend: layer.blend,
      })),
    },
    nextInputOffset: inputOffset + recipe.layers.length,
  };
}

function imageRecipeFingerprint(recipe: ImageRecipe): unknown {
  if (recipe.kind !== 'ico') {
    return rasterRecipeFingerprint(recipe, 0).value;
  }
  let inputOffset = 0;
  const images = recipe.images.map((image) => {
    const fingerprint = rasterRecipeFingerprint(image.recipe, inputOffset);
    inputOffset = fingerprint.nextInputOffset;
    return { recipe: fingerprint.value };
  });
  return { kind: recipe.kind, images };
}

function validateSvg(content: Buffer, source: string): void {
  if (!content.toString('utf8').trimStart().startsWith('<')) {
    return;
  }
  const text = content.toString('utf8');
  if (
    /<!ENTITY/i.test(text) ||
    /<script(?:\s|>)/i.test(text) ||
    /(?:href|src)\s*=\s*["'](?:https?:|file:|\\\\|\/)/i.test(text) ||
    /url\(\s*["']?(?:https?:|file:|\\\\|\/)/i.test(text)
  ) {
    throw new LoomError({
      code: 'LOOM_SRC_SECURITY_VIOLATION',
      message: 'SVG source contains a disallowed external reference or script.',
      context: { sourcePath: source },
    });
  }
}

export class ImageArtifactMaterializer
  implements CatalogArtifactMaterializer<RenderImageArtifact>
{
  readonly operation = 'render-image' as const;
  readonly #rendererCompatibilityVersion: string;

  constructor(options: {
    readonly rendererCompatibilityVersion?: string;
  } = {}) {
    this.#rendererCompatibilityVersion =
      options.rendererCompatibilityVersion ?? imageRendererCompatibilityVersion;
  }

  async materialize(
    artifact: RenderImageArtifact,
    context: CatalogMaterializationContext,
  ): Promise<{
    readonly content: Uint8Array;
    readonly width: number;
    readonly height: number;
  }> {
    const inputs = await this.#inputs(artifact, context);
    const parameters = JSON.stringify({
      renderer: {
        compatibilityVersion: this.#rendererCompatibilityVersion,
        fingerprintRevision: IMAGE_FINGERPRINT_REVISION,
      },
      presetVersion: artifact.presetVersion,
      output: {
        format: artifact.format,
        quality: artifact.quality,
      },
      recipe: imageRecipeFingerprint(artifact.recipe),
      inputs: inputs.map((input) => sha256(input)),
    });
    const alias = sha256(parameters);
    const cachedKey = await context.cache.getAlias(alias);
    if (cachedKey !== undefined) {
      const cached = await context.cache.get(cachedKey);
      if (cached === undefined) {
        throw new LoomError({
          code: 'LOOM_CACHE_CORRUPT',
          message: 'Catalog image cache index points to missing content.',
          context: { taskId: artifact.id, cacheKey: cachedKey },
        });
      }
      return this.#withDimensions(artifact, cached);
    }

    const output = await this.#render(artifact, inputs);
    const outputKey = await context.cache.put(output);
    await context.cache.putAlias(alias, Buffer.from(outputKey, 'ascii'));
    return this.#withDimensions(artifact, output);
  }

  async #withDimensions(artifact: RenderImageArtifact, content: Uint8Array): Promise<{
    readonly content: Uint8Array;
    readonly width: number;
    readonly height: number;
  }> {
    if (artifact.format === 'ico') {
      if (artifact.width === undefined || artifact.height === undefined) {
        throw new LoomError({
          code: 'LOOM_PLAN_INVALID',
          message: 'ICO artifacts require explicit width and height.',
          context: { taskId: artifact.id },
        });
      }
      return { content, width: artifact.width, height: artifact.height };
    }
    const metadata = await sharp(content).metadata();
    return { content, width: metadata.width, height: metadata.height };
  }

  async #inputs(
    artifact: RenderImageArtifact,
    context: CatalogMaterializationContext,
  ): Promise<readonly Buffer[]> {
    if (artifact.recipe.kind === 'ico') {
      const recipeInputs = artifact.recipe.images.flatMap((entry) =>
        entry.recipe.kind === 'resize'
          ? [entry.recipe.input]
          : entry.recipe.layers.map((layer) => layer.input),
      );
      return Promise.all(recipeInputs.map((input) => this.#input(input, context)));
    }
    if (artifact.recipe.kind === 'resize') {
      return [await this.#input(artifact.recipe.input, context)];
    }
    return Promise.all(
      artifact.recipe.layers.map((layer) => this.#input(layer.input, context)),
    );
  }

  async #input(
    input: ImageInput,
    context: CatalogMaterializationContext,
  ): Promise<Buffer> {
    if (input.kind === 'artifact-output') {
      return Buffer.from(context.outputs.get(input.artifactId).content);
    }
    if (input.kind === 'inline-svg') {
      const content = Buffer.from(input.content, 'utf8');
      validateSvg(content, 'inline SVG');
      return content;
    }
    const extension = path.extname(input.path).toLocaleLowerCase('en-US');
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new LoomError({
        code: 'LOOM_SRC_UNSUPPORTED',
        message: `Source format "${extension || '(none)'}" is not supported.`,
        context: { sourcePath: input.path },
      });
    }
    const content = await readFile(input.path);
    if (extension === '.svg') {
      validateSvg(content, input.path);
    }
    return content;
  }

  async #render(
    artifact: RenderImageArtifact,
    inputs: readonly Buffer[],
  ): Promise<Buffer> {
    if (artifact.recipe.kind === 'ico') {
      let offset = 0;
      const pngs: Buffer[] = [];
      for (const [index, entry] of artifact.recipe.images.entries()) {
        const inputCount =
          entry.recipe.kind === 'resize' ? 1 : entry.recipe.layers.length;
        const recipeInputs = inputs.slice(offset, offset + inputCount);
        if (recipeInputs.length !== inputCount) {
          throw new LoomError({
            code: 'LOOM_PLAN_INVALID',
            message: 'ICO image recipe has a missing input.',
            context: { taskId: artifact.id, image: index },
          });
        }
        pngs.push(await this.#renderRaster(entry.recipe, recipeInputs, 'png'));
        offset += inputCount;
      }
      return encodePngIco(pngs);
    }
    if (artifact.format === 'ico') {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'ICO output requires an ICO image recipe.',
        context: { taskId: artifact.id },
      });
    }
    return this.#renderRaster(
      artifact.recipe,
      inputs,
      artifact.format,
      artifact.quality,
    );
  }

  async #renderRaster(
    recipe: RasterImageRecipe,
    inputs: readonly Buffer[],
    format: 'png' | 'webp' | 'jpeg',
    quality?: number,
  ): Promise<Buffer> {
    let pipeline: Sharp;
    if (recipe.kind === 'resize') {
      const input = inputs[0];
      if (input === undefined) {
        throw new LoomError({
          code: 'LOOM_PLAN_INVALID',
          message: 'Resize image recipe has no input.',
        });
      }
      pipeline = sharp(input, {
        failOn: 'error',
        limitInputPixels: 100_000_000,
      })
        .timeout({ seconds: 30 })
        .rotate()
        .resize(recipe.width, recipe.height, {
          fit: recipe.fit,
          background: recipe.background ?? '#00000000',
        });
    } else {
      const layers = await Promise.all(
        recipe.layers.map(async (layer, index) => {
          const input = inputs[index];
          if (input === undefined) {
            throw new LoomError({
              code: 'LOOM_PLAN_INVALID',
              message: 'Composite image recipe has a missing input.',
              context: { layer: index },
            });
          }
          const resized = await sharp(input, {
            failOn: 'error',
            limitInputPixels: 100_000_000,
          })
            .timeout({ seconds: 30 })
            .resize(layer.width, layer.height, {
              fit: layer.fit,
              background: '#00000000',
            })
            .png()
            .toBuffer();
          return {
            input: resized,
            left: layer.left,
            top: layer.top,
            blend: layer.blend ?? 'over',
          };
        }),
      );
      pipeline = sharp({
        create: {
          width: recipe.canvas.width,
          height: recipe.canvas.height,
          channels: 4,
          background: recipe.canvas.background,
        },
      }).composite(layers);
    }
    switch (format) {
      case 'png':
        return pipeline
          .png({ adaptiveFiltering: false, compressionLevel: 9, palette: false })
          .toBuffer();
      case 'webp':
        return pipeline.webp({ quality: quality ?? 100 }).toBuffer();
      case 'jpeg':
        return pipeline
          .flatten({ background: '#FFFFFF' })
          .jpeg({ quality: quality ?? 90 })
          .toBuffer();
    }
  }
}
