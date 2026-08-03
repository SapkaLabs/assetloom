import type { JsonSafeValue, UsageDescriptorV1 } from '@sapkalabs/assetloom-core';
import type { ImageFormat } from '@sapkalabs/assetloom-images';

export type WebCacheBustPolicy = 'none' | 'filename' | 'query';

export const DEFAULT_WEB_CACHE_BUST_POLICY = 'none' as const;
export const DEFAULT_WEB_HASH_TOKEN_LENGTH = 12;
export const MIN_WEB_HASH_TOKEN_LENGTH = 8;
export const MAX_WEB_HASH_TOKEN_LENGTH = 64;

export type WebHtmlLinkPayloadV1 = Readonly<{
  readonly rel: string;
  readonly href: string;
  readonly type?: string;
  readonly sizes?: string;
  readonly purpose?: string;
}>;
export type WebHtmlLinkUsageV1 = UsageDescriptorV1<WebHtmlLinkPayloadV1> & { readonly kind: 'web.html-link' };
export type WebHeadMetadataPayloadV1 = Readonly<{ readonly elements: readonly JsonSafeValue[] }>;
export type WebHeadMetadataUsageV1 = UsageDescriptorV1<WebHeadMetadataPayloadV1> & { readonly kind: 'web.head-metadata' };
export type WebStaticHostPayloadV1 = Readonly<{ readonly routes: readonly JsonSafeValue[] }>;
export type WebStaticHostUsageV1 = UsageDescriptorV1<WebStaticHostPayloadV1> & { readonly kind: 'web.static-host-cache' };
export type WebUsageDescriptorV1 = WebHtmlLinkUsageV1 | WebHeadMetadataUsageV1 | WebStaticHostUsageV1;

export interface WebImagePresetV1 {
  readonly version: 1;
  readonly role: 'favicon' | 'application-icon' | 'maskable-icon' | 'social-preview';
  readonly format: ImageFormat;
  readonly width: number;
  readonly height: number;
}

export function resolveWebPublicPath(basePath: string, relativePath: string): string {
  const base = basePath.replace(/\/+$/u, '');
  const relative = relativePath.replace(/^\/+/, '');
  return `${base}/${relative}`.replace(/\/{2,}/gu, '/');
}

export function assertWebHashTokenLength(length: number): number {
  if (
    !Number.isInteger(length) ||
    length < MIN_WEB_HASH_TOKEN_LENGTH ||
    length > MAX_WEB_HASH_TOKEN_LENGTH
  ) {
    throw new RangeError('Web content-hash token length must be from 8 through 64.');
  }
  return length;
}

export function webContentHashToken(
  fullSha256: string,
  length = DEFAULT_WEB_HASH_TOKEN_LENGTH,
): string {
  assertWebHashTokenLength(length);
  if (!/^[0-9a-f]{64}$/u.test(fullSha256)) {
    throw new TypeError('Web content identity must be a lowercase SHA-256 digest.');
  }
  return fullSha256.slice(0, length);
}

export function appendWebCacheBustQuery(
  publicPath: string,
  token: string,
): string {
  if (!/^[0-9a-f]{8,64}$/u.test(token)) {
    throw new TypeError('Web cache-busting token must contain 8 through 64 lowercase hexadecimal characters.');
  }
  const fragmentIndex = publicPath.indexOf('#');
  const beforeFragment = fragmentIndex === -1 ? publicPath : publicPath.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? '' : publicPath.slice(fragmentIndex);
  const queryIndex = beforeFragment.indexOf('?');
  const pathname = queryIndex === -1 ? beforeFragment : beforeFragment.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : beforeFragment.slice(queryIndex + 1);
  const parameters = query
    .split('&')
    .filter((part) => part !== '' && part.split('=', 1)[0] !== 'v');
  parameters.push(`v=${token}`);
  return `${pathname}?${parameters.join('&')}${fragment}`;
}
