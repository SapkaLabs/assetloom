import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ProjectLock,
  type ProjectLockOptions,
  type ProjectLockOwner,
  type ProjectLockRecoveryClaim,
} from '../src/storage/lock.js';
import { probeProcessLiveness } from '../src/storage/process-identity.js';

const fixtureDirectories: string[] = [];
const localIdentity = {
  hostname: 'assetloom-test-host',
  pid: 8_001,
  startedAt: '2026-07-31T10:00:00.000Z',
} as const;

async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-lock-'));
  fixtureDirectories.push(directory);
  return directory;
}

function owner(overrides: Partial<ProjectLockOwner> = {}): ProjectLockOwner {
  return {
    version: 1,
    ownerId: 'existing-owner',
    hostname: localIdentity.hostname,
    pid: 7_001,
    processStartedAt: '2026-07-31T09:00:00.000Z',
    acquiredAt: '2026-07-31T09:01:00.000Z',
    ...overrides,
  };
}

function recoveryClaim(
  overrides: Partial<ProjectLockRecoveryClaim> = {},
): ProjectLockRecoveryClaim {
  return {
    version: 1,
    recoveryId: 'crashed-recovery',
    targetOwnerId: 'existing-owner',
    hostname: localIdentity.hostname,
    pid: 6_001,
    processStartedAt: '2026-07-31T09:30:00.000Z',
    claimedAt: '2026-07-31T09:31:00.000Z',
    ...overrides,
  };
}

function options(
  probeProcess: NonNullable<ProjectLockOptions['probeProcess']>,
): ProjectLockOptions {
  return {
    processIdentity: localIdentity,
    probeProcess,
    now: () => new Date('2026-07-31T10:01:00.000Z'),
    createOwnerId: () => 'new-owner',
  };
}

async function writeOwner(
  stateDirectory: string,
  lockOwner: ProjectLockOwner,
): Promise<string> {
  const filename = path.join(stateDirectory, 'lock');
  await writeFile(filename, `${JSON.stringify(lockOwner)}\n`);
  return filename;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of fixtureDirectories.splice(0).reverse()) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe('ProjectLock stale-owner recovery', () => {
  it('writes versioned process identity metadata and reports its live local owner', async () => {
    const stateDirectory = await fixture();
    const lock = new ProjectLock(
      stateDirectory,
      undefined,
      options(() => ({ status: 'alive' })),
    );

    await lock.acquire();

    await expect(lock.inspect()).resolves.toEqual({
      status: 'held',
      lockFile: path.join(stateDirectory, 'lock'),
      owner: {
        version: 1,
        ownerId: 'new-owner',
        hostname: localIdentity.hostname,
        pid: localIdentity.pid,
        processStartedAt: localIdentity.startedAt,
        acquiredAt: '2026-07-31T10:01:00.000Z',
      },
      ownerLocation: 'local',
      liveness: { status: 'alive' },
      recoverable: false,
    });
    await lock.release();
  });

  it('automatically replaces a same-host lock only when its PID is provably dead', async () => {
    const stateDirectory = await fixture();
    const existingOwner = owner();
    await writeOwner(stateDirectory, existingOwner);
    const probe = vi.fn((pid: number) =>
      pid === existingOwner.pid
        ? ({ status: 'dead' } as const)
        : ({ status: 'alive' } as const),
    );
    const lock = new ProjectLock(
      stateDirectory,
      undefined,
      options(probe),
    );

    await lock.acquire();

    const persisted = JSON.parse(
      await readFile(path.join(stateDirectory, 'lock'), 'utf8'),
    ) as ProjectLockOwner;
    expect(persisted.ownerId).toBe('new-owner');
    expect(probe).toHaveBeenCalledWith(existingOwner.pid);
    await lock.release();
  });

  it('serializes three stale-lock contenders behind one recovery claim', async () => {
    const stateDirectory = await fixture();
    const existingOwner = owner();
    await writeOwner(stateDirectory, existingOwner);
    let unblockWinner: (() => void) | undefined;
    const winnerBlocked = new Promise<void>((resolve) => {
      unblockWinner = resolve;
    });
    let markClaimHeld: (() => void) | undefined;
    const claimHeld = new Promise<void>((resolve) => {
      markClaimHeld = resolve;
    });
    let winnerProbeCalls = 0;
    const winnerProbe = async () => {
      winnerProbeCalls += 1;
      if (winnerProbeCalls === 2) {
        markClaimHeld?.();
        await winnerBlocked;
      }
      return { status: 'dead' } as const;
    };
    const winner = new ProjectLock(stateDirectory, undefined, {
      ...options(winnerProbe),
      createOwnerId: () => 'winner-owner',
    });
    const contenderOptions = options((pid) =>
      pid === localIdentity.pid
        ? { status: 'alive' }
        : { status: 'dead' },
    );
    const second = new ProjectLock(stateDirectory, undefined, {
      ...contenderOptions,
      createOwnerId: () => 'second-owner',
    });
    const third = new ProjectLock(stateDirectory, undefined, {
      ...contenderOptions,
      createOwnerId: () => 'third-owner',
    });

    const winnerAcquisition = winner.acquire();
    await claimHeld;
    for (const contender of [second, third]) {
      await expect(contender.acquire()).rejects.toMatchObject({
        code: 'LOOM_LOCK_ALREADY_HELD',
        context: {
          recovery: {
            status: 'recovery-in-progress',
            claim: {
              status: 'held',
              ownerLocation: 'local',
              liveness: { status: 'alive' },
              clearable: false,
            },
          },
        },
      });
    }
    unblockWinner?.();
    await winnerAcquisition;

    const persisted = JSON.parse(
      await readFile(path.join(stateDirectory, 'lock'), 'utf8'),
    ) as ProjectLockOwner;
    expect(persisted.ownerId).toBe('winner-owner');
    expect(await readdir(stateDirectory)).toEqual(['lock']);
    await winner.release();
  });

  it('restores a replacement owner that appears at the quarantine boundary', async () => {
    const stateDirectory = await fixture();
    const existingOwner = owner();
    const replacement = owner({
      ownerId: 'replacement-owner',
      pid: 7_002,
    });
    const filename = await writeOwner(stateDirectory, existingOwner);
    let probeCalls = 0;
    const probe = async (pid: number) => {
      probeCalls += 1;
      if (probeCalls === 3) {
        await rm(filename);
        await writeOwner(stateDirectory, replacement);
      }
      return pid === replacement.pid
        ? ({ status: 'alive' } as const)
        : ({ status: 'dead' } as const);
    };
    const lock = new ProjectLock(
      stateDirectory,
      undefined,
      options(probe),
    );

    await expect(lock.acquire()).rejects.toMatchObject({
      code: 'LOOM_LOCK_ALREADY_HELD',
      context: {
        lock: {
          status: 'held',
          owner: { ownerId: replacement.ownerId },
          liveness: { status: 'alive' },
        },
      },
    });
    expect(JSON.parse(await readFile(filename, 'utf8'))).toEqual(replacement);
    expect(await readdir(stateDirectory)).toEqual(['lock']);
  });

  it('fails closed with actionable diagnostics for a live recovery claim', async () => {
    const stateDirectory = await fixture();
    const existingOwner = owner();
    const claim = recoveryClaim();
    const filename = await writeOwner(stateDirectory, existingOwner);
    const claimFilename = path.join(stateDirectory, 'lock.recovery');
    await writeFile(claimFilename, `${JSON.stringify(claim)}\n`);
    const lock = new ProjectLock(
      stateDirectory,
      undefined,
      options((pid) =>
        pid === claim.pid ? { status: 'alive' } : { status: 'dead' },
      ),
    );

    await expect(lock.acquire()).rejects.toMatchObject({
      code: 'LOOM_LOCK_ALREADY_HELD',
      context: {
        recovery: {
          status: 'recovery-in-progress',
          claim: {
            status: 'held',
            claimFile: claimFilename,
            claim,
            liveness: { status: 'alive' },
            clearable: false,
          },
        },
      },
    });
    const recovery = await lock.recoverStale(existingOwner.ownerId);
    expect(recovery.status).toBe('recovery-in-progress');
    if (recovery.status !== 'recovery-in-progress') {
      throw new Error('Expected recovery-in-progress diagnostics.');
    }
    expect(recovery.guidance).toContain('clear it only after proving');
    expect(JSON.parse(await readFile(filename, 'utf8'))).toEqual(existingOwner);
    expect(JSON.parse(await readFile(claimFilename, 'utf8'))).toEqual(claim);
  });

  it.each([
    ['remote', `${JSON.stringify(recoveryClaim({ hostname: 'remote-host' }))}\n`],
    ['malformed', '{not-json}\n'],
  ])('fails closed for a %s recovery claim', async (_label, claimContents) => {
    const stateDirectory = await fixture();
    const existingOwner = owner();
    const filename = await writeOwner(stateDirectory, existingOwner);
    const claimFilename = path.join(stateDirectory, 'lock.recovery');
    await writeFile(claimFilename, claimContents);
    const lock = new ProjectLock(
      stateDirectory,
      undefined,
      options(() => ({ status: 'dead' })),
    );

    await expect(lock.acquire()).rejects.toMatchObject({
      code: 'LOOM_LOCK_ALREADY_HELD',
      context: {
        recovery: {
          status: 'recovery-in-progress',
          claim: { clearable: false },
        },
      },
    });
    expect(JSON.parse(await readFile(filename, 'utf8'))).toEqual(existingOwner);
    expect(await readFile(claimFilename, 'utf8')).toBe(claimContents);
  });

  it('clears a dead local recovery claim only with its validated token', async () => {
    const stateDirectory = await fixture();
    const existingOwner = owner();
    const claim = recoveryClaim();
    await writeOwner(stateDirectory, existingOwner);
    await writeFile(
      path.join(stateDirectory, 'lock.recovery'),
      `${JSON.stringify(claim)}\n`,
    );
    const lock = new ProjectLock(
      stateDirectory,
      undefined,
      options((pid) =>
        pid === localIdentity.pid ? { status: 'alive' } : { status: 'dead' },
      ),
    );

    await expect(lock.inspectRecoveryClaim()).resolves.toMatchObject({
      status: 'held',
      claim,
      ownerLocation: 'local',
      liveness: { status: 'dead' },
      clearable: true,
    });
    await expect(
      lock.clearAbandonedRecoveryClaim('different-recovery'),
    ).resolves.toMatchObject({ status: 'owner-changed' });
    await expect(
      lock.clearAbandonedRecoveryClaim(claim.recoveryId),
    ).resolves.toEqual({ status: 'cleared', claim });

    await lock.acquire();
    expect((await lock.inspect()).status).toBe('held');
    await lock.release();
    expect(await readdir(stateDirectory)).toEqual([]);
  });

  it.each([
    ['live', { status: 'alive' } as const],
    ['ambiguous', { status: 'ambiguous', errorCode: 'EPERM' } as const],
  ])('preserves a %s local owner', async (_label, liveness) => {
    const stateDirectory = await fixture();
    const existingOwner = owner();
    const filename = await writeOwner(stateDirectory, existingOwner);
    const serialized = await readFile(filename, 'utf8');
    const lock = new ProjectLock(
      stateDirectory,
      undefined,
      options(() => liveness),
    );

    await expect(lock.acquire()).rejects.toMatchObject({
      code: 'LOOM_LOCK_ALREADY_HELD',
      context: {
        lock: {
          status: 'held',
          liveness,
          recoverable: false,
        },
      },
    });
    expect(await readFile(filename, 'utf8')).toBe(serialized);
  });

  it('never probes or removes a remote-host owner', async () => {
    const stateDirectory = await fixture();
    const existingOwner = owner({ hostname: 'another-host' });
    const filename = await writeOwner(stateDirectory, existingOwner);
    const serialized = await readFile(filename, 'utf8');
    const probe = vi.fn(() => ({ status: 'dead' } as const));
    const lock = new ProjectLock(
      stateDirectory,
      undefined,
      options(probe),
    );

    await expect(lock.acquire()).rejects.toMatchObject({
      code: 'LOOM_LOCK_ALREADY_HELD',
      context: {
        lock: {
          status: 'held',
          ownerLocation: 'remote',
          recoverable: false,
        },
      },
    });
    expect(probe).not.toHaveBeenCalled();
    expect(await readFile(filename, 'utf8')).toBe(serialized);
  });

  it.each([
    ['malformed', '{not-json}\n'],
    ['legacy', '{"pid":7001,"acquiredAt":"2026-07-31T09:01:00.000Z"}\n'],
  ])('preserves %s lock metadata as ambiguous', async (_label, serialized) => {
    const stateDirectory = await fixture();
    const filename = path.join(stateDirectory, 'lock');
    await writeFile(filename, serialized);
    const lock = new ProjectLock(
      stateDirectory,
      undefined,
      options(() => ({ status: 'dead' })),
    );

    await expect(lock.acquire()).rejects.toMatchObject({
      code: 'LOOM_LOCK_ALREADY_HELD',
      context: {
        lock: {
          status: 'invalid',
          reason: 'metadata-invalid',
          recoverable: false,
        },
      },
    });
    expect(await readFile(filename, 'utf8')).toBe(serialized);
  });

  it('requires the inspected owner token for explicit recovery', async () => {
    const stateDirectory = await fixture();
    const existingOwner = owner();
    const filename = await writeOwner(stateDirectory, existingOwner);
    const serialized = await readFile(filename, 'utf8');
    const lock = new ProjectLock(
      stateDirectory,
      undefined,
      options(() => ({ status: 'dead' })),
    );

    await expect(lock.recoverStale('different-owner')).resolves.toMatchObject({
      status: 'owner-changed',
    });
    expect(await readFile(filename, 'utf8')).toBe(serialized);

    await expect(lock.recoverStale(existingOwner.ownerId)).resolves.toEqual({
      status: 'recovered',
      owner: existingOwner,
    });
  });

  it('does not release a lock that was replaced by another owner', async () => {
    const stateDirectory = await fixture();
    const filename = path.join(stateDirectory, 'lock');
    const lock = new ProjectLock(
      stateDirectory,
      undefined,
      options(() => ({ status: 'alive' })),
    );
    await lock.acquire();
    await rm(filename);
    const replacement = owner({ ownerId: 'replacement-owner' });
    await writeOwner(stateDirectory, replacement);

    await expect(lock.release()).rejects.toMatchObject({
      code: 'LOOM_LOCK_ALREADY_HELD',
      context: { expectedOwnerId: 'new-owner' },
    });
    expect(JSON.parse(await readFile(filename, 'utf8'))).toEqual(replacement);
  });

  it('restores a replacement owner that appears during release validation', async () => {
    const stateDirectory = await fixture();
    const filename = path.join(stateDirectory, 'lock');
    const replacement = owner({ ownerId: 'replacement-owner' });
    let replaceDuringProbe = false;
    const probe = async () => {
      if (replaceDuringProbe) {
        replaceDuringProbe = false;
        await rm(filename);
        await writeOwner(stateDirectory, replacement);
      }
      return { status: 'alive' } as const;
    };
    const lock = new ProjectLock(
      stateDirectory,
      undefined,
      options(probe),
    );
    await lock.acquire();
    replaceDuringProbe = true;

    await expect(lock.release()).rejects.toMatchObject({
      code: 'LOOM_LOCK_ALREADY_HELD',
    });
    expect(JSON.parse(await readFile(filename, 'utf8'))).toEqual(replacement);
    expect(await readdir(stateDirectory)).toEqual(['lock']);
  });

  it('serializes concurrent release calls on one lock instance', async () => {
    const stateDirectory = await fixture();
    let enterProbe: (() => void) | undefined;
    const probeEntered = new Promise<void>((resolve) => {
      enterProbe = resolve;
    });
    let unblockProbe: (() => void) | undefined;
    const probeBlocked = new Promise<void>((resolve) => {
      unblockProbe = resolve;
    });
    const probe = vi.fn(async () => {
      enterProbe?.();
      await probeBlocked;
      return { status: 'alive' } as const;
    });
    const lock = new ProjectLock(
      stateDirectory,
      undefined,
      options(probe),
    );
    await lock.acquire();

    const firstRelease = lock.release();
    await probeEntered;
    const secondRelease = lock.release();
    unblockProbe?.();
    await Promise.all([firstRelease, secondRelease]);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(await readdir(stateDirectory)).toEqual([]);
  });
});

describe('probeProcessLiveness', () => {
  it('recognizes the current process as alive on the host platform', () => {
    expect(probeProcessLiveness(process.pid)).toEqual({ status: 'alive' });
  });

  it('treats permission failures as ambiguous', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      const cause = new Error('not permitted') as NodeJS.ErrnoException;
      cause.code = 'EPERM';
      throw cause;
    });

    expect(probeProcessLiveness(123)).toEqual({
      status: 'ambiguous',
      errorCode: 'EPERM',
    });
  });

  it('uses ESRCH as the only proof that a PID is dead', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      const cause = new Error('not found') as NodeJS.ErrnoException;
      cause.code = 'ESRCH';
      throw cause;
    });

    expect(probeProcessLiveness(123)).toEqual({ status: 'dead' });
  });
});
