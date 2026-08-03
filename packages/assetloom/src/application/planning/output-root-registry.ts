import path from 'node:path';
import {
  assertInsideRoot,
  assertSafeDestination,
} from '../../config/paths.js';
import { LoomError } from '../../domain/errors.js';
import { compareCodePoints } from '../../domain/ordering.js';
import type { LoadedVersionedConfiguration } from '../../domain/types.js';

export interface OutputRootDefinition {
  readonly outputRootId: string;
  readonly targetId: string;
  readonly root: string;
}

export interface PlannedOutputPath {
  readonly outputRootId: string;
  readonly relativePath: string;
}

export interface ResolvedOutputPath extends PlannedOutputPath {
  readonly targetId: string;
  readonly destination: string;
}

const ROOT_ID = /^[A-Za-z][A-Za-z0-9_.:-]*$/u;

function collisionKey(outputRootId: string, relativePath: string): string {
  return `${outputRootId.toLocaleLowerCase('en-US')}\0${relativePath.toLocaleLowerCase('en-US')}`;
}

function portableRelativePath(relativePath: string): string {
  if (
    relativePath.length === 0 ||
    relativePath.includes('\0') ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath)
  ) {
    throw new LoomError({
      code: 'LOOM_WRITE_OUTSIDE_ROOT',
      message: 'Artifact output paths must be non-empty relative paths.',
      context: { relativePath },
    });
  }
  const portable = relativePath.replace(/\\/gu, '/');
  const segments = portable.split('/');
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === '.' || segment === '..',
    )
  ) {
    throw new LoomError({
      code: 'LOOM_WRITE_OUTSIDE_ROOT',
      message: 'Artifact output paths cannot contain empty, current, or parent segments.',
      context: { relativePath },
    });
  }
  return segments.join('/');
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

export class OutputRootRegistry {
  readonly #projectRoot: string;
  readonly #roots: ReadonlyMap<string, OutputRootDefinition>;

  constructor(projectRoot: string, definitions: readonly OutputRootDefinition[]) {
    this.#projectRoot = path.resolve(projectRoot);
    const roots = new Map<string, OutputRootDefinition>();
    const ids = new Map<string, string>();
    for (const definition of definitions) {
      if (!ROOT_ID.test(definition.outputRootId) || !ROOT_ID.test(definition.targetId)) {
        throw new LoomError({
          code: 'LOOM_PLAN_INVALID',
          message: 'Output-root and target IDs must use stable identifier syntax.',
          context: {
            outputRootId: definition.outputRootId,
            targetId: definition.targetId,
          },
        });
      }
      const idKey = definition.outputRootId.toLocaleLowerCase('en-US');
      const previous = ids.get(idKey);
      if (previous !== undefined) {
        throw new LoomError({
          code: 'LOOM_PLAN_COLLISION',
          message: 'Output-root IDs must be case-normalized unique.',
          context: { outputRootId: definition.outputRootId, previous },
        });
      }
      const root = path.resolve(definition.root);
      assertInsideRoot(this.#projectRoot, root);
      ids.set(idKey, definition.outputRootId);
      roots.set(definition.outputRootId, { ...definition, root });
    }
    this.#roots = roots;
  }

  get definitions(): readonly OutputRootDefinition[] {
    return [...this.#roots.values()].sort((left, right) =>
      compareCodePoints(left.outputRootId, right.outputRootId),
    );
  }

  definition(outputRootId: string): OutputRootDefinition {
    const definition = this.#roots.get(outputRootId);
    if (definition === undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'An artifact references an undeclared output root.',
        context: { outputRootId },
      });
    }
    return definition;
  }

  async resolve(
    outputRootId: string,
    relativePath: string,
  ): Promise<ResolvedOutputPath> {
    const root = this.#roots.get(outputRootId);
    if (root === undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'An artifact references an undeclared output root.',
        context: { outputRootId },
      });
    }
    const portable = portableRelativePath(relativePath);
    const destination = path.resolve(root.root, ...portable.split('/'));
    assertInsideRoot(root.root, destination);
    await assertSafeDestination(this.#projectRoot, root.root);
    await assertSafeDestination(root.root, destination);
    return {
      outputRootId: root.outputRootId,
      targetId: root.targetId,
      relativePath: portable,
      destination,
    };
  }

  async resolveAll(
    outputs: readonly PlannedOutputPath[],
  ): Promise<readonly ResolvedOutputPath[]> {
    const resolved: ResolvedOutputPath[] = [];
    const destinations = new Map<string, ResolvedOutputPath>();
    for (const output of outputs) {
      const candidate = await this.resolve(
        output.outputRootId,
        output.relativePath,
      );
      const key = collisionKey(candidate.outputRootId, candidate.relativePath);
      const previous = destinations.get(key);
      if (previous !== undefined) {
        throw new LoomError({
          code: 'LOOM_PLAN_COLLISION',
          message: 'Planned output destinations must be case-normalized unique.',
          context: {
            destination: candidate.destination,
            previous: previous.destination,
          },
        });
      }
      destinations.set(key, candidate);
      resolved.push(candidate);
    }
    return resolved;
  }

  async identify(targetId: string, destination: string): Promise<ResolvedOutputPath> {
    const absolute = path.resolve(destination);
    const candidates = this.definitions
      .filter((definition) => definition.targetId === targetId)
      .filter((definition) => isInside(definition.root, absolute))
      .sort((left, right) => right.root.length - left.root.length);
    const root = candidates[0];
    if (root === undefined) {
      throw new LoomError({
        code: 'LOOM_WRITE_OUTSIDE_ROOT',
        message: 'A materialized output is outside every declared output root.',
        context: { destination: absolute, targetId },
      });
    }
    const relative = path.relative(root.root, absolute).split(path.sep).join('/');
    return this.resolve(root.outputRootId, relative);
  }
}

export function configuredOutputRootDefinitions(
  loaded: LoadedVersionedConfiguration,
): readonly OutputRootDefinition[] {
  const definitions: OutputRootDefinition[] = [];
  for (const [targetId, configured] of Object.entries(loaded.config.targets)) {
    if (configured === undefined) {
      continue;
    }
    if (targetId === 'android' && 'resourceDirectory' in configured) {
      definitions.push({
        outputRootId: 'android:resources',
        targetId,
        root: path.resolve(loaded.projectRoot, configured.resourceDirectory),
      });
      continue;
    }
    if (targetId === 'ios' && 'projectDirectory' in configured) {
      definitions.push(
        {
          outputRootId: 'ios:project',
          targetId,
          root: path.resolve(loaded.projectRoot, configured.projectDirectory),
        },
        {
          outputRootId: 'ios:catalog',
          targetId,
          root: path.resolve(loaded.projectRoot, configured.assetCatalogDirectory),
        },
      );
      continue;
    }
    if ('kind' in configured) {
      definitions.push({
        outputRootId: targetId,
        targetId,
        root: path.resolve(loaded.projectRoot, configured.root),
      });
    }
  }
  return definitions.sort((left, right) =>
    compareCodePoints(left.outputRootId, right.outputRootId),
  );
}

export function configuredOutputRootRegistry(
  loaded: LoadedVersionedConfiguration,
): OutputRootRegistry {
  return new OutputRootRegistry(
    loaded.projectRoot,
    configuredOutputRootDefinitions(loaded),
  );
}
