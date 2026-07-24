import { registerApiRoute } from '@mastra/core/server';
import type { DependencyHealth, Readiness } from '@nc-medicaid/contracts';
import { checkProviders, type ProviderStatuses } from './health.js';
import { log, errorFields } from './logger.js';
import { getDriver } from './neo4j.js';
import type { AppDatabase } from './storage/app-database.js';

type JsonContext = {
  json: (body: unknown, status?: number) => Response;
};

async function defaultNeo4jProbe(): Promise<boolean> {
  const session = getDriver().session();
  try {
    await session.run('RETURN 1');
    return true;
  } finally {
    await session.close();
  }
}

export function handleLiveness(c: JsonContext): Response {
  return c.json({ status: 'ok' });
}

export async function handleReadiness(
  c: JsonContext,
  database: Pick<AppDatabase, 'probeWritable'>,
  probeNeo4j: () => Promise<boolean> = defaultNeo4jProbe,
): Promise<Response> {
  let neo4j: Readiness['neo4j'] = 'error';
  try {
    if (await probeNeo4j()) neo4j = 'connected';
  } catch (err) {
    log.error('readyz.neo4j_failed', errorFields(err));
  }

  let storage: Readiness['storage'] = 'readonly';
  try {
    if (await database.probeWritable()) storage = 'writable';
  } catch (err) {
    log.error('readyz.storage_failed', errorFields(err));
  }

  const ok = neo4j === 'connected' && storage === 'writable';
  const body: Readiness = {
    status: ok ? 'ok' : 'degraded',
    config: 'valid',
    neo4j,
    storage,
    releaseId: process.env.CORPUS_RELEASE_ID?.trim() || null,
  };
  return c.json(body, ok ? 200 : 503);
}

export async function handleDependencies(
  c: JsonContext,
  providerCheck: () => Promise<ProviderStatuses> = checkProviders,
): Promise<Response> {
  const providers = await providerCheck();
  const ok = Object.values(providers).every((status) => status !== 'error');
  const body: DependencyHealth = {
    status: ok ? 'ok' : 'degraded',
    ...providers,
  };
  return c.json(body, ok ? 200 : 503);
}

export function healthApiRoutes(database: AppDatabase) {
  const readinessHandler = (c: JsonContext) => handleReadiness(c, database);
  const dependencyHandler = (c: JsonContext) => handleDependencies(c);
  return [
    registerApiRoute('/livez', {
      method: 'GET',
      requiresAuth: false,
      handler: handleLiveness,
    }),
    registerApiRoute('/readyz', {
      method: 'GET',
      requiresAuth: false,
      handler: readinessHandler,
    }),
    registerApiRoute('/dependencyz', {
      method: 'GET',
      requiresAuth: false,
      handler: dependencyHandler,
    }),
    registerApiRoute('/healthz', {
      method: 'GET',
      requiresAuth: false,
      handler: readinessHandler,
    }),
  ];
}
