import path from 'node:path';
import type { ArtifactPublication, GeneratedCatalogArtifactBase } from '../domain/catalog/planning.js';
import { LoomError } from '../domain/errors.js';
import type {
  MaterializedCatalogContent,
  ResolvedCatalogArtifactOutput,
  CatalogPublicationResolver,
  ResolvedCatalogPublication,
} from '../application/execution/contracts.js';
import { sha256 } from './hash.js';

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function publicPath(
  publication: ArtifactPublication,
  destination: string,
  digest: string,
): string | undefined {
  if (publication.publicPath === undefined) {
    return undefined;
  }
  const publicDirectory = path.resolve(publication.publicPath.publicDirectory);
  if (!isInside(publicDirectory, destination)) {
    throw new LoomError({
      code: 'LOOM_PLAN_INVALID',
      message: 'A published catalog output is outside its public directory.',
      context: { destination, publicDirectory },
    });
  }
  const relative = path
    .relative(publicDirectory, destination)
    .split(path.sep)
    .join('/');
  const base = publication.publicPath.publicBasePath.replace(/\/+$/u, '');
  const resolved = `${base}/${relative}`.replace(/\/{2,}/gu, '/');
  if (
    publication.mode !== 'stable' ||
    publication.queryContentHash === undefined
  ) {
    return resolved;
  }
  const { hashLength, parameter } = publication.queryContentHash;
  assertHashLength(hashLength);
  const fragmentIndex = resolved.indexOf('#');
  const beforeFragment = fragmentIndex === -1 ? resolved : resolved.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? '' : resolved.slice(fragmentIndex);
  const queryIndex = beforeFragment.indexOf('?');
  const pathname = queryIndex === -1 ? beforeFragment : beforeFragment.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : beforeFragment.slice(queryIndex + 1);
  const parameters = new URLSearchParams(query);
  parameters.set(parameter, digest.slice(0, hashLength));
  return `${pathname}?${parameters.toString()}${fragment}`;
}

function assertHashLength(hashLength: number): void {
  if (!Number.isInteger(hashLength) || hashLength < 8 || hashLength > 64) {
    throw new LoomError({
      code: 'LOOM_PLAN_INVALID',
      message: 'Content-hash token length must be an integer from 8 through 64.',
      context: { hashLength },
    });
  }
}

function contentHashDestination(
  publication: Extract<ArtifactPublication, { readonly mode: 'content-hash' }>,
  digest: string,
): string {
  assertHashLength(publication.hashLength);
  const extension = publication.extension.replace(/^\.+/u, '');
  const suffix = extension === '' ? '' : `.${extension}`;
  return path.join(
    publication.directory,
    `${publication.logicalName}.${digest.slice(0, publication.hashLength)}${suffix}`,
  );
}

function resolvePublication(
  artifact: Pick<
    GeneratedCatalogArtifactBase,
    'destination' | 'id' | 'publication' | 'target'
  >,
  materialized: MaterializedCatalogContent,
): ResolvedCatalogPublication {
  const digest = sha256(materialized.content);
  const destination =
    artifact.publication.mode === 'stable'
      ? artifact.destination
      : contentHashDestination(artifact.publication, digest);
  const resolvedPublicPath = publicPath(artifact.publication, destination, digest);
  const hashLength =
    artifact.publication.mode === 'content-hash'
      ? artifact.publication.hashLength
      : artifact.publication.queryContentHash?.hashLength;
  if (hashLength !== undefined) {
    assertHashLength(hashLength);
  }
  const output: ResolvedCatalogArtifactOutput = {
    artifactId: artifact.id,
    content: materialized.content,
    destination,
    fileName: path.basename(destination),
    sha256: digest,
    hashToken: hashLength === undefined ? digest : digest.slice(0, hashLength),
    ...(materialized.width === undefined ? {} : { width: materialized.width }),
    ...(materialized.height === undefined ? {} : { height: materialized.height }),
    ...(resolvedPublicPath === undefined
      ? {}
      : { publicPath: resolvedPublicPath }),
  };
  const destinations = [
    destination,
    ...(artifact.publication.mode === 'content-hash' &&
    artifact.publication.fallbackDestination !== undefined
      ? [artifact.publication.fallbackDestination]
      : []),
  ];
  return {
    output,
    ownedDestinations: destinations,
  };
}

export class FileSystemCatalogPublicationResolver
  implements CatalogPublicationResolver
{
  resolveGenerated(
    artifact: Parameters<CatalogPublicationResolver['resolveGenerated']>[0],
    materialized: MaterializedCatalogContent,
  ): ResolvedCatalogPublication {
    return resolvePublication(artifact, materialized);
  }
}
