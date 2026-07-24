import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from '../src/runtime-config.js';

const KEYS = {
  OPENAI_API_KEY: 'test-openai',
  VOYAGE_API_KEY: 'test-voyage',
};

describe('loadRuntimeConfig', () => {
  it('normalizes CORS origins and development defaults', () => {
    const config = loadRuntimeConfig({
      ...KEYS,
      NODE_ENV: 'development',
      CORS_ORIGINS: ' http://localhost:3000/, https://example.test ',
    });
    expect(config.corsOrigins).toEqual(['http://localhost:3000', 'https://example.test']);
    expect(config.retention.conversationsDays).toBe(90);
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
