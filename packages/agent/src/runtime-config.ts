import { sectionRoleAllowlist } from '@nc-medicaid/policy-corpus';
import { z } from 'zod';
import { REASONING_EFFORTS, parseReasoningEffort } from './model.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function nonEmpty(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function parseInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = nonEmpty(env, name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

function parseUrl(value: string, name: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}

function isLocalUrl(value: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(value).hostname);
  } catch {
    // Neo4j bolt URLs are accepted by URL in modern Node, but keep a safe
    // fallback for other driver schemes.
    return /(?:^|[/:])(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::|\/|$)/i.test(value);
  }
}

function parseOrigins(raw: string): string[] {
  const origins = [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))];
  for (const origin of origins) {
    const url = parseUrl(origin, 'CORS_ORIGINS');
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin.replace(/\/$/, '')) {
      throw new Error(`CORS_ORIGINS contains an invalid origin: ${origin}`);
    }
  }
  return origins.map((origin) => origin.replace(/\/$/, ''));
}

const RuntimeConfigShape = z.object({
  environment: z.enum(['development', 'test', 'staging', 'production']),
  production: z.boolean(),
  publicProduction: z.boolean(),
  port: z.number().int().min(1).max(65_535),
  databaseUrl: z.string().min(1),
  // Where Mastra persists traces/metrics. `off` skips the store and exporter
  // entirely; `duckdb` keeps a local DuckDB file for Mastra Studio.
  traceStore: z.enum(['duckdb', 'off']),
  tracePath: z.string().min(1),
  corsOrigins: z.array(z.string().url()).min(1),
  neo4j: z.object({
    uri: z.string().min(1),
    user: z.string().min(1),
    password: z.string().min(1),
  }),
  agentModel: z.string().min(1),
  agentReasoningEffort: z.enum(REASONING_EFFORTS),
  maxBodyBytes: z.number().int().positive(),
  maxMessageChars: z.number().int().positive(),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigShape>;

export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: { cli?: boolean } = {},
): RuntimeConfig {
  const environment = (nonEmpty(env, 'NODE_ENV') ?? 'development') as RuntimeConfig['environment'];
  if (!['development', 'test', 'staging', 'production'].includes(environment)) {
    throw new Error(`NODE_ENV has unsupported value: ${environment}`);
  }
  const production = environment === 'production';
  const publicProduction = production && nonEmpty(env, 'PUBLIC_PRODUCTION') === 'true';
  const agentModel = nonEmpty(env, 'AGENT_MODEL') ?? 'gpt-5.6-terra';
  const agentReasoningEffort = parseReasoningEffort(env.AGENT_REASONING_EFFORT);
  const databaseUrl = nonEmpty(env, 'DATABASE_URL') ?? 'file:./mastra.db';
  const neo4j = {
    uri: nonEmpty(env, 'NEO4J_URI') ?? 'bolt://localhost:7687',
    user: nonEmpty(env, 'NEO4J_USER') ?? 'neo4j',
    password: nonEmpty(env, 'NEO4J_PASSWORD') ?? 'medicaid-dev',
  };
  const corsOrigins = parseOrigins(nonEmpty(env, 'CORS_ORIGINS') ?? 'http://localhost:3000');
  // Trace persistence defaults off in production and for one-shot CLI runs:
  // the DuckDB store lives on the container's ephemeral disk (lost on every
  // deploy), nothing reads it unless Mastra Studio is enabled, and its buffer
  // pool is bounded only by host RAM — on Railway that let the agent grow to
  // ~10 GB idle. Local `mastra dev` keeps it so Studio still shows traces.
  const traceStore = nonEmpty(env, 'TRACE_STORE') ?? (production || options.cli ? 'off' : 'duckdb');
  if (traceStore !== 'duckdb' && traceStore !== 'off') {
    throw new Error(`TRACE_STORE has unsupported value: ${traceStore}`);
  }

  const scopeProvider = nonEmpty(env, 'SCOPE_GATE_PROVIDER') ?? 'openai';
  if (!['openai', 'jev'].includes(scopeProvider)) throw new Error('SCOPE_GATE_PROVIDER must be openai or jev');
  if (env.JEV_SECTION_ROLES_ENABLED !== undefined && !['true', 'false'].includes(env.JEV_SECTION_ROLES_ENABLED)) throw new Error('JEV_SECTION_ROLES_ENABLED must be true or false');
  sectionRoleAllowlist(env.JEV_SECTION_ROLE_ALLOWLIST ?? '');
  const missing: string[] = [];
  if (scopeProvider === 'jev' && env.SCOPE_GATE_ENABLED !== 'false' && !nonEmpty(env, 'TYPESAFE_API_KEY')) missing.push('TYPESAFE_API_KEY (required for Jev scope gate)');
  if (!nonEmpty(env, 'OPENAI_API_KEY')) missing.push('OPENAI_API_KEY');
  if (!nonEmpty(env, 'VOYAGE_API_KEY')) missing.push('VOYAGE_API_KEY');
  if (agentModel.startsWith('claude-') && !nonEmpty(env, 'ANTHROPIC_API_KEY')) {
    missing.push('ANTHROPIC_API_KEY (required for Claude AGENT_MODEL)');
  }

  if (production && env.VERIFIER_ENABLED === 'false') throw new Error('VERIFIER_ENABLED cannot be false in production');

  if (production && !options.cli) {
    for (const name of ['WORKOS_CLIENT_ID', 'WORKOS_API_KEY']) {
      if (!nonEmpty(env, name)) missing.push(name);
    }
    if (databaseUrl === 'file:./mastra.db' || databaseUrl === 'file:mastra.db') {
      throw new Error('DATABASE_URL must use persistent storage in production');
    }
    if (databaseUrl.startsWith('file:') && !databaseUrl.startsWith('file:/data/')) {
      throw new Error('Production file DATABASE_URL must be rooted under /data');
    }
    if (isLocalUrl(neo4j.uri)) throw new Error('NEO4J_URI must not target localhost in production');
    if (neo4j.password === 'medicaid-dev') {
      throw new Error('NEO4J_PASSWORD must not use the development default in production');
    }
    if (corsOrigins.some(isLocalUrl)) {
      throw new Error('CORS_ORIGINS must not contain localhost in production');
    }
    if (publicProduction) {
      for (const name of ['SENTRY_DSN', 'SENTRY_ENVIRONMENT', 'SENTRY_RELEASE']) {
        if (!nonEmpty(env, name)) missing.push(`${name} (required for public production)`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return RuntimeConfigShape.parse({
    environment,
    production,
    publicProduction,
    port: parseInteger(env, 'PORT', 4111),
    databaseUrl,
    traceStore,
    tracePath: nonEmpty(env, 'MASTRA_OBSERVABILITY_PATH') ?? 'mastra.duckdb',
    corsOrigins,
    neo4j,
    agentModel,
    agentReasoningEffort,
    maxBodyBytes: parseInteger(env, 'MAX_BODY_BYTES', 2 * 1024 * 1024),
    maxMessageChars: parseInteger(env, 'MAX_MESSAGE_CHARS', 10_000),
  });
}
