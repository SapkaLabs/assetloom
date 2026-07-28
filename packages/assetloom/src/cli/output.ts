import path from 'node:path';
import type { LoomError } from '../domain/errors.js';

export interface OutputOptions {
  readonly json: boolean;
  readonly verbose: boolean;
}

function displayPath(value: unknown): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  const relative = path.relative(process.cwd(), value);
  if (relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/');
  }
  return value;
}

export function printError(
  error: LoomError,
  options: OutputOptions,
): void {
  if (options.json) {
    const serialized: Record<string, unknown> = {
      ok: false,
      error: {
        name: error.name,
        code: error.code,
        message: error.message,
        context: error.context,
      },
    };
    if (options.verbose) {
      (serialized['error'] as Record<string, unknown>)['stack'] = error.stack;
    }
    process.stderr.write(`${JSON.stringify(serialized, null, 2)}\n`);
    return;
  }

  const lines = [`[${error.code}] ${error.message}`];
  const labels: Readonly<Record<string, string>> = {
    file: 'File',
    jsonPointer: 'Path',
    reason: 'Reason',
    sourcePath: 'Source',
    destination: 'Destination',
  };
  const details = Object.entries(labels).flatMap(([key, label]) => {
    const value = error.context[key];
    return value === undefined ? [] : [`${label}: ${displayPath(value)}`];
  });
  if (
    error.code === 'LOOM_PLAN_TARGET_UNSUPPORTED' &&
    Array.isArray(error.context['supportedTargets'])
  ) {
    details.push(
      `Supported targets: ${error.context['supportedTargets'].join(', ')}.`,
    );
  }
  if (details.length > 0) {
    lines.push('', ...details);
  }
  if (options.verbose && error.stack !== undefined) {
    lines.push('', error.stack);
  }
  process.stderr.write(`${lines.join('\n')}\n`);
}

export function printResult(
  value: unknown,
  options: Pick<OutputOptions, 'json'>,
  human: string,
): void {
  process.stdout.write(
    options.json ? `${JSON.stringify(value, null, 2)}\n` : `${human}\n`,
  );
}
