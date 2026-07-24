import { describe, expect, it } from 'vitest';
import {
  handleDependencies,
  handleLiveness,
  handleReadiness,
} from '../src/readiness.js';

function context() {
  return {
    json: (body: unknown, status = 200) => Response.json(body, { status }),
  };
}

describe('readiness', () => {
  it('is ready only when configuration, graph, and storage are usable', async () => {
    const response = await handleReadiness(
      context(),
      { probeWritable: async () => true },
      async () => true,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      config: 'valid',
      neo4j: 'connected',
      storage: 'writable',
    });
  });

  it('keeps liveness independent from dependency state', async () => {
    const response = handleLiveness(context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('returns 503 when durable storage or Neo4j is unavailable', async () => {
    const storageFailure = await handleReadiness(
      context(),
      { probeWritable: async () => false },
      async () => true,
    );
    expect(storageFailure.status).toBe(503);
    expect(await storageFailure.json()).toMatchObject({
      status: 'degraded',
      storage: 'readonly',
    });

    const graphFailure = await handleReadiness(
      context(),
      { probeWritable: async () => true },
      async () => { throw new Error('offline'); },
    );
    expect(graphFailure.status).toBe(503);
    expect(await graphFailure.json()).toMatchObject({
      status: 'degraded',
      neo4j: 'error',
    });
  });

  it('returns 503 when a required provider is unavailable', async () => {
    const response = await handleDependencies(
      context(),
      async () => ({ voyage: 'ok', openai: 'error' }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'degraded',
      voyage: 'ok',
      openai: 'error',
    });
  });
});
