import { vi } from 'vitest';

import { withSession } from '../../src/neo4j.js';

/**
 * Wraps a plain object as a Neo4j-style record whose `get(key)` returns the
 * matching field. Mirrors the subset of the driver's `Record` API the tools use.
 */
export function mockRecord(data: Record<string, unknown>) {
  return { get: (key: string) => data[key] };
}

/**
 * Mocks `withSession` to hand the callback a fake session whose `run()` returns
 * each entry of `runs` in order (and `{ records: [] }` once exhausted). Returns
 * the fake session so tests can assert on `session.run`.
 *
 * Requires the calling test file to have `vi.mock('../../src/neo4j.js', ...)`;
 * Vitest applies that per-file mock across the whole module graph, so the
 * `withSession` imported here is the mocked one.
 */
export function setupSession(runs: Array<{ records: ReturnType<typeof mockRecord>[] }>) {
  let callIndex = 0;
  const session = {
    // Params are typed (though unused here) so tests can assert on the Cypher
    // query and parameters via `session.run.mock.calls[i]`.
    run: vi.fn(async (_query: string, _params?: Record<string, unknown>) => {
      const result = runs[callIndex] ?? { records: [] };
      callIndex++;
      return result;
    }),
  };
  vi.mocked(withSession).mockImplementation(async (fn) => fn(session as any));
  return session;
}
