import path from 'node:path';
import {
  ProjectLock,
  type ProjectLockRecoveryClaimClearResult,
  type ProjectLockRecoveryClaimInspection,
} from '../storage/lock.js';
import { ProjectStatePathGuard } from '../storage/state-path-guard.js';

function recoveryLock(projectRoot: string): ProjectLock {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const stateDirectory = path.join(resolvedProjectRoot, '.assetloom');
  return new ProjectLock(
    stateDirectory,
    new ProjectStatePathGuard(resolvedProjectRoot, stateDirectory),
  );
}

/**
 * Inspects a recovery claim as the first step of manual recovery. Stop every
 * Assetloom process for the project and use exactly one recovery operator for
 * the complete inspect-and-clear sequence.
 */
export async function inspectProjectLockRecoveryClaim(
  projectRoot: string,
): Promise<ProjectLockRecoveryClaimInspection> {
  return recoveryLock(projectRoot).inspectRecoveryClaim();
}

/**
 * Clears a provably abandoned local recovery claim after token revalidation.
 * This manual recovery sequence requires every Assetloom process for the
 * project to be stopped and exactly one operator to perform inspect then clear.
 * Live, remote, ambiguous, and malformed claims remain non-clearable.
 */
export async function clearAbandonedProjectLockRecoveryClaim(
  projectRoot: string,
  expectedRecoveryId: string,
): Promise<ProjectLockRecoveryClaimClearResult> {
  return recoveryLock(projectRoot).clearAbandonedRecoveryClaim(
    expectedRecoveryId,
  );
}
