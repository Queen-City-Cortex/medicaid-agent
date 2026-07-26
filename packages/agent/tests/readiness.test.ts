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

  it('fails readiness when the configured release does not match the graph', async () => {
    const previous = process.env.CORPUS_RELEASE_ID;
    process.env.CORPUS_RELEASE_ID = 'release-green';
    try {
      const response = await handleReadiness(
        context(),
        { probeWritable: async () => true },
        async () => ({ connected: true, releaseId: 'release-blue' }),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        status: 'degraded',
        neo4j: 'error',
        releaseId: 'release-blue',
      });
    } finally {
      if (previous === undefined) {
        delete process.env.CORPUS_RELEASE_ID;
      } else {
        process.env.CORPUS_RELEASE_ID = previous;
      }
    }
  });

  it('fails production readiness when the expected release is not configured', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousRelease = process.env.CORPUS_RELEASE_ID;
    process.env.NODE_ENV = 'production';
    delete process.env.CORPUS_RELEASE_ID;
    try {
      const response = await handleReadiness(
        context(),
        { probeWritable: async () => true },
        async () => ({ connected: true, releaseId: 'release-blue' }),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        status: 'degraded',
        neo4j: 'error',
        releaseId: 'release-blue',
      });
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousRelease === undefined) {
        delete process.env.CORPUS_RELEASE_ID;
      } else {
        process.env.CORPUS_RELEASE_ID = previousRelease;
      }
    }
  });

  it('fails readiness when the reachable graph has no release marker', async () => {
    const response = await handleReadiness(
      context(),
      { probeWritable: async () => true },
      async () => ({ connected: true, releaseId: null }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: 'degraded',
      neo4j: 'error',
      releaseId: null,
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
