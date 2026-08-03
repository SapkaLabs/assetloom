import type { UsageDescriptorV1 } from '@sapkalabs/assetloom-core';
import type { ImageFormat } from '@sapkalabs/assetloom-images';

export type NativePlatform = 'android' | 'ios';
export type NativeSemanticRole = 'app-icon' | 'notification-icon' | 'splash-screen' | 'bundle-metadata';

export type NativeResourceUsagePayloadV1 = Readonly<{
  readonly platform: NativePlatform;
  readonly role: string;
  readonly name: string;
  readonly relativePath: string;
  readonly manualSetup: readonly string[];
}>;

export type NativeResourceUsageV1 = UsageDescriptorV1<NativeResourceUsagePayloadV1> & {
  readonly kind: 'native.resource';
};

export interface NativeImagePresetV1 {
  readonly version: 1;
  readonly platform: NativePlatform;
  readonly role: NativeSemanticRole;
  readonly format: Exclude<ImageFormat, 'ico'>;
  readonly sizes: readonly number[];
}

export function createNativeResourceUsageV1(input: Omit<NativeResourceUsageV1, 'kind' | 'version'>): NativeResourceUsageV1 {
  return {
    kind: 'native.resource',
    version: 1,
    ...input,
    artifactIds: [...new Set(input.artifactIds)].sort(),
  };
}

export function assertNativeResourceName(platform: NativePlatform, name: string): string {
  const valid = platform === 'android' ? /^[a-z][a-z0-9_]*$/u.test(name) : /^[A-Za-z][A-Za-z0-9_-]*$/u.test(name);
  if (!valid) throw new TypeError(`Invalid ${platform} resource name "${name}".`);
  return name;
}
