import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from '../src/runtime-config.js';

const KEYS = {
  OPENAI_API_KEY: 'test-openai',
  VOYAGE_API_KEY: 'test-voyage',
};

describe('loadRuntimeConfig', () => {
  it('forbids disabling verification in production', () => {
    expect(() => loadRuntimeConfig({ NODE_ENV: 'production', VERIFIER_ENABLED: 'false' })).toThrow('VERIFIER_ENABLED');
  });
  it('normalizes CORS origins and development defaults', () => {
    const config = loadRuntimeConfig({
      ...KEYS,
      NODE_ENV: 'development',
      CORS_ORIGINS: ' http://localhost:3000/, https://example.test ',
    });
    expect(config.corsOrigins).toEqual(['http://localhost:3000', 'https://example.test']);
  });

  it('leaves observational memory off unless the variable turns it on', () => {
    const enabled = (value?: string) => loadRuntimeConfig({ ...KEYS, NODE_ENV: 'development',
      ...(value === undefined ? {} : { OBSERVATIONAL_MEMORY_ENABLED: value }) }).observationalMemoryEnabled;
    expect(enabled()).toBe(false);
    expect(enabled('false')).toBe(false);
    expect(enabled('')).toBe(false);
    expect(enabled('true')).toBe(true);
    expect(enabled('1')).toBe(true);
  });

  it('persists traces to DuckDB only outside production and CLI runs', () => {
    const production = {
      ...KEYS,
      NODE_ENV: 'production',
      WORKOS_CLIENT_ID: 'client',
      WORKOS_API_KEY: 'secret',
      DATABASE_URL: 'file:/data/mastra.db',
      NEO4J_URI: 'bolt://neo4j.internal:7687',
      NEO4J_PASSWORD: 'secure-test-password',
      CORS_ORIGINS: 'https://app.example.test',
    };
    expect(loadRuntimeConfig({ ...KEYS, NODE_ENV: 'development' }).traceStore).toBe('duckdb');
    expect(loadRuntimeConfig({ ...KEYS, NODE_ENV: 'development' }, { cli: true }).traceStore).toBe('off');
    expect(loadRuntimeConfig(production).traceStore).toBe('off');
    expect(loadRuntimeConfig({ ...production, TRACE_STORE: 'duckdb' }).traceStore).toBe('duckdb');
    expect(loadRuntimeConfig({ ...production, MASTRA_OBSERVABILITY_PATH: '/data/traces.duckdb' }).tracePath)
      .toBe('/data/traces.duckdb');
    expect(() => loadRuntimeConfig({ ...KEYS, NODE_ENV: 'development', TRACE_STORE: 'postgres' }))
      .toThrow('TRACE_STORE');
  });

  it('rejects ephemeral production storage', () => {
    expect(() => loadRuntimeConfig({
      ...KEYS,
      NODE_ENV: 'production',
      WORKOS_CLIENT_ID: 'client',
      WORKOS_API_KEY: 'secret',
      DATABASE_URL: 'file:./mastra.db',
      NEO4J_URI: 'bolt://neo4j.internal:7687',
      NEO4J_PASSWORD: 'secure-test-password',
      CORS_ORIGINS: 'https://app.example.test',
    })).toThrow('persistent storage');
  });

  it('rejects localhost dependencies in production', () => {
    expect(() => loadRuntimeConfig({
      ...KEYS,
      NODE_ENV: 'production',
      WORKOS_CLIENT_ID: 'client',
      WORKOS_API_KEY: 'secret',
      DATABASE_URL: 'file:/data/mastra.db',
      NEO4J_URI: 'bolt://localhost:7687',
      NEO4J_PASSWORD: 'secure-test-password',
      CORS_ORIGINS: 'https://app.example.test',
    })).toThrow('NEO4J_URI');
  });

  it('leaves the service-wide run ceiling off by default and rejects a value that is not an integer', () => {
    const ceiling = (value?: string) => loadRuntimeConfig({ ...KEYS, NODE_ENV: 'development',
      ...(value === undefined ? {} : { RATE_LIMIT_GLOBAL_PER_DAY: value }) }).rateLimitGlobalPerDay;
    expect(ceiling()).toBe(0);
    expect(ceiling('')).toBe(0);
    expect(ceiling('-1')).toBe(-1);
    expect(ceiling('2000')).toBe(2000);
    expect(() => ceiling('2k')).toThrow('RATE_LIMIT_GLOBAL_PER_DAY must be an integer');
    expect(() => ceiling('1.5')).toThrow('RATE_LIMIT_GLOBAL_PER_DAY must be an integer');
  });

  it('validates the agent reasoning effort against its allow-list', () => {
    expect(loadRuntimeConfig({ ...KEYS }).agentReasoningEffort).toBe('medium');
    expect(loadRuntimeConfig({ ...KEYS, AGENT_REASONING_EFFORT: 'high' }).agentReasoningEffort).toBe('high');
    expect(() => loadRuntimeConfig({ ...KEYS, AGENT_REASONING_EFFORT: 'extreme' })).toThrow('AGENT_REASONING_EFFORT must be one of');
  });

  it('requires WorkOS server configuration in production', () => {
    expect(() => loadRuntimeConfig({
      ...KEYS,
      NODE_ENV: 'production',
      DATABASE_URL: 'file:/data/mastra.db',
      NEO4J_URI: 'bolt://neo4j.internal:7687',
      NEO4J_PASSWORD: 'secure-test-password',
      CORS_ORIGINS: 'https://app.example.test',
    })).toThrow('WORKOS_CLIENT_ID');
  });
});
