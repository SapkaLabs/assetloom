import { describe, expect, it } from 'vitest';
import { LoomError, asLoomError } from '../src/domain/errors.js';
import { parseTarget } from '../src/planner/index.js';

describe('stable errors', () => {
  it('rejects unsupported targets with the public plan error', () => {
    expect(() => parseTarget('expo')).toThrow(
      expect.objectContaining({
        code: 'LOOM_PLAN_TARGET_UNSUPPORTED',
        message: 'Unsupported target "expo".',
      }),
    );
  });

  it('wraps unexpected errors without losing the cause', () => {
    const cause = new Error('dependency detail');
    const error = asLoomError(cause);
    expect(error).toBeInstanceOf(LoomError);
    expect(error.code).toBe('LOOM_INTERNAL');
    expect(error.cause).toBe(cause);
  });
});
