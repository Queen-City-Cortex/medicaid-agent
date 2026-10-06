import { createChatRoute } from './chat-route.js';
import { createChatMemory } from './chat-memory.js';
import { configureAnswerRelease, installMemoryReleaseGate } from './answer-release.js';
import { Sentry } from './sentry.js';
import { log, errorFields } from './logger.js';
import { Agent, type AgentConfig, type OnIterationCompleteHandler } from '@mastra/core/agent';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import type { Mastra } from '@mastra/core';
import { MastraCompositeStore } from '@mastra/core/storage';
import { createModel, AGENT_MODEL, AGENT_DEFAULT_OPTIONS } from './model.js';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, DefaultExporter, SensitiveDataFilter } from '@mastra/observability';
import { searchSections } from './tools/search.js';
import { getSection, getDocument, getSectionContext } from './tools/read.js';
import { followReferences, getAmendments } from './tools/navigate.js';
import { findConceptSections } from './tools/concepts.js';
import { lookupPolicy } from './tools/lookup.js';
import { resolveAnswerFrame } from './tools/answer-frame.js';
import { HallucinationVerifier } from './processors/hallucination-verifier.js';
import { AnswerFramePrefetchProcessor } from './processors/answer-frame-prefetch.js';
import { AnswerFramePlanningProcessor } from './processors/answer-frame-planning.js';
import { OpenAIResponsesDedupProcessor } from './processors/openai-responses-dedup.js';
import { MessageLengthGuard } from './processors/message-length-guard.js';
import { ScopeGateProcessor } from './processors/scope-gate.js';
import { createInjectionDetector } from './processors/injection-detector.js';
import { CoverageBoundaryProcessor } from './processors/coverage-boundary.js';
import { RateLimitRepository } from './rate-limit/repository.js';
import { createBodySizeGuard, createRateLimitMiddleware } from './rate-limit/middleware.js';
import { createResourceBindingMiddleware, type TokenVerifier } from './auth-middleware.js';
import { UsageRepository } from './usage/repository.js';
import { PinoLogger } from '@mastra/loggers';
import { FeedbackRepository } from './feedback/repository.js';
import { feedbackApiRoutes } from './feedback/routes.js';
import { corpusStatusRoute } from './corpus-status.js';
import { buildSystemPrompt } from './prompt.js';
import { boolEnv, intEnv } from './env.js';
import { loadRuntimeConfig, type RuntimeConfig } from './runtime-config.js';
import { AppDatabase } from './storage/app-database.js';
import { AnswerAuditRepository } from './storage/answer-audit.js';
import { createExecutionGateway } from './execution-gateway.js';
import { healthApiRoutes } from './readiness.js';
import { ResearchRepository } from './deep-research/repository.js';
import { ResearchService } from './deep-research/service.js';
import { researchApiRoutes } from './deep-research/routes.js';

type ServerConfig = NonNullable<NonNullable<ConstructorParameters<typeof Mastra>[0]>['server']>;

/** What only the HTTP server needs. The entrypoint supplies both, so this
 *  module never builds a WorkOS client and the CLI loads without its settings. */
export interface ServerDependencies {
  /** Route-level authentication, which Mastra runs per route after `middleware`. */
  auth: NonNullable<ServerConfig['auth']>;
  /** Verifies the Bearer token for the resource-binding middleware. */
  tokenVerifier: TokenVerifier;
}

/** Every way one assembly of the agent may differ from another. */
export interface AgentRuntimeOptions {
  /** Thread memory. Off, the agent keeps no conversation and observational
   *  memory cannot run whatever OBSERVATIONAL_MEMORY_ENABLED says. */
  memory: boolean;
  /** The prompt-injection classifier, one paid call per message. */
  promptInjectionDetector: boolean;
  /** Run the verifier as the stream's output processor. Off for the CLI, which
   *  verifies after `generate()` so it can print the verifier's telemetry. */
  verifyOutput: boolean;
  /** Present for the HTTP server only. Called once, after start-up validation
   *  and the storage set-up, so a bad configuration is reported before a
   *  missing WorkOS setting is. */
  server?: () => ServerDependencies;
  /** The chat model. Tests pass a mock; production leaves it unset. */
  model?: AgentConfig['model'];
}

export type AgentServerOptions = Required<Pick<ServerConfig, 'auth' | 'middleware' | 'cors' | 'onError' | 'apiRoutes'>>;

export interface AgentRuntime {
  config: RuntimeConfig;
  agent: Agent;
  storage: LibSQLStore | MastraCompositeStore;
  observability: Observability | undefined;
  logger: PinoLogger;
  appDatabase: AppDatabase;
  /** Shared by the web chat route and the CLI/eval runner. Without this the two
   *  paths drift: the web route previously ran on Mastra's default step limit
   *  while evals ran 99 steps with forced synthesis — eval scores described an
   *  agent web users never got. */
  runLimits: { readonly maxSteps: number; readonly onIterationComplete: OnIterationCompleteHandler };
  /** One retention pass. Failures are logged and reported, never thrown. */
  runRetention: () => Promise<void>;
}

export interface AgentServerRuntime extends AgentRuntime {
  serverOptions: AgentServerOptions;
  researchService: ResearchService;
}

const MAX_STEPS = 99;

// Force synthesis when the agent is about to hit the step limit.
// Mastra's onIterationComplete injects feedback and gives one final step to respond.
const onIterationComplete: OnIterationCompleteHandler = ({ iteration, finishReason }) => {
  if (iteration >= MAX_STEPS - 2 && finishReason === 'tool-calls') {
    return {
      feedback: 'You are running out of steps. Provide your final answer NOW based on everything you have found so far. Use markdown formatting, cite specific policy sections, and explicitly state what you could not find.',
      continue: false,
    };
  }
  return undefined;
};

/**
 * Start-up validation, for the server and the CLI alike: the first thing
 * `createAgentRuntime` does, before it opens a database or builds a model. A
 * check that must stop the process from starting belongs here.
 */
export function validateStartup(env: NodeJS.ProcessEnv, options: { cli: boolean }): RuntimeConfig {
  return loadRuntimeConfig(env, options);
}

/**
 * Builds the agent and everything it stands on: the application database, the
 * answer-release key and memory gate, the processor lists and, when `server`
 * is given, the HTTP server options. It starts no timer and no listener; the
 * entrypoint (`index.ts` or `cli.ts`) owns those.
 */
export function createAgentRuntime(options: AgentRuntimeOptions & { server: () => ServerDependencies }, env?: NodeJS.ProcessEnv): Promise<AgentServerRuntime>;
export function createAgentRuntime(options: AgentRuntimeOptions, env?: NodeJS.ProcessEnv): Promise<AgentRuntime>;
export async function createAgentRuntime(options: AgentRuntimeOptions, env: NodeJS.ProcessEnv = process.env): Promise<AgentRuntime | AgentServerRuntime> {
  const config = validateStartup(env, { cli: !options.server });

  const libsql = new LibSQLStore({
    id: 'mastra-storage',
    url: config.databaseUrl,
  });

  const appDatabase = new AppDatabase(config.databaseUrl);
  await appDatabase.migrate();
  configureAnswerRelease(String((await appDatabase.client.execute('SELECT secret FROM answer_release_keys WHERE id = 1')).rows[0].secret));
  installMemoryReleaseGate((await libsql.getStore('memory'))!, threadId => appDatabase.deleteThreadRecords(threadId));
  const usageRepo = new UsageRepository(appDatabase);

  // Bound operational data even when no user manually deletes it.
  const runRetention = () => appDatabase.runRetention().catch((err) => {
    log.error('storage.retention_failed', errorFields(err));
    Sentry.captureException(err, { tags: { component: 'retention' } });
  });

  // The DuckDB module is imported lazily so its native binary never loads when
  // traces are off (see runtime-config.ts for why that is the production default).
  const storage =
    config.traceStore === 'duckdb'
      ? new MastraCompositeStore({
          id: 'composite-storage',
          default: libsql,
          domains: {
            observability: await new (await import('@mastra/duckdb')).DuckDBStore({
              path: config.tracePath,
            }).getStore('observability'),
          },
        })
      : libsql;

  // Observational memory is off unless OBSERVATIONAL_MEMORY_ENABLED turns it on.
  // Thread history/persistence is unaffected.
  const memory = options.memory
    ? await createChatMemory(libsql, { observationalMemoryEnabled: config.observationalMemoryEnabled })
    : undefined;

  const SYSTEM_PROMPT = buildSystemPrompt();

  // The one place the processor lists are built. Cheapest-first: the free
  // deterministic length check runs before the two classifier calls, and the
  // scope gate before the injection detector because off-topic volume is the
  // common abuse case — most blocked messages cost exactly one mini call and
  // zero main-model tokens.
  const inputProcessors = [
    new MessageLengthGuard(),
    new CoverageBoundaryProcessor(),
    new ScopeGateProcessor(),
    ...(options.promptInjectionDetector ? [createInjectionDetector()] : []),
    new OpenAIResponsesDedupProcessor(),
    new AnswerFramePrefetchProcessor(),
    new AnswerFramePlanningProcessor(),
    new TokenLimiterProcessor({
      limit: 128_000,
    }),
  ];
  // The verifier runs in the web streaming path. In CLI/generate mode, Mastra's
  // processor chain doesn't emit the verifier's stdout telemetry, so the CLI
  // runner calls `runVerificationForAnswer` (the same flow the processor uses)
  // directly after `agent.generate()` completes. That keeps eval scores aligned
  // with what web users see while still letting VERIFIER_ENABLED=false skip the
  // extra cost for fast debug runs.
  const outputProcessors = options.verifyOutput
    ? [new HallucinationVerifier({ usage: usageRepo, audit: new AnswerAuditRepository(appDatabase) })]
    : [];

  const runLimits = {
    maxSteps: MAX_STEPS,
    onIterationComplete,
  } as const;

  const agent = new Agent({
    id: 'nc-medicaid-navigator',
    name: 'NC Medicaid Navigator',
    instructions: () => {
      // Date-only resolution: a per-minute timestamp at the top of the prompt
      // would change every request and defeat provider prompt caching.
      const date = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      return `Current date: ${date}.\n\n${SYSTEM_PROMPT}`;
    },
    model: options.model ?? createModel(AGENT_MODEL),
    defaultOptions: AGENT_DEFAULT_OPTIONS,
    tools: {
      resolveAnswerFrame,
      searchSections,
      getSection,
      getDocument,
      getSectionContext,
      followReferences,
      getAmendments,
      findConceptSections,
      lookupPolicy,
    },
    memory,
    inputProcessors,
    outputProcessors,
  });

  const runtime: AgentRuntime = {
    config,
    agent,
    storage,
    observability:
      config.traceStore === 'off'
        ? undefined
        : new Observability({
            configs: {
              default: {
                serviceName: 'nc-medicaid-navigator',
                exporters: [new DefaultExporter()],
                spanOutputProcessors: [new SensitiveDataFilter()],
              },
            },
          }),
    logger: new PinoLogger({ name: 'mastra', level: 'info' }),
    appDatabase,
    runLimits,
    runRetention,
  };
  if (!options.server) return runtime;

  const researchService = new ResearchService(
    new ResearchRepository(appDatabase),
    intEnv('DEEP_RESEARCH_SERVICE_CONCURRENCY', 2),
    usageRepo,
  );
  const { auth, tokenVerifier } = options.server();
  const serverOptions: AgentServerOptions = {
    auth,
    // Mastra authenticates per-route AFTER server.middleware runs, so the
    // binding middleware verifies the Bearer token itself (trustJwtClaims =
    // local JWKS check, no per-request WorkOS API call) and forces every
    // memory/thread/chat request onto the authenticated user's own resource
    // (anti-IDOR). It must come first: the gateway and the rate limiter read
    // the id it binds. Then the gateway, which refuses unowned routes and
    // unauthenticated callers, and the abuse guards, cheapest-first —
    // header-only body-size check before the per-user rate limit.
    middleware: [
      createResourceBindingMiddleware(tokenVerifier),
      createExecutionGateway({
        allowStudio: boolEnv('ALLOW_MASTRA_STUDIO', false),
      }),
      createBodySizeGuard(),
      createRateLimitMiddleware(new RateLimitRepository(appDatabase)),
    ],
    cors: {
      origin: config.corsOrigins,
      credentials: true,
    },
    // Mastra catches route handler errors itself, so the global Sentry handlers
    // never see them — report them here. No-op when SENTRY_DSN is unset.
    onError: (err, c) => {
      Sentry.captureException(err, {
        tags: { method: c.req.method, path: c.req.path },
      });
      return c.json({ error: { code: 'internal_error', message: 'Internal server error' } }, 500);
    },
    apiRoutes: [
      createChatRoute(usageRepo, runLimits),
      ...feedbackApiRoutes(new FeedbackRepository(appDatabase)),
      ...researchApiRoutes(researchService),
      corpusStatusRoute(),
      ...healthApiRoutes(appDatabase),
    ],
  };
  return { ...runtime, serverOptions, researchService };
}
