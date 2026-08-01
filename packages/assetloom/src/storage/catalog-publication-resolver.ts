import path from 'node:path';
import type {
  IntegrateProjectArtifact,
  ArtifactPublication,
  GeneratedCatalogArtifactBase,
  PublishedIntegrationResult,
} from '../domain/catalog/planning.js';
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
  return `${base}/${relative}`.replace(/\/{2,}/gu, '/');
}

function contentHashDestination(
  publication: Extract<ArtifactPublication, { readonly mode: 'content-hash' }>,
  digest: string,
): string {
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
  const resolvedPublicPath = publicPath(artifact.publication, destination);
  const output: ResolvedCatalogArtifactOutput = {
    artifactId: artifact.id,
    content: materialized.content,
    destination,
    fileName: path.basename(destination),
    sha256: digest,
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

  resolveIntegrationResult(
    artifact: IntegrateProjectArtifact,
    result: PublishedIntegrationResult,
    content: Uint8Array,
  ): ResolvedCatalogPublication {
    return resolvePublication(
      {
        id: result.resultId,
        target: artifact.target,
        publication: result.publication,
        destination: result.destination,
      },
      { content },
    );
  }
}
