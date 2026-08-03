import sharp from 'sharp';
import { sha256 } from '@sapkalabs/assetloom-core';

export type ImageFormat = 'png' | 'webp' | 'jpeg' | 'ico';
export type ImageFit = 'contain' | 'cover' | 'fill' | 'inside' | 'outside';

export interface ImageRecipeV1 {
  readonly version: 1;
  readonly width?: number;
  readonly height?: number;
  readonly format: ImageFormat;
  readonly fit?: ImageFit;
  readonly background?: string;
  readonly quality?: number;
  readonly density?: number;
}

export interface InspectedImageV1 {
  readonly format?: string;
  readonly width?: number;
  readonly height?: number;
  readonly hasAlpha?: boolean;
  readonly sizeBytes: number;
  readonly contentHash: { readonly algorithm: 'sha256'; readonly value: string };
}

export const imageRendererCompatibilityVersion = `sharp-${sharp.versions.sharp}`;

export async function inspectImage(bytes: Uint8Array): Promise<InspectedImageV1> {
  const metadata = await sharp(bytes).metadata();
  return {
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    hasAlpha: metadata.hasAlpha,
    sizeBytes: bytes.byteLength,
    contentHash: { algorithm: 'sha256', value: sha256(bytes) },
  };
}
