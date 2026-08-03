import { LoomError } from '../../domain/errors.js';

interface PngDimensions {
  readonly width: number;
  readonly height: number;
}

function pngDimensions(value: Uint8Array): PngDimensions {
  const buffer = Buffer.from(value);
  const signature = '89504e470d0a1a0a';
  if (
    buffer.byteLength < 24 ||
    buffer.subarray(0, 8).toString('hex') !== signature ||
    buffer.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    throw new LoomError({
      code: 'LOOM_SRC_INVALID',
      message: 'ICO input must be a valid PNG image.',
    });
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 256 || height > 256) {
    throw new LoomError({
      code: 'LOOM_RENDER_DIMENSION_INVALID',
      message: 'ICO PNG dimensions must be between 1 and 256 pixels.',
      context: { width, height },
    });
  }
  return { width, height };
}

export function encodePngIco(images: readonly Uint8Array[]): Buffer {
  if (images.length === 0 || images.length > 65_535) {
    throw new LoomError({
      code: 'LOOM_PLAN_INVALID',
      message: 'ICO generation requires between 1 and 65535 PNG inputs.',
      context: { imageCount: images.length },
    });
  }
  const buffers = images.map((image) => Buffer.from(image));
  const dimensions = buffers.map(pngDimensions);
  const directorySize = 6 + buffers.length * 16;
  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(buffers.length, 4);
  let offset = directorySize;
  buffers.forEach((buffer, index) => {
    const entry = 6 + index * 16;
    const dimension = dimensions[index];
    if (dimension === undefined) {
      throw new LoomError({
        code: 'LOOM_INTERNAL',
        message: 'ICO dimension metadata is missing.',
      });
    }
    header.writeUInt8(dimension.width === 256 ? 0 : dimension.width, entry);
    header.writeUInt8(dimension.height === 256 ? 0 : dimension.height, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(buffer.byteLength, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += buffer.byteLength;
  });
  return Buffer.concat([header, ...buffers]);
}
