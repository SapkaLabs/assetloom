import { hostname } from 'node:os';

export interface LocalProcessIdentity {
  readonly hostname: string;
  readonly pid: number;
  readonly startedAt: string;
}

export type ProcessLiveness =
  | { readonly status: 'alive' }
  | { readonly status: 'dead' }
  | {
      readonly status: 'ambiguous';
      readonly errorCode?: string;
    };

export type ProcessLivenessProbe = (
  pid: number,
) => ProcessLiveness | Promise<ProcessLiveness>;

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

/**
 * Node implements signal 0 as an existence check on POSIX and Windows. Only
 * ESRCH proves absence; permission and platform errors are deliberately
 * ambiguous so callers never reclaim a possibly live process's lock.
 */
export const probeProcessLiveness: ProcessLivenessProbe = (pid) => {
  try {
    process.kill(pid, 0);
    return { status: 'alive' };
  } catch (cause) {
    const code = errorCode(cause);
    if (code === 'ESRCH') {
      return { status: 'dead' };
    }
    return code === undefined
      ? { status: 'ambiguous' }
      : { status: 'ambiguous', errorCode: code };
  }
};

export function currentProcessIdentity(): LocalProcessIdentity {
  return {
    hostname: hostname(),
    pid: process.pid,
    startedAt: new Date(Date.now() - process.uptime() * 1_000).toISOString(),
  };
}
