import { readFile } from 'node:fs/promises';
import { TextEncoder } from 'node:util';
import type {
  CatalogArtifactForOperation,
  CatalogArtifactMaterializer,
} from '../../application/execution/contracts.js';
import { LoomError } from '../../domain/errors.js';
import { SvgComponentPresetRegistry } from './presets.js';

type SvgArtifact = CatalogArtifactForOperation<'transform-svg'>;

export class SvgComponentMaterializer
implements CatalogArtifactMaterializer<SvgArtifact> {
  readonly operation = 'transform-svg' as const;
  readonly #presets: SvgComponentPresetRegistry;

  constructor(presets = new SvgComponentPresetRegistry()) {
    this.#presets = presets;
  }

  async materialize(
    artifact: SvgArtifact,
  ): Promise<{ readonly content: Uint8Array }> {
    try {
      const source = await readFile(artifact.source, 'utf8');
      return {
        content: new TextEncoder().encode(
          this.#presets.get(artifact.preset).transform(source, artifact),
        ),
      };
    } catch (cause) {
      throw new LoomError({
        code: 'LOOM_RENDER_FAILED',
        message: 'Failed to transform SVG component source.',
        cause,
        context: { taskId: artifact.id, sourcePath: artifact.source },
      });
    }
  }
}
