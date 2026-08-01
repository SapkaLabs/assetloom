export interface FileSourceDefinition {
  readonly file: string;
}

export interface GlobSourceDefinition {
  readonly root: string;
  readonly include: readonly string[];
  readonly exclude?: readonly string[];
  readonly required?: boolean;
}

export interface PackageSourceDefinition {
  readonly package: string;
  readonly path: string;
}

export type SourceDefinition =
  | string
  | FileSourceDefinition
  | GlobSourceDefinition
  | PackageSourceDefinition;

export interface ResolvedSource {
  readonly absolutePath: string;
  readonly relativePath: string;
}
