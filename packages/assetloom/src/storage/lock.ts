import { randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { LoomError } from '../domain/errors.js';
import {
  currentProcessIdentity,
  probeProcessLiveness,
  type LocalProcessIdentity,
  type ProcessLiveness,
  type ProcessLivenessProbe,
} from './process-identity.js';
import type { ProjectStatePathGuard } from './state-path-guard.js';

const lockMetadataVersion = 1;

export interface ProjectLockOwner {
  readonly version: typeof lockMetadataVersion;
  readonly ownerId: string;
  readonly hostname: string;
  readonly pid: number;
  readonly processStartedAt: string;
  readonly acquiredAt: string;
}

export interface ProjectLockRecoveryClaim {
  readonly version: typeof lockMetadataVersion;
  readonly recoveryId: string;
  readonly targetOwnerId: string;
  readonly hostname: string;
  readonly pid: number;
  readonly processStartedAt: string;
  readonly claimedAt: string;
}

export type ProjectLockRecoveryClaimInspection =
  | { readonly status: 'absent'; readonly claimFile: string }
  | {
      readonly status: 'held';
      readonly claimFile: string;
      readonly claim: ProjectLockRecoveryClaim;
      readonly ownerLocation: 'local' | 'remote';
      readonly liveness: ProcessLiveness;
      readonly clearable: boolean;
    }
  | {
      readonly status: 'invalid';
      readonly claimFile: string;
      readonly clearable: false;
      readonly errorCode?: string;
    };

export type ProjectLockRecoveryClaimClearResult =
  | { readonly status: 'cleared'; readonly claim: ProjectLockRecoveryClaim }
  | { readonly status: 'already-absent' }
  | {
      readonly status: 'not-clearable';
      readonly inspection: Exclude<
        ProjectLockRecoveryClaimInspection,
        { readonly status: 'absent' }
      >;
    }
  | {
      readonly status: 'owner-changed';
      readonly inspection: ProjectLockRecoveryClaimInspection;
      readonly quarantineFile?: string;
    };

export type ProjectLockInspection =
  | {
      readonly status: 'unlocked';
      readonly lockFile: string;
    }
  | {
      readonly status: 'held';
      readonly lockFile: string;
      readonly owner: ProjectLockOwner;
      readonly ownerLocation: 'local' | 'remote';
      readonly liveness: ProcessLiveness;
      readonly recoverable: boolean;
    }
  | {
      readonly status: 'invalid';
      readonly lockFile: string;
      readonly reason: 'metadata-invalid' | 'metadata-unreadable';
      readonly recoverable: false;
      readonly errorCode?: string;
    };

export type ProjectLockRecoveryResult =
  | {
      readonly status: 'recovered';
      readonly owner: ProjectLockOwner;
    }
  | { readonly status: 'already-unlocked' }
  | {
      readonly status: 'not-recoverable';
      readonly inspection: Exclude<
        ProjectLockInspection,
        { readonly status: 'unlocked' }
      >;
    }
  | {
      readonly status: 'owner-changed';
      readonly inspection: ProjectLockInspection;
      readonly quarantineFile?: string;
    }
  | {
      readonly status: 'recovery-in-progress';
      readonly claim: ProjectLockRecoveryClaimInspection;
      readonly guidance: string;
    };

export interface ProjectLockOptions {
  readonly processIdentity?: LocalProcessIdentity;
  readonly probeProcess?: ProcessLivenessProbe;
  readonly now?: () => Date;
  readonly createOwnerId?: () => string;
}

function errorCode(cause: unknown): string | undefined {
  if (
    typeof cause !== 'object' ||
    cause === null ||
    !('code' in cause) ||
    typeof cause.code !== 'string'
  ) {
    return undefined;
  }
  return cause.code;
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function parseOwner(value: unknown): ProjectLockOwner | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  if (
    !('version' in value) ||
    value.version !== lockMetadataVersion ||
    !('ownerId' in value) ||
    typeof value.ownerId !== 'string' ||
    value.ownerId.length === 0 ||
    !('hostname' in value) ||
    typeof value.hostname !== 'string' ||
    value.hostname.length === 0 ||
    !('pid' in value) ||
    !Number.isSafeInteger(value.pid) ||
    typeof value.pid !== 'number' ||
    value.pid <= 0 ||
    !('processStartedAt' in value) ||
    !isValidDate(value.processStartedAt) ||
    !('acquiredAt' in value) ||
    !isValidDate(value.acquiredAt)
  ) {
    return undefined;
  }
  return {
    version: lockMetadataVersion,
    ownerId: value.ownerId,
    hostname: value.hostname,
    pid: value.pid,
    processStartedAt: value.processStartedAt,
    acquiredAt: value.acquiredAt,
  };
}

function parseRecoveryClaim(
  value: unknown,
): ProjectLockRecoveryClaim | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  if (
    !('version' in value) ||
    value.version !== lockMetadataVersion ||
    !('recoveryId' in value) ||
    typeof value.recoveryId !== 'string' ||
    value.recoveryId.length === 0 ||
    !('targetOwnerId' in value) ||
    typeof value.targetOwnerId !== 'string' ||
    value.targetOwnerId.length === 0 ||
    !('hostname' in value) ||
    typeof value.hostname !== 'string' ||
    value.hostname.length === 0 ||
    !('pid' in value) ||
    typeof value.pid !== 'number' ||
    !Number.isSafeInteger(value.pid) ||
    value.pid <= 0 ||
    !('processStartedAt' in value) ||
    !isValidDate(value.processStartedAt) ||
    !('claimedAt' in value) ||
    !isValidDate(value.claimedAt)
  ) {
    return undefined;
  }
  return {
    version: lockMetadataVersion,
    recoveryId: value.recoveryId,
    targetOwnerId: value.targetOwnerId,
    hostname: value.hostname,
    pid: value.pid,
    processStartedAt: value.processStartedAt,
    claimedAt: value.claimedAt,
  };
}

function diagnosticContext(inspection: ProjectLockInspection): Readonly<Record<string, unknown>> {
  return { lock: inspection };
}

export class ProjectLock {
  readonly #filename: string;
  readonly #recoveryClaimFilename: string;
  readonly #statePaths: ProjectStatePathGuard | undefined;
  readonly #processIdentity: LocalProcessIdentity;
  readonly #probeProcess: ProcessLivenessProbe;
  readonly #now: () => Date;
  readonly #createOwnerId: () => string;
  #held = false;
  #ownerId: string | undefined;
  #releasePromise: Promise<void> | undefined;

  constructor(
    stateDirectory: string,
    statePaths?: ProjectStatePathGuard,
    options: ProjectLockOptions = {},
  ) {
    this.#filename = path.join(stateDirectory, 'lock');
    this.#recoveryClaimFilename = path.join(stateDirectory, 'lock.recovery');
    this.#statePaths = statePaths;
    this.#processIdentity = options.processIdentity ?? currentProcessIdentity();
    this.#probeProcess = options.probeProcess ?? probeProcessLiveness;
    this.#now = options.now ?? (() => new Date());
    this.#createOwnerId = options.createOwnerId ?? randomUUID;
  }

  async acquire(): Promise<void> {
    await this.#statePaths?.assertSafe(this.#filename);
    const owner = this.#newOwner();
    let recoveryDiagnostic: ProjectLockRecoveryResult | undefined;
    try {
      await this.#create(owner);
    } catch (cause) {
      if (errorCode(cause) !== 'EEXIST') {
        throw this.#acquireFailure(cause);
      }

      const inspection = await this.inspect();
      if (inspection.status === 'held' && inspection.recoverable) {
        const recovery = await this.recoverStale(inspection.owner.ownerId);
        recoveryDiagnostic = recovery;
        if (
          recovery.status === 'recovered' ||
          recovery.status === 'already-unlocked'
        ) {
          try {
            await this.#create(owner);
            return;
          } catch (retryCause) {
            if (errorCode(retryCause) !== 'EEXIST') {
              throw this.#acquireFailure(retryCause);
            }
          }
        }
      }

      const currentInspection = await this.inspect();
      throw new LoomError({
        code: 'LOOM_LOCK_ALREADY_HELD',
        message:
          'Another Assetloom operation holds the project lock and its ownership cannot be safely recovered.',
        cause,
        context: {
          lockFile: this.#filename,
          ...diagnosticContext(currentInspection),
          ...(recoveryDiagnostic === undefined
            ? {}
            : { recovery: recoveryDiagnostic }),
        },
      });
    }
  }

  async inspect(): Promise<ProjectLockInspection> {
    await this.#statePaths?.assertSafe(this.#filename);
    let serialized: string;
    try {
      serialized = await readFile(this.#filename, 'utf8');
    } catch (cause) {
      const code = errorCode(cause);
      if (code === 'ENOENT') {
        return { status: 'unlocked', lockFile: this.#filename };
      }
      return code === undefined
        ? {
            status: 'invalid',
            lockFile: this.#filename,
            reason: 'metadata-unreadable',
            recoverable: false,
          }
        : {
            status: 'invalid',
            lockFile: this.#filename,
            reason: 'metadata-unreadable',
            recoverable: false,
            errorCode: code,
          };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      return {
        status: 'invalid',
        lockFile: this.#filename,
        reason: 'metadata-invalid',
        recoverable: false,
      };
    }
    const owner = parseOwner(parsed);
    if (owner === undefined) {
      return {
        status: 'invalid',
        lockFile: this.#filename,
        reason: 'metadata-invalid',
        recoverable: false,
      };
    }

    if (
      owner.hostname.toLocaleLowerCase('en-US') !==
      this.#processIdentity.hostname.toLocaleLowerCase('en-US')
    ) {
      return {
        status: 'held',
        lockFile: this.#filename,
        owner,
        ownerLocation: 'remote',
        liveness: { status: 'ambiguous' },
        recoverable: false,
      };
    }

    const liveness = await this.#probeProcess(owner.pid);
    return {
      status: 'held',
      lockFile: this.#filename,
      owner,
      ownerLocation: 'local',
      liveness,
      recoverable: liveness.status === 'dead',
    };
  }

  async inspectRecoveryClaim(): Promise<ProjectLockRecoveryClaimInspection> {
    await this.#statePaths?.assertSafe(this.#recoveryClaimFilename);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(this.#recoveryClaimFilename, 'utf8'));
    } catch (cause) {
      const code = errorCode(cause);
      if (code === 'ENOENT') {
        return { status: 'absent', claimFile: this.#recoveryClaimFilename };
      }
      return code === undefined
        ? {
            status: 'invalid',
            claimFile: this.#recoveryClaimFilename,
            clearable: false,
          }
        : {
            status: 'invalid',
            claimFile: this.#recoveryClaimFilename,
            clearable: false,
            errorCode: code,
          };
    }
    const claim = parseRecoveryClaim(parsed);
    if (claim === undefined) {
      return {
        status: 'invalid',
        claimFile: this.#recoveryClaimFilename,
        clearable: false,
      };
    }
    if (
      claim.hostname.toLowerCase() !==
      this.#processIdentity.hostname.toLowerCase()
    ) {
      return {
        status: 'held',
        claimFile: this.#recoveryClaimFilename,
        claim,
        ownerLocation: 'remote',
        liveness: { status: 'ambiguous' },
        clearable: false,
      };
    }
    const liveness = await this.#probeProcess(claim.pid);
    return {
      status: 'held',
      claimFile: this.#recoveryClaimFilename,
      claim,
      ownerLocation: 'local',
      liveness,
      clearable: liveness.status === 'dead',
    };
  }

  /**
   * Removes a stale lock only when the caller supplies the inspected owner token,
   * the token is unchanged, and the same-host PID is still provably absent.
   */
  async recoverStale(expectedOwnerId: string): Promise<ProjectLockRecoveryResult> {
    const recoveryId = randomUUID();
    const claim: ProjectLockRecoveryClaim = {
      version: lockMetadataVersion,
      recoveryId,
      targetOwnerId: expectedOwnerId,
      hostname: this.#processIdentity.hostname,
      pid: this.#processIdentity.pid,
      processStartedAt: this.#processIdentity.startedAt,
      claimedAt: this.#now().toISOString(),
    };
    await this.#statePaths?.assertSafe(this.#recoveryClaimFilename);
    try {
      const handle = await open(this.#recoveryClaimFilename, 'wx');
      try {
        await handle.writeFile(`${JSON.stringify(claim)}\n`);
      } finally {
        await handle.close();
      }
    } catch (cause) {
      if (errorCode(cause) === 'EEXIST') {
        return {
          status: 'recovery-in-progress',
          claim: await this.inspectRecoveryClaim(),
          guidance:
            'Inspect the recovery claim and clear it only after proving its local process is dead.',
        };
      }
      throw this.#acquireFailure(cause);
    }

    try {
    const inspection = await this.inspect();
    if (inspection.status === 'unlocked') {
      return { status: 'already-unlocked' };
    }
    if (inspection.status === 'invalid' || !inspection.recoverable) {
      return { status: 'not-recoverable', inspection };
    }
    if (inspection.owner.ownerId !== expectedOwnerId) {
      return { status: 'owner-changed', inspection };
    }

    const revalidated = await this.inspect();
    if (
      revalidated.status !== 'held' ||
      !revalidated.recoverable ||
      revalidated.owner.ownerId !== expectedOwnerId
    ) {
      return { status: 'owner-changed', inspection: revalidated };
    }

    const quarantine = await this.#quarantineOwnedLock(expectedOwnerId);
    if (quarantine.status === 'missing') {
      return { status: 'already-unlocked' };
    }
    if (quarantine.status === 'owner-changed') {
      return quarantine.quarantineFile === undefined
        ? {
            status: 'owner-changed',
            inspection: quarantine.inspection,
          }
        : {
            status: 'owner-changed',
            inspection: quarantine.inspection,
            quarantineFile: quarantine.quarantineFile,
          };
    }
    return { status: 'recovered', owner: revalidated.owner };
    } finally {
      await this.#removeOwnedRecoveryClaim(recoveryId);
    }
  }

  /**
   * Explicitly clears a crashed recovery claim. Callers must first inspect it
   * and supply its token; live, remote, malformed, and changed claims fail closed.
   */
  async clearAbandonedRecoveryClaim(
    expectedRecoveryId: string,
  ): Promise<ProjectLockRecoveryClaimClearResult> {
    const inspection = await this.inspectRecoveryClaim();
    if (inspection.status === 'absent') {
      return { status: 'already-absent' };
    }
    if (inspection.status === 'invalid' || !inspection.clearable) {
      return { status: 'not-clearable', inspection };
    }
    if (inspection.claim.recoveryId !== expectedRecoveryId) {
      return { status: 'owner-changed', inspection };
    }
    const revalidated = await this.inspectRecoveryClaim();
    if (
      revalidated.status !== 'held' ||
      !revalidated.clearable ||
      revalidated.claim.recoveryId !== expectedRecoveryId
    ) {
      return { status: 'owner-changed', inspection: revalidated };
    }

    const quarantine = await this.#quarantineRecoveryClaim(expectedRecoveryId);
    if (quarantine.status === 'missing') {
      return { status: 'already-absent' };
    }
    if (quarantine.status === 'owner-changed') {
      return quarantine.quarantineFile === undefined
        ? { status: 'owner-changed', inspection: quarantine.inspection }
        : {
            status: 'owner-changed',
            inspection: quarantine.inspection,
            quarantineFile: quarantine.quarantineFile,
          };
    }
    return { status: 'cleared', claim: revalidated.claim };
  }

  async release(): Promise<void> {
    if (this.#releasePromise !== undefined) {
      await this.#releasePromise;
      return;
    }
    if (!this.#held) {
      return;
    }
    const releasePromise = this.#releaseHeld();
    this.#releasePromise = releasePromise;
    try {
      await releasePromise;
    } finally {
      if (this.#releasePromise === releasePromise) {
        this.#releasePromise = undefined;
      }
    }
  }

  async #releaseHeld(): Promise<void> {
    await this.#statePaths?.assertSafe(this.#filename);
    const inspection = await this.inspect();
    if (inspection.status === 'unlocked') {
      this.#held = false;
      this.#ownerId = undefined;
      return;
    }
    if (
      inspection.status !== 'held' ||
      inspection.owner.ownerId !== this.#ownerId
    ) {
      throw new LoomError({
        code: 'LOOM_LOCK_ALREADY_HELD',
        message:
          'Refusing to release the project lock because its owner changed.',
        context: {
          lockFile: this.#filename,
          expectedOwnerId: this.#ownerId,
          ...diagnosticContext(inspection),
        },
      });
    }
    const quarantine = await this.#quarantineOwnedLock(this.#ownerId);
    if (quarantine.status === 'owner-changed') {
      throw new LoomError({
        code: 'LOOM_LOCK_ALREADY_HELD',
        message:
          'Refusing to release the project lock because its owner changed during release.',
        context: {
          lockFile: this.#filename,
          expectedOwnerId: this.#ownerId,
          ...(quarantine.quarantineFile === undefined
            ? {}
            : { quarantineFile: quarantine.quarantineFile }),
          ...diagnosticContext(quarantine.inspection),
        },
      });
    }
    this.#held = false;
    this.#ownerId = undefined;
  }

  async #create(owner: ProjectLockOwner): Promise<void> {
    await mkdir(path.dirname(this.#filename), { recursive: true });
    await this.#statePaths?.assertSafe(this.#filename);
    const handle = await open(this.#filename, 'wx');
    try {
      await handle.writeFile(`${JSON.stringify(owner)}\n`);
    } finally {
      await handle.close();
    }
    this.#held = true;
    this.#ownerId = owner.ownerId;
  }

  #newOwner(): ProjectLockOwner {
    return {
      version: lockMetadataVersion,
      ownerId: this.#createOwnerId(),
      hostname: this.#processIdentity.hostname,
      pid: this.#processIdentity.pid,
      processStartedAt: this.#processIdentity.startedAt,
      acquiredAt: this.#now().toISOString(),
    };
  }

  #acquireFailure(cause: unknown): LoomError {
    return new LoomError({
      code: 'LOOM_LOCK_ACQUIRE_FAILED',
      message: 'Failed to acquire or recover the Assetloom project lock.',
      cause,
      context: { lockFile: this.#filename },
    });
  }

  async #quarantineOwnedLock(
    expectedOwnerId: string,
  ): Promise<
    | { readonly status: 'removed' }
    | { readonly status: 'missing' }
    | {
        readonly status: 'owner-changed';
        readonly inspection: ProjectLockInspection;
        readonly quarantineFile?: string;
      }
  > {
    const quarantineFilename = path.join(
      path.dirname(this.#filename),
      `lock.quarantine-${randomUUID()}`,
    );
    await this.#statePaths?.assertSafe(this.#filename);
    await this.#statePaths?.assertSafe(quarantineFilename);
    try {
      await rename(this.#filename, quarantineFilename);
    } catch (cause) {
      if (errorCode(cause) === 'ENOENT') {
        return { status: 'missing' };
      }
      throw this.#acquireFailure(cause);
    }

    const quarantinedOwner = await this.#readOwner(quarantineFilename);
    if (quarantinedOwner?.ownerId === expectedOwnerId) {
      await rm(quarantineFilename);
      return { status: 'removed' };
    }

    // Hard-link restoration is create-if-absent on both Windows and POSIX. It
    // never overwrites a successor that acquired the now-empty lock path.
    let restored = false;
    try {
      await link(quarantineFilename, this.#filename);
      restored = true;
    } catch (cause) {
      if (errorCode(cause) !== 'EEXIST') {
        throw new LoomError({
          code: 'LOOM_LOCK_ACQUIRE_FAILED',
          message:
            'Lock ownership changed during quarantine and could not be safely restored.',
          cause,
          context: {
            lockFile: this.#filename,
            quarantineFile: quarantineFilename,
            expectedOwnerId,
            quarantinedOwnerId: quarantinedOwner?.ownerId,
          },
        });
      }
    }
    if (restored) {
      await rm(quarantineFilename);
      return { status: 'owner-changed', inspection: await this.inspect() };
    }
    return {
      status: 'owner-changed',
      inspection: await this.inspect(),
      quarantineFile: quarantineFilename,
    };
  }

  async #readOwner(filename: string): Promise<ProjectLockOwner | undefined> {
    await this.#statePaths?.assertSafe(filename);
    try {
      return parseOwner(JSON.parse(await readFile(filename, 'utf8')));
    } catch {
      return undefined;
    }
  }

  async #quarantineRecoveryClaim(
    expectedRecoveryId: string,
  ): Promise<
    | { readonly status: 'removed' }
    | { readonly status: 'missing' }
    | {
        readonly status: 'owner-changed';
        readonly inspection: ProjectLockRecoveryClaimInspection;
        readonly quarantineFile?: string;
      }
  > {
    const quarantineFilename = path.join(
      path.dirname(this.#filename),
      `lock.recovery-quarantine-${randomUUID()}`,
    );
    await this.#statePaths?.assertSafe(this.#recoveryClaimFilename);
    await this.#statePaths?.assertSafe(quarantineFilename);
    try {
      await rename(this.#recoveryClaimFilename, quarantineFilename);
    } catch (cause) {
      if (errorCode(cause) === 'ENOENT') {
        return { status: 'missing' };
      }
      throw this.#acquireFailure(cause);
    }

    const quarantinedClaim = await this.#readRecoveryClaim(quarantineFilename);
    if (quarantinedClaim?.recoveryId === expectedRecoveryId) {
      await rm(quarantineFilename);
      return { status: 'removed' };
    }

    let restored = false;
    try {
      await link(quarantineFilename, this.#recoveryClaimFilename);
      restored = true;
    } catch (cause) {
      if (errorCode(cause) !== 'EEXIST') {
        throw new LoomError({
          code: 'LOOM_LOCK_ACQUIRE_FAILED',
          message:
            'Recovery-claim ownership changed during quarantine and could not be safely restored.',
          cause,
          context: {
            claimFile: this.#recoveryClaimFilename,
            quarantineFile: quarantineFilename,
            expectedRecoveryId,
            quarantinedRecoveryId: quarantinedClaim?.recoveryId,
          },
        });
      }
    }
    if (restored) {
      await rm(quarantineFilename);
      return {
        status: 'owner-changed',
        inspection: await this.inspectRecoveryClaim(),
      };
    }
    return {
      status: 'owner-changed',
      inspection: await this.inspectRecoveryClaim(),
      quarantineFile: quarantineFilename,
    };
  }

  async #readRecoveryClaim(
    filename: string,
  ): Promise<ProjectLockRecoveryClaim | undefined> {
    await this.#statePaths?.assertSafe(filename);
    try {
      return parseRecoveryClaim(JSON.parse(await readFile(filename, 'utf8')));
    } catch {
      return undefined;
    }
  }

  async #removeOwnedRecoveryClaim(expectedRecoveryId: string): Promise<void> {
    const current = await this.#readRecoveryClaim(this.#recoveryClaimFilename);
    if (current?.recoveryId !== expectedRecoveryId) {
      return;
    }
    await this.#quarantineRecoveryClaim(expectedRecoveryId);
  }

}
