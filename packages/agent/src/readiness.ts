import { registerApiRoute } from '@mastra/core/server';
import type { DependencyHealth, Readiness } from '@nc-medicaid/contracts';
import { checkProviders, type ProviderStatuses } from './health.js';
import { log, errorFields } from './logger.js';
import { getDriver } from './neo4j.js';
import type { AppDatabase } from './storage/app-database.js';

type JsonContext = {
  json: (body: unknown, status?: number) => Response;
};

export interface Neo4jProbeResult {
  connected: boolean;
  releaseId: string | null;
}

async function defaultNeo4jProbe(): Promise<Neo4jProbeResult> {
  const session = getDriver().session();
  try {
    const result = await session.run(
      `OPTIONAL MATCH (release:CorpusRelease {id: 'current'})
       RETURN release.release_id AS releaseId`,
    );
    const releaseId = result.records[0]?.get('releaseId');
    return {
      connected: true,
      releaseId: typeof releaseId === 'string' ? releaseId : null,
    };
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
  probeNeo4j: () => Promise<boolean | Neo4jProbeResult> = defaultNeo4jProbe,
): Promise<Response> {
  let neo4j: Readiness['neo4j'] = 'error';
  let graphReleaseId: string | null = null;
  const configuredReleaseId = process.env.CORPUS_RELEASE_ID?.trim() || null;
  try {
    const probe = await probeNeo4j();
    const connected = typeof probe === 'boolean' ? probe : probe.connected;
    graphReleaseId = typeof probe === 'boolean' ? null : probe.releaseId;
    const releaseConfigured = (
      process.env.NODE_ENV !== 'production'
      || configuredReleaseId !== null
    );
    const releaseMatches = (
      typeof probe === 'boolean'
        ? process.env.NODE_ENV !== 'production' && !configuredReleaseId
        : releaseConfigured
          && graphReleaseId !== null
          && (
            configuredReleaseId === null
            || graphReleaseId === configuredReleaseId
          )
    );
    if (connected && releaseMatches) {
      neo4j = 'connected';
    } else if (connected) {
      log.error('readyz.release_identity_failed', {
        configuredReleaseId,
        graphReleaseId,
      });
    }
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
    releaseId: graphReleaseId ?? configuredReleaseId,
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
