declare const targetIdBrand: unique symbol;

export type TargetId = string & {
  readonly [targetIdBrand]: 'TargetId';
};

export type TargetKind =
  | 'android'
  | 'ios'
  | 'directory'
  | 'react-native-library'
  | 'react-native-app'
  | 'web-app';

export interface DirectoryTargetConfiguration {
  readonly kind: 'directory';
  readonly root: string;
}

export interface ReactNativeLibraryTargetConfiguration {
  readonly kind: 'react-native-library';
  readonly root: string;
}

export interface ReactNativeAppTargetConfiguration {
  readonly kind: 'react-native-app';
  readonly root: string;
  readonly androidFontDirectory?: string;
  readonly iosFontDirectory?: string;
}

export interface WebAppTargetConfiguration {
  readonly kind: 'web-app';
  readonly root: string;
  readonly sourceDirectory: string;
  readonly publicDirectory: string;
  readonly publicBasePath: string;
}

export type CatalogTargetConfiguration =
  | DirectoryTargetConfiguration
  | ReactNativeLibraryTargetConfiguration
  | ReactNativeAppTargetConfiguration
  | WebAppTargetConfiguration;

export interface ResolvedCatalogTarget {
  readonly id: TargetId;
  readonly kind: CatalogTargetConfiguration['kind'];
  readonly root: string;
  readonly configuration: CatalogTargetConfiguration;
}

const TARGET_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

export function targetId(value: string): TargetId {
  if (!TARGET_ID_PATTERN.test(value)) {
    throw new TypeError(`Invalid Assetloom target ID "${value}".`);
  }
  return value as TargetId;
}
