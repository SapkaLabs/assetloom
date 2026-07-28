import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { LoomError } from '../domain/errors.js';
import type { GenerationTask } from '../domain/types.js';
import type { ContentCache } from '../storage/cache.js';
import { sha256 } from '../storage/hash.js';

const SUPPORTED_SOURCE_EXTENSIONS = new Set(['.png', '.svg', '.webp']);

function validateSvg(source: Buffer, sourcePath: string): void {
  if (path.extname(sourcePath).toLowerCase() !== '.svg') {
    return;
  }
  const text = source.toString('utf8');
  const unsafe =
    /<!ENTITY/i.test(text) ||
    /<script(?:\s|>)/i.test(text) ||
    /(?:href|src)\s*=\s*["'](?:https?:|file:|\\\\|\/)/i.test(text) ||
    /url\(\s*["']?(?:https?:|file:|\\\\|\/)/i.test(text);
  if (unsafe) {
    throw new LoomError({
      code: 'LOOM_SRC_SECURITY_VIOLATION',
      message: 'SVG source contains a disallowed external reference or script.',
      context: { sourcePath },
    });
  }
}

export class SharpRenderer {
  readonly #cache: ContentCache;

  constructor(cache: ContentCache) {
    this.#cache = cache;
  }

  async render(task: GenerationTask): Promise<Buffer> {
    const sourcePath = task.sourceDependencies[0];
    if (sourcePath === undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: `Render task "${task.id}" has no source dependency.`,
        context: { taskId: task.id },
      });
    }
    if (
      task.width === undefined ||
      task.height === undefined ||
      !Number.isSafeInteger(task.width) ||
      !Number.isSafeInteger(task.height) ||
      task.width <= 0 ||
      task.height <= 0
    ) {
      throw new LoomError({
        code: 'LOOM_RENDER_DIMENSION_INVALID',
        message: `Render task "${task.id}" has invalid dimensions.`,
        context: { taskId: task.id, width: task.width, height: task.height },
      });
    }
    if (task.format !== 'png' && task.format !== 'webp') {
      throw new LoomError({
        code: 'LOOM_RENDER_FORMAT_UNSUPPORTED',
        message: `Render task "${task.id}" has an unsupported output format.`,
        context: { taskId: task.id, format: task.format },
      });
    }
    const extension = path.extname(sourcePath).toLowerCase();
    if (!SUPPORTED_SOURCE_EXTENSIONS.has(extension)) {
      throw new LoomError({
        code: 'LOOM_SRC_UNSUPPORTED',
        message: `Source format "${extension || '(none)'}" is not supported.`,
        context: { taskId: task.id, sourcePath },
      });
    }

    let source: Buffer;
    try {
      source = await readFile(sourcePath);
    } catch (cause) {
      throw new LoomError({
        code: 'LOOM_SRC_NOT_FOUND',
        message: `Source file "${sourcePath}" was not found.`,
        cause,
        context: { taskId: task.id, sourcePath },
      });
    }
    validateSvg(source, sourcePath);

    const renderParameters = JSON.stringify({
      engine: `sharp-${sharp.versions.sharp}`,
      rendererRevision: 2,
      source: sha256(source),
      task: {
        resourceType: task.resourceType,
        id: task.id.replace(/:(?:mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi|[123]x)$/, ''),
        width: task.width,
        height: task.height,
        format: task.format,
        presetVersion: task.presetVersion,
      },
    });
    const cacheIndex = sha256(renderParameters);
    const outputKey = await this.#cache.getAlias(cacheIndex);
    if (outputKey !== undefined) {
      const cached = await this.#cache.get(outputKey);
      if (cached !== undefined) {
        return cached;
      }
      throw new LoomError({
        code: 'LOOM_CACHE_CORRUPT',
        message: 'Assetloom render cache index points to missing content.',
        context: { cacheIndex, taskId: task.id },
      });
    }

    try {
      let pipeline = sharp(source, {
        failOn: 'error',
        limitInputPixels: 100_000_000,
      })
        .timeout({ seconds: 30 })
        .rotate()
        .resize(task.width, task.height, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        });
      if (task.target === 'ios' && task.resourceType === 'app-icon') {
        pipeline = pipeline
          .flatten({ background: '#FFFFFF' })
          .removeAlpha();
      } else {
        pipeline = pipeline.ensureAlpha();
      }
      if (
        task.resourceType === 'notification-icon' ||
        task.id.includes('adaptive-monochrome')
      ) {
        pipeline = pipeline.greyscale().tint('#FFFFFF');
      } else if (task.id.endsWith(':ios:tinted')) {
        pipeline = pipeline.greyscale();
      }

      const output =
        task.format === 'png'
          ? await pipeline
              .png({
                adaptiveFiltering: false,
                compressionLevel: 9,
                palette: false,
              })
              .toBuffer()
          : await pipeline.webp({ lossless: true }).toBuffer();
      const outputKey = await this.#cache.put(output);

      // Cache indexes are content-addressed as well. The mapping is materialized
      // under the parameter hash so retrieval does not depend on a mutable DB.
      await this.#writeCacheIndex(cacheIndex, outputKey);
      return output;
    } catch (cause) {
      if (cause instanceof LoomError) {
        throw cause;
      }
      if (
        cause instanceof Error &&
        cause.message.toLocaleLowerCase('en-US').includes('timeout')
      ) {
        throw new LoomError({
          code: 'LOOM_RENDER_TIMEOUT',
          message: `Rendering resource "${task.resourceId}" timed out.`,
          cause,
          context: {
            resourceId: task.resourceId,
            target: task.target,
            sourcePath,
          },
        });
      }
      throw new LoomError({
        code: 'LOOM_RENDER_FAILED',
        message: `Failed to render resource "${task.resourceId}" for ${task.target === 'android' ? 'Android' : 'iOS'}.`,
        cause,
        context: {
          resourceId: task.resourceId,
          target: task.target,
          sourcePath,
        },
      });
    }
  }

  async #writeCacheIndex(index: string, outputKey: string): Promise<void> {
    // ContentCache intentionally only exposes content-addressed writes. A small
    // index record whose desired address is parameter-derived is therefore
    // handled by the cache's dedicated alias operation.
    await this.#cache.putAlias(index, Buffer.from(outputKey, 'ascii'));
  }
}
