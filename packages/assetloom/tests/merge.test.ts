import { describe, expect, it } from 'vitest';
import { mergeConfigurations } from '../src/config/merge.js';

describe('configuration merge', () => {
  it('merges in order, replaces arrays, deletes with null, and tracks provenance', () => {
    const result = mergeConfigurations([
      {
        file: 'base.json',
        value: {
          project: { root: '.', keep: true },
          list: ['base'],
          remove: { nested: true },
        },
      },
      {
        file: 'brand.json',
        value: {
          project: { keep: false },
          list: ['brand'],
          remove: null,
        },
      },
    ]);

    expect(result.value).toEqual({
      project: { root: '.', keep: false },
      list: ['brand'],
    });
    expect(result.provenance.get('/project/root')?.file).toBe('base.json');
    expect(result.provenance.get('/project/keep')?.file).toBe('brand.json');
    expect(result.provenance.get('/list/0')?.file).toBe('brand.json');
    expect(result.provenance.has('/remove')).toBe(false);
  });
});
