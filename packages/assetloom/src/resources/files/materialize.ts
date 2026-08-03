import { readFile } from 'node:fs/promises';
import type {
  CatalogArtifactForOperation,
  CatalogArtifactMaterializer,
} from '../../application/execution/contracts.js';
import type { CopyFileArtifact } from '../../domain/catalog/planning.js';
import { FontFileSignatureValidator } from '../font-family/signature.js';

type CopyArtifact = CatalogArtifactForOperation<'copy-file'>;

export interface CopyFileContentValidator {
  supports(artifact: CopyFileArtifact): boolean;
  validate(artifact: CopyFileArtifact, content: Uint8Array): void;
}

export class CopyFileMaterializer
implements CatalogArtifactMaterializer<CopyArtifact> {
  readonly operation = 'copy-file' as const;
  readonly #validators: readonly CopyFileContentValidator[];

  constructor(
    validators: readonly CopyFileContentValidator[] = [
      new FontFileSignatureValidator(),
    ],
  ) {
    this.#validators = validators;
  }

  async materialize(artifact: CopyArtifact): Promise<{ readonly content: Uint8Array }> {
    const content = await readFile(artifact.source);
    for (const validator of this.#validators) {
      if (validator.supports(artifact)) {
        validator.validate(artifact, content);
      }
    }
    return { content };
  }
}
