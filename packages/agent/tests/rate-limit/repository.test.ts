import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { RateLimitRepository } from '../../src/rate-limit/repository.js';

const T0 = 1_750_000_000_000; // fixed epoch base so window math is deterministic
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('RateLimitRepository', () => {
  let repo: RateLimitRepository;

  beforeEach(() => {
    repo = new RateLimitRepository(':memory:');
    process.env.RATE_LIMIT_MESSAGES_PER_HOUR = '3';
    process.env.RATE_LIMIT_MESSAGES_PER_DAY = '5';
  });

  afterEach(() => {
    delete process.env.RATE_LIMIT_MESSAGES_PER_HOUR;
    delete process.env.RATE_LIMIT_MESSAGES_PER_DAY;
  });

  it('allows up to the hourly limit, then blocks with the hour window', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await repo.checkAndRecord('u1', 'chat', T0 + i * MINUTE)).allowed).toBe(true);
    }
    const denied = await repo.checkAndRecord('u1', 'chat', T0 + 3 * MINUTE);
    expect(denied).toMatchObject({ allowed: false, window: 'hour', limit: 3 });
  });

  it('computes retryAfterSeconds from when the oldest in-window event ages out', async () => {
    await repo.checkAndRecord('u1', 'chat', T0);
    await repo.checkAndRecord('u1', 'chat', T0 + MINUTE);
    await repo.checkAndRecord('u1', 'chat', T0 + 2 * MINUTE);
    const denied = await repo.checkAndRecord('u1', 'chat', T0 + 10 * MINUTE);
    if (denied.allowed) throw new Error('expected denial');
    // Oldest event (T0) leaves the window at T0 + 1h; now is T0 + 10min.
    expect(denied.retryAfterSeconds).toBe(50 * 60);
  });

  it('slides: events older than an hour stop counting against the hourly window', async () => {
    await repo.checkAndRecord('u1', 'chat', T0);
    await repo.checkAndRecord('u1', 'chat', T0 + MINUTE);
    await repo.checkAndRecord('u1', 'chat', T0 + 2 * MINUTE);
    const later = await repo.checkAndRecord('u1', 'chat', T0 + HOUR + 3 * MINUTE);
    expect(later.allowed).toBe(true);
  });

  it('enforces the daily limit independently of the hourly one', async () => {
    // 5 events spread across hours: each is under the hourly limit,
    // but the 6th trips the daily cap.
    for (let i = 0; i < 5; i++) {
      expect((await repo.checkAndRecord('u1', 'chat', T0 + i * 2 * HOUR)).allowed).toBe(true);
    }
    const denied = await repo.checkAndRecord('u1', 'chat', T0 + 10 * HOUR + MINUTE);
    expect(denied).toMatchObject({ allowed: false, window: 'day', limit: 5 });
  });

  it('tracks users independently', async () => {
    for (let i = 0; i < 3; i++) await repo.checkAndRecord('u1', 'chat', T0 + i);
    expect((await repo.checkAndRecord('u2', 'chat', T0 + 10)).allowed).toBe(true);
  });

  it('a limit <= 0 disables that window', async () => {
    process.env.RATE_LIMIT_MESSAGES_PER_HOUR = '0';
    for (let i = 0; i < 5; i++) {
      expect((await repo.checkAndRecord('u1', 'chat', T0 + i)).allowed).toBe(true);
    }
    // Daily limit (5) still applies.
    expect((await repo.checkAndRecord('u1', 'chat', T0 + 6)).allowed).toBe(false);
  });

  it('serializes concurrent starts so a burst cannot exceed the window', async () => {
    // Ten parallel run-starts against a limit of 3: the write transaction
    // serializes them, so exactly 3 are allowed and 7 are denied — a
    // non-atomic check-then-insert would let several extra through.
    const now = T0;
    const results = await Promise.all(
      Array.from({ length: 10 }, () => repo.checkAndRecord('u1', 'chat', now)),
    );
    expect(results.filter((r) => r.allowed).length).toBe(3);
    expect(results.filter((r) => !r.allowed).length).toBe(7);
  });

  it('denied attempts are not recorded — they cannot extend the lockout', async () => {
    await repo.checkAndRecord('u1', 'chat', T0);
    await repo.checkAndRecord('u1', 'chat', T0 + 1);
    await repo.checkAndRecord('u1', 'chat', T0 + 2);
    await repo.checkAndRecord('u1', 'chat', T0 + 3); // denied
    // Just past T0+1h the three recorded events have aged out; if the denied
    // attempt had been recorded the user would still be blocked.
    const after = await repo.checkAndRecord('u1', 'chat', T0 + HOUR + 4);
    expect(after.allowed).toBe(true);
  });
});
