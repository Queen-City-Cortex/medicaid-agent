import './load-env.js';
import { createChatRoute } from './chat-route.js';
import { createChatMemory } from './chat-memory.js';
import { createPrivateVerificationCapture } from './processors/verifier/diagnostics.js';
import { verifyCliAnswer } from './cli-verification.js';
import { configureAnswerRelease, installMemoryReleaseGate } from './answer-release.js';
import { Sentry } from './sentry.js';
import { log, errorFields } from './logger.js';
import { Mastra } from '@mastra/core';
import { Agent, type OnIterationCompleteHandler } from '@mastra/core/agent';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import { MastraCompositeStore } from '@mastra/core/storage';
import { createModel, AGENT_MODEL, AGENT_DEFAULT_OPTIONS } from './model.js';
import { deepResearchWorkflow } from './deep-research/workflow.js';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, DefaultExporter, SensitiveDataFilter } from '@mastra/observability';
import { searchSections } from './tools/search.js';
import { getSection, getDocument, getSectionContext } from './tools/read.js';
import { followReferences, getAmendments } from './tools/navigate.js';
import { findConceptSections } from './tools/concepts.js';
import { lookupPolicy } from './tools/lookup.js';
import { resolveAnswerFrame } from './tools/answer-frame.js';
import { closeDriver } from './neo4j.js';
import {
  HallucinationVerifier,
  extractSources,
  extractSourcesFromToolResults,
  type ToolResultRecord,
} from './processors/hallucination-verifier.js';
import { AnswerFramePrefetchProcessor } from './processors/answer-frame-prefetch.js';
import { AnswerFramePlanningProcessor } from './processors/answer-frame-planning.js';
import { OpenAIResponsesDedupProcessor } from './processors/openai-responses-dedup.js';
import { MessageLengthGuard } from './processors/message-length-guard.js';
import { ScopeGateProcessor } from './processors/scope-gate.js';
import { createInjectionDetector } from './processors/injection-detector.js';
import { CoverageBoundaryProcessor } from './processors/coverage-boundary.js';
import { RateLimitRepository } from './rate-limit/repository.js';
import { createBodySizeGuard, createRateLimitMiddleware } from './rate-limit/middleware.js';
import { MastraAuthWorkos } from '@mastra/auth-workos';
import { createResourceBindingMiddleware } from './auth-middleware.js';
import { UsageRepository } from './usage/repository.js';
import { PinoLogger } from '@mastra/loggers';
import { FeedbackRepository } from './feedback/repository.js';
import { feedbackApiRoutes } from './feedback/routes.js';
import { corpusStatusRoute } from './corpus-status.js';
import { buildSystemPrompt } from './prompt.js';
import { boolEnv, intEnv, isVerifierEnabled } from './env.js';
import { loadRuntimeConfig } from './runtime-config.js';
import { AppDatabase } from './storage/app-database.js';
import { createExecutionGateway } from './execution-gateway.js';
import { healthApiRoutes } from './readiness.js';
import { ResearchRepository } from './deep-research/repository.js';
import { ResearchService } from './deep-research/service.js';
import { researchApiRoutes } from './deep-research/routes.js';

// ── Startup validation ────────────────────────────────────────────────────────

// CLI usage:
//   npx tsx src/index.ts "question"                  → chat agent (one-shot)
//   npx tsx src/index.ts --deep-research "question"   → deep-research workflow
const CLI_ARGS = process.argv.slice(2);
const IS_DEEP_RESEARCH_CLI = CLI_ARGS[0] === '--deep-research';
const CLI_QUESTION = IS_DEEP_RESEARCH_CLI ? CLI_ARGS[1] : CLI_ARGS[0];
const IS_CLI_RUN = Boolean(CLI_QUESTION);
const runtimeConfig = loadRuntimeConfig(process.env, { cli: IS_CLI_RUN });

const libsql = new LibSQLStore({
  id: 'mastra-storage',
  url: runtimeConfig.databaseUrl,
});

const appDatabase = new AppDatabase(runtimeConfig.databaseUrl);
await appDatabase.migrate();
configureAnswerRelease(String((await appDatabase.client.execute('SELECT secret FROM answer_release_keys WHERE id = 1')).rows[0].secret));
installMemoryReleaseGate((await libsql.getStore('memory'))!);
const feedbackRepo = new FeedbackRepository(appDatabase);
const rateLimitRepo = new RateLimitRepository(appDatabase);
const usageRepo = new UsageRepository(appDatabase);
const researchRepo = new ResearchRepository(appDatabase);
const researchService = new ResearchService(
  researchRepo,
  intEnv('DEEP_RESEARCH_SERVICE_CONCURRENCY', 2),
  usageRepo,
);

// Bound operational data even when no user manually deletes it. The timer is
// unref'd so it never keeps CLI runs or graceful shutdown alive.
const runRetention = () => appDatabase.runRetention(runtimeConfig.retention).catch((err) => {
  log.error('storage.retention_failed', errorFields(err));
  Sentry.captureException(err, { tags: { component: 'retention' } });
});
void runRetention();
if (!IS_CLI_RUN) setInterval(runRetention, 24 * 60 * 60 * 1000).unref();

// Periodic process-memory snapshot so a slow leak is attributable from logs
// (JS heap vs native/external) instead of only visible as a Railway bill.
if (!IS_CLI_RUN) {
  const logMemory = () => {
    const m = process.memoryUsage();
    const mb = (n: number) => Math.round(n / 1024 / 1024);
    log.info('process.memory', {
      rss_mb: mb(m.rss),
      heap_used_mb: mb(m.heapUsed),
      heap_total_mb: mb(m.heapTotal),
      external_mb: mb(m.external),
      array_buffers_mb: mb(m.arrayBuffers),
    });
  };
  logMemory();
  setInterval(logMemory, 15 * 60 * 1000).unref();
}

// The DuckDB module is imported lazily so its native binary never loads when
// traces are off (see runtime-config.ts for why that is the production default).
const storage =
  runtimeConfig.traceStore === 'duckdb'
    ? new MastraCompositeStore({
        id: 'composite-storage',
        default: libsql,
        domains: {
          observability: await new (await import('@mastra/duckdb')).DuckDBStore({
            path: runtimeConfig.tracePath,
          }).getStore('observability'),
        },
      })
    : libsql;

// Kill switch for the cross-conversation memory features (observational +
// working memory). They store a per-user profile server-side — disclosed in
// the privacy policy — and an org may reasonably want them off entirely.
// Thread history/persistence is unaffected.
const MEMORY_FEATURES_ENABLED = boolEnv('OBSERVATIONAL_MEMORY_ENABLED', true);

const memory = IS_CLI_RUN ? undefined : await createChatMemory(libsql, {
  observationalMemoryEnabled: MEMORY_FEATURES_ENABLED,
});

const SYSTEM_PROMPT = buildSystemPrompt();

const hallucinationVerifier = new HallucinationVerifier();
const answerFramePrefetch = new AnswerFramePrefetchProcessor();
const answerFramePlanning = new AnswerFramePlanningProcessor();
const openAIResponsesDedup = new OpenAIResponsesDedupProcessor();
const inputProcessors = IS_CLI_RUN
  ? [
      openAIResponsesDedup,
      answerFramePrefetch,
      answerFramePlanning,
      new TokenLimiterProcessor({
        limit: 128_000,
      }),
    ]
  : [
      // Cheapest-first: the free deterministic length check runs before the
      // two classifier calls, and the scope gate before the injection
      // detector because off-topic volume is the common abuse case — most
      // blocked messages cost exactly one mini call and zero main-model tokens.
      new MessageLengthGuard(),
      new CoverageBoundaryProcessor(),
      new ScopeGateProcessor(),
      createInjectionDetector(),
      openAIResponsesDedup,
      answerFramePrefetch,
      answerFramePlanning,
      new TokenLimiterProcessor({
        limit: 128_000,
      }),
    ];
// outputProcessors run in the web streaming path. In CLI/generate mode, Mastra's
// processor chain doesn't emit the verifier's stdout telemetry, so the CLI runner
// below calls `runVerificationForAnswer` (the same flow the processor uses)
// directly after `agent.generate()` completes. That keeps eval scores aligned
// with what web users see while still letting VERIFIER_ENABLED=false skip the
// extra cost for fast debug runs.
const outputProcessors = !IS_CLI_RUN ? [hallucinationVerifier] : [];

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

// Shared by the web chat route and the CLI/eval runner. Without this the two
// paths drift: the web route previously ran on Mastra's default step limit
// while evals ran 99 steps with forced synthesis — eval scores described an
// agent web users never got.
const AGENT_RUN_LIMITS = {
  maxSteps: MAX_STEPS,
  onIterationComplete,
} as const;

export const ncMedicaidAgent = new Agent({
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
  model: createModel(AGENT_MODEL),
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

export const mastra = new Mastra({
  agents: { ncMedicaidAgent },
  workflows: { deepResearchWorkflow },
  storage,
  observability:
    runtimeConfig.traceStore === 'off'
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
  server: {
    host: '0.0.0.0',
    port: runtimeConfig.port,
    timeout: 10 * 60 * 1000, // 10 minutes — agent research can take many tool calls
    auth: new (class extends MastraAuthWorkos {
      async authorizeUser() { return true; } // allow any authenticated WorkOS user
    })(),
    // Mastra authenticates per-route AFTER server.middleware runs, so the
    // binding middleware verifies the Bearer token itself (trustJwtClaims =
    // local JWKS check, no per-request WorkOS API call) and forces every
    // memory/thread/chat request onto the authenticated user's own resource
    // (anti-IDOR). It must come first: the rate limiter reads the id it
    // binds. Then the abuse guards, cheapest-first — header-only body-size
    // check before the per-user rate limit.
    middleware: [
      createResourceBindingMiddleware(new MastraAuthWorkos({ trustJwtClaims: true })),
      createExecutionGateway({
        allowStudio: boolEnv('ALLOW_MASTRA_STUDIO', false),
      }),
      createBodySizeGuard(),
      createRateLimitMiddleware(rateLimitRepo),
    ],
    cors: {
      origin: runtimeConfig.corsOrigins,
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
      createChatRoute(usageRepo, AGENT_RUN_LIMITS),
      ...feedbackApiRoutes(feedbackRepo),
      ...researchApiRoutes(researchService),
      corpusStatusRoute(),
      ...healthApiRoutes(appDatabase),
    ],
  },
});

if (!IS_CLI_RUN) {
  void researchService.recover(mastra);
}

// ─── CLI runner ────────────────────────────────────────────────────────────────
// Usage: npx tsx --env-file=.env src/index.ts "your question here"
//        npx tsx --env-file=.env src/index.ts --deep-research "your question"

if (IS_DEEP_RESEARCH_CLI && CLI_QUESTION) {
  // Internal-only CLI runner: suspend for approval, then approve directly on
  // the in-process workflow. No public autoApprove input exists.
  try {
    const run = await mastra.getWorkflow('deepResearchWorkflow').createRun();
    const planned = await run.start({ inputData: { question: CLI_QUESTION } });
    if (planned.status !== 'suspended') {
      throw new Error(`Planner did not suspend for approval (status ${planned.status})`);
    }
    const result = await run.resume({ step: 'plan-approval', resumeData: { approved: true } });
    if (result.status === 'success') {
      const report = result.result;
      console.log('\n---PLAN---\n');
      console.log(JSON.stringify({ brief: report.brief, subQuestions: report.subQuestions }, null, 2));
      console.log('\n---STATS---\n');
      console.log(JSON.stringify(report.stats));
      if (report.citationProvenance) {
        console.log('\n---VERIFIER---\n');
        console.log(JSON.stringify(report.citationProvenance));
      }
      console.log('\n---REPORT---\n');
      console.log(report.reportMarkdown);
    } else {
      console.error('Deep research did not complete. Status:', result.status);
      if ('error' in result) console.error(result.error);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Deep research error:', err);
    process.exitCode = 1;
  } finally {
    await closeDriver();
  }
} else if (CLI_QUESTION) {
  const agent = mastra.getAgent('ncMedicaidAgent');
  if (!agent) {
    console.error('Agent not found');
    process.exit(1);
  }

  // Accumulate tool-call results across generate() steps. We need raw
  // {toolName, result} records rather than Mastra DB messages because the AI SDK
  // response format the agent returns doesn't carry tool-invocation parts in a
  // shape extractSources can parse.
  const toolResults: ToolResultRecord[] = [];
  const captureGeneration = createPrivateVerificationCapture();

  try {
    const result = await agent.generate(CLI_QUESTION, {
      ...AGENT_RUN_LIMITS,
      memory: { thread: `cli-${Date.now()}`, resource: 'cli' },
      onStepFinish: (step: any) => {
        // Mastra wraps each AI SDK tool-result into an envelope:
        // { type: 'tool-result', runId, from, payload: { toolName, toolCallId, result, args } }
        // Some callers / versions put those fields at the top level — accept both shapes.
        const results = step?.toolResults ?? step?.response?.toolResults ?? [];
        for (const r of results) {
          if (!r) continue;
          const payload = r.payload ?? r;
          const toolName = payload.toolName ?? payload.tool_name ?? '';
          if (!toolName) continue;
          toolResults.push({
            toolName,
            toolCallId: payload.toolCallId ?? payload.tool_call_id,
            result: payload.result ?? payload.output,
          });
        }
      },
    } as any);

    captureGeneration?.({ stage: 'generation', question: CLI_QUESTION, toolResults, messages: result.response?.messages });
    let finalAnswer = result.text ?? '';

    if (isVerifierEnabled() && finalAnswer) {
      finalAnswer = await verifyCliAnswer({ question: CLI_QUESTION, answerText: finalAnswer, capture: captureGeneration, getSources: () => {
        const sources = extractSourcesFromToolResults(toolResults);
        if (sources.length > 0) return sources;
        return extractSources((result as any).response?.messages ?? (result as any).messages ?? []);
      } });
    }

    console.log('\n---ANSWER---\n');
    console.log(finalAnswer || 'I was unable to find sufficient information to answer this question. Please try rephrasing or asking about a more specific aspect of the policy.');
  } catch (err) {
    console.error('Agent error:', err);
    process.exitCode = 1;
  } finally {
    await closeDriver();
  }
}
