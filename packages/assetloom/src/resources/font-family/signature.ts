import path from 'node:path';
import type { CopyFileArtifact } from '../../domain/catalog/planning.js';
import { LoomError } from '../../domain/errors.js';
import type { CopyFileContentValidator } from '../files/materialize.js';

const FONT_SIGNATURES = {
  ttf: [0x00, 0x01, 0x00, 0x00],
  otf: [0x4f, 0x54, 0x54, 0x4f],
  woff: [0x77, 0x4f, 0x46, 0x46],
  woff2: [0x77, 0x4f, 0x46, 0x32],
} as const;

type SignatureFormat = keyof typeof FONT_SIGNATURES;

function isSignatureFormat(value: string): value is SignatureFormat {
  return Object.hasOwn(FONT_SIGNATURES, value);
}

export class FontFileSignatureValidator implements CopyFileContentValidator {
  supports(artifact: CopyFileArtifact): boolean {
    return artifact.resourceType === 'font-family';
  }

  validate(artifact: CopyFileArtifact, content: Uint8Array): void {
    const format = path.extname(artifact.source).slice(1).toLowerCase();
    if (!isSignatureFormat(format)) {
      throw new LoomError({
        code: 'LOOM_RENDER_FORMAT_UNSUPPORTED',
        message: 'Font copy source has an unsupported format.',
        context: { taskId: artifact.id, sourcePath: artifact.source, format },
      });
    }
    const expected = FONT_SIGNATURES[format];
    if (
      content.length < expected.length ||
      expected.some((byte, index) => content[index] !== byte)
    ) {
      throw new LoomError({
        code: 'LOOM_RENDER_FAILED',
        message: 'Font source signature does not match its configured format.',
        context: { taskId: artifact.id, sourcePath: artifact.source, format },
      });
    }
  }
}
