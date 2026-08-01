import path from 'node:path';
import type { IntegrateProjectArtifact } from '../../domain/catalog/planning.js';
import { LoomError } from '../../domain/errors.js';
import { compareCodePoints } from '../../domain/ordering.js';
import type {
  CatalogArtifactOutputResolver,
  PreparedProjectIntegration,
  ProjectFileGateway,
  ProjectFileSnapshot,
  ProjectIntegrationAdapterRegistry,
  StoredIntegrationReceipt,
} from './contracts.js';

interface WorkingProjectFile {
  readonly snapshot: ProjectFileSnapshot;
  content: Uint8Array | undefined;
}

export interface PreparedProjectFileChange {
  readonly content: Uint8Array;
  readonly destination: string;
  readonly expectedSha256: string | undefined;
}

export interface PreparedIntegrationPublication {
  readonly changes: readonly PreparedProjectFileChange[];
  readonly receipts: readonly StoredIntegrationReceipt[];
}

export interface IntegrationPublicationResult {
  readonly written: readonly string[];
  readonly unchanged: readonly string[];
}

function receiptIdentity(
  receipt: Pick<
    StoredIntegrationReceipt,
    'adapter' | 'destination' | 'stateKey' | 'target'
  >,
): string {
  return JSON.stringify([
    receipt.target,
    receipt.adapter,
    receipt.stateKey,
    receipt.destination,
  ]);
}

function retainedDestinationIdentity(
  receipt: Pick<StoredIntegrationReceipt, 'destination'>,
): string {
  return receipt.destination.toLocaleLowerCase('en-US');
}

function portableRelativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

export class ProjectIntegrationSession {
  readonly #adapters: ProjectIntegrationAdapterRegistry;
  readonly #desiredIdentities: ReadonlySet<string>;
  readonly #files: ProjectFileGateway;
  readonly #previousByIdentity: ReadonlyMap<string, StoredIntegrationReceipt>;
  readonly #projectRoot: string;
  readonly #receipts: StoredIntegrationReceipt[];
  readonly #workingFiles: Map<string, WorkingProjectFile>;
  readonly #applied = new Set<string>();

  constructor(options: {
    readonly adapters: ProjectIntegrationAdapterRegistry;
    readonly desiredIdentities: ReadonlySet<string>;
    readonly files: ProjectFileGateway;
    readonly previousByIdentity: ReadonlyMap<string, StoredIntegrationReceipt>;
    readonly projectRoot: string;
    readonly receipts: readonly StoredIntegrationReceipt[];
    readonly workingFiles: Map<string, WorkingProjectFile>;
  }) {
    this.#adapters = options.adapters;
    this.#desiredIdentities = options.desiredIdentities;
    this.#files = options.files;
    this.#previousByIdentity = options.previousByIdentity;
    this.#projectRoot = options.projectRoot;
    this.#receipts = [...options.receipts];
    this.#workingFiles = options.workingFiles;
  }

  async apply(
    artifact: IntegrateProjectArtifact,
    outputs: CatalogArtifactOutputResolver,
  ): Promise<PreparedProjectIntegration> {
    const relativeDestination = portableRelativePath(
      this.#projectRoot,
      artifact.destination,
    );
    const identity = receiptIdentity({
      adapter: artifact.integration.adapter,
      destination: relativeDestination,
      stateKey: artifact.integration.stateKey,
      target: artifact.target,
    });
    if (!this.#desiredIdentities.has(identity) || this.#applied.has(identity)) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'Project integration was not declared exactly once in the prepared plan.',
        context: { taskId: artifact.id },
      });
    }
    const working = this.#workingFiles.get(artifact.destination);
    if (working === undefined) {
      throw new LoomError({
        code: 'LOOM_INTERNAL',
        message: 'Project integration destination was not prepared.',
        context: { destination: artifact.destination },
      });
    }
    const prepared = await this.#adapters.prepare(
      artifact,
      working.content,
      this.#previousByIdentity.get(identity)?.state,
      outputs,
    );
    working.content = prepared.content;
    this.#receipts.push({
      adapter: artifact.integration.adapter,
      artifactId: artifact.id,
      destination: relativeDestination,
      stateKey: artifact.integration.stateKey,
      target: artifact.target,
      state: prepared.state,
    });
    this.#applied.add(identity);
    return prepared;
  }

  finalize(): PreparedIntegrationPublication {
    if (this.#applied.size !== this.#desiredIdentities.size) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'Not every planned project integration was applied.',
      });
    }
    const changes: PreparedProjectFileChange[] = [];
    for (const [destination, working] of [...this.#workingFiles].sort(
      ([left], [right]) => compareCodePoints(left, right),
    )) {
      // Include unchanged authored files so publish performs a final
      // compare-and-swap check for every destination prepared in phase one.
      if (working.content !== undefined) {
        changes.push({
          destination,
          content: working.content,
          expectedSha256: working.snapshot.sha256,
        });
      }
    }
    return {
      changes,
      receipts: [...this.#receipts].sort((left, right) =>
        compareCodePoints(receiptIdentity(left), receiptIdentity(right)),
      ),
    };
  }

  async publish(
    prepared: PreparedIntegrationPublication,
  ): Promise<IntegrationPublicationResult> {
    const written: string[] = [];
    const unchanged: string[] = [];
    for (const change of prepared.changes) {
      const disposition = await this.#files.publish(
        change.destination,
        change.content,
        change.expectedSha256,
      );
      (disposition === 'written' ? written : unchanged).push(change.destination);
    }
    return { written, unchanged };
  }
}

export class ProjectIntegrationLifecycle {
  readonly #adapters: ProjectIntegrationAdapterRegistry;
  readonly #files: ProjectFileGateway;
  readonly #projectRoot: string;

  constructor(
    projectRoot: string,
    adapters: ProjectIntegrationAdapterRegistry,
    files: ProjectFileGateway,
  ) {
    this.#projectRoot = path.resolve(projectRoot);
    this.#adapters = adapters;
    this.#files = files;
  }

  async open(
    artifacts: readonly IntegrateProjectArtifact[],
    previousReceipts: readonly StoredIntegrationReceipt[],
    selectedTargets: readonly string[],
  ): Promise<ProjectIntegrationSession> {
    const selectedTargetSet = new Set(selectedTargets);
    const desiredIdentities = new Set<string>();
    const retained = previousReceipts.filter(
      (receipt) => !selectedTargetSet.has(receipt.target),
    );
    const retainedByDestination = new Map(
      retained.map((receipt) => [retainedDestinationIdentity(receipt), receipt]),
    );
    for (const artifact of artifacts) {
      if (!selectedTargetSet.has(artifact.target)) {
        throw new LoomError({
          code: 'LOOM_PLAN_INVALID',
          message: 'A project integration is outside the selected target scope.',
          context: { target: artifact.target, taskId: artifact.id },
        });
      }
      const candidateReceipt = {
        adapter: artifact.integration.adapter,
        destination: portableRelativePath(
          this.#projectRoot,
          artifact.destination,
        ),
        stateKey: artifact.integration.stateKey,
        target: artifact.target,
      };
      const retainedOwner = retainedByDestination.get(
        retainedDestinationIdentity(candidateReceipt),
      );
      if (retainedOwner !== undefined) {
        throw new LoomError({
          code: 'LOOM_PLAN_COLLISION',
          message:
            'A selected project integration is already owned by a retained target.',
          context: {
            adapter: candidateReceipt.adapter,
            destination: artifact.destination,
            retainedAdapter: retainedOwner.adapter,
            retainedDestination: retainedOwner.destination,
            retainedStateKey: retainedOwner.stateKey,
            retainedTarget: retainedOwner.target,
            stateKey: candidateReceipt.stateKey,
            target: artifact.target,
            taskId: artifact.id,
          },
        });
      }
      const identity = receiptIdentity(candidateReceipt);
      if (desiredIdentities.has(identity)) {
        throw new LoomError({
          code: 'LOOM_PLAN_COLLISION',
          message: 'Multiple project integrations have the same managed state identity.',
          context: { destination: artifact.destination, taskId: artifact.id },
        });
      }
      desiredIdentities.add(identity);
    }

    const previousByIdentity = new Map(
      previousReceipts.map((receipt) => [receiptIdentity(receipt), receipt]),
    );
    const stale = previousReceipts.filter(
      (receipt) =>
        selectedTargetSet.has(receipt.target) &&
        !desiredIdentities.has(receiptIdentity(receipt)),
    );
    const destinations = new Set([
      ...artifacts.map((artifact) => artifact.destination),
      ...stale.map((receipt) =>
        path.resolve(this.#projectRoot, receipt.destination),
      ),
    ]);
    const workingFiles = new Map<string, WorkingProjectFile>();
    for (const destination of [...destinations].sort(compareCodePoints)) {
      const snapshot = await this.#files.inspect(destination);
      workingFiles.set(destination, { snapshot, content: snapshot.content });
    }
    for (const receipt of stale.sort((left, right) =>
      compareCodePoints(receiptIdentity(left), receiptIdentity(right)),
    )) {
      const destination = path.resolve(this.#projectRoot, receipt.destination);
      const working = workingFiles.get(destination);
      if (working === undefined) {
        throw new LoomError({
          code: 'LOOM_INTERNAL',
          message: 'Stale project integration destination was not prepared.',
          context: { destination },
        });
      }
      const cleaned = await this.#adapters.remove(receipt, working.content);
      if (cleaned !== undefined) {
        working.content = cleaned;
      }
    }

    return new ProjectIntegrationSession({
      adapters: this.#adapters,
      desiredIdentities,
      files: this.#files,
      previousByIdentity,
      projectRoot: this.#projectRoot,
      receipts: retained,
      workingFiles,
    });
  }
}
