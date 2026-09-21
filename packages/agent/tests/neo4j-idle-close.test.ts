import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const drivers: Array<{ close: ReturnType<typeof vi.fn>; session: ReturnType<typeof vi.fn> }> = [];

vi.mock('neo4j-driver', () => ({
  default: {
    driver: vi.fn(() => {
      const session = { run: vi.fn(async () => ({})), close: vi.fn(async () => {}) };
      const driver = { close: vi.fn(async () => {}), session: vi.fn(() => session) };
      drivers.push(driver);
      return driver;
    }),
    auth: { basic: vi.fn(() => ({})) },
  },
}));

describe('neo4j driver idle close', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    drivers.length = 0;
    process.env.NEO4J_IDLE_CLOSE_MS = '300000';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.NEO4J_IDLE_CLOSE_MS;
  });

  it('closes the driver after the idle window and reconnects on next use', async () => {
    const { getDriver, withSession } = await import('../src/neo4j.js');
    await withSession(async (session) => session.run('RETURN 1'));
    expect(drivers).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(drivers[0].close).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(drivers[0].close).toHaveBeenCalledTimes(1);

    getDriver();
    expect(drivers).toHaveLength(2);
  });

  it('never closes while a session is in flight', async () => {
    const { withSession } = await import('../src/neo4j.js');
    let release!: () => void;
    const held = withSession(() => new Promise<void>((resolve) => { release = resolve; }));

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(drivers[0].close).not.toHaveBeenCalled();

    release();
    await held;
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(drivers[0].close).toHaveBeenCalledTimes(1);
  });

  it('still releases the session count when session.close() rejects', async () => {
    const { withSession } = await import('../src/neo4j.js');
    await withSession(async (session) => {
      (session.close as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('close failed'));
    }).catch(() => {});

    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(drivers[0].close).toHaveBeenCalledTimes(1);
  });

  it('is disabled when NEO4J_IDLE_CLOSE_MS is 0', async () => {
    process.env.NEO4J_IDLE_CLOSE_MS = '0';
    const { withSession } = await import('../src/neo4j.js');
    await withSession(async () => {});
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(drivers[0].close).not.toHaveBeenCalled();
  });
});
