import { describe, it, expect, vi } from 'vitest';
import { log, errorFields } from '../src/logger.js';

describe('logger', () => {
  it('exposes spyable level methods that forward without throwing', () => {
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      const spy = vi.spyOn(log, level).mockImplementation(() => {});
      log[level]('test.event', { a: 1 });
      expect(spy).toHaveBeenCalledWith('test.event', { a: 1 });
      spy.mockRestore();
    }
  });

  it('errorFields compacts an Error to message + name', () => {
    const e = new TypeError('boom');
    expect(errorFields(e)).toEqual({ err: 'boom', errName: 'TypeError' });
  });

  it('errorFields stringifies non-Error throwables', () => {
    expect(errorFields('nope')).toEqual({ err: 'nope' });
    expect(errorFields(42)).toEqual({ err: '42' });
  });

  it('errorFields surfaces err.cause (how Node fetch hides the real reason)', () => {
    // Node 18+ network failures: TypeError('fetch failed') with the real cause.
    const e = new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') });
    expect(errorFields(e)).toEqual({ err: 'fetch failed', errName: 'TypeError', cause: 'ECONNREFUSED' });
  });
});
