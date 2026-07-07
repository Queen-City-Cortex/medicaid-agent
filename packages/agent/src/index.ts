import './load-env.js';
import { Sentry } from './sentry.js';
import { log, errorFields } from './logger.js';
import { Mastra } from '@mastra/core';
import { Agent, type OnIterationCompleteHandler } from '@mastra/core/agent';
import { PromptInjectionDetector, TokenLimiterProcessor } from '@mastra/core/processors';
import { MastraCompositeStore } from '@mastra/core/storage';
import { createModel, AGENT_MODEL } from './model.js';
import { deepResearchWorkflow } from './deep-research/workflow.js';
import { chatRoute } from '@mastra/ai-sdk';
import { registerApiRoute } from '@mastra/core/server';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from '@mastra/duckdb';
import { Observability, DefaultExporter, SensitiveDataFilter } from '@mastra/observability';
import { searchSections } from './tools/search.js';
import { getSection, getDocument, getSectionContext } from './tools/read.js';
import { followReferences, getAmendments } from './tools/navigate.js';
import { findConceptSections } from './tools/concepts.js';
import { lookupPolicy } from './tools/lookup.js';
import { resolveAnswerFrame } from './tools/answer-frame.js';
import { closeDriver, getDriver } from './neo4j.js';
import {
  HallucinationVerifier,
  extractSources,
  extractSourcesFromToolResults,
  runVerificationForAnswer,
  emitVerifierTelemetry,
  type ToolResultRecord,
} from './processors/hallucination-verifier.js';
import { AnswerFramePrefetchProcessor } from './processors/answer-frame-prefetch.js';
import { AnswerFramePlanningProcessor } from './processors/answer-frame-planning.js';
import { OpenAIResponsesDedupProcessor } from './processors/openai-responses-dedup.js';
import { MastraAuthWorkos } from '@mastra/auth-workos';
import { bindResourceToAuthenticatedUser } from './auth-middleware.js';
import { PinoLogger } from '@mastra/loggers';
import { FeedbackRepository } from './feedback/repository.js';
import { feedbackApiRoutes } from './feedback/routes.js';
import { corpusStatusRoute } from './corpus-status.js';
import { buildSystemPrompt } from './prompt.js';
import { intEnv, isVerifierEnabled, strEnv } from './env.js';

// ── Startup validation ────────────────────────────────────────────────────────

// OPENAI_API_KEY is always required: even with a Claude AGENT_MODEL override,
// the hallucination verifier, prompt-injection detector, and observational
// memory run on OpenAI models. ANTHROPIC_API_KEY is only needed when
// AGENT_MODEL points at a Claude model.
const REQUIRED_ENV = ['VOYAGE_API_KEY', 'OPENAI_API_KEY'] as const;

function validateEnv() {
  const missing: string[] = REQUIRED_ENV.filter((v) => !process.env[v]);
  const agentModel = strEnv('AGENT_MODEL', '');
  if (agentModel.startsWith('claude-') && !process.env.ANTHROPIC_API_KEY) {
    missing.push('ANTHROPIC_API_KEY (required for Claude AGENT_MODEL)');
  }
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

validateEnv();

// CLI usage:
//   npx tsx src/index.ts "question"                  → chat agent (one-shot)
//   npx tsx src/index.ts --deep-research "question"   → deep-research workflow
const CLI_ARGS = process.argv.slice(2);
const IS_DEEP_RESEARCH_CLI = CLI_ARGS[0] === '--deep-research';
const CLI_QUESTION = IS_DEEP_RESEARCH_CLI ? CLI_ARGS[1] : CLI_ARGS[0];
const IS_CLI_RUN = Boolean(CLI_QUESTION);
const OBSERVABILITY_DB_PATH = strEnv('MASTRA_OBSERVABILITY_PATH', IS_CLI_RUN ? ':memory:' : 'mastra.duckdb');
const DATABASE_URL = strEnv('DATABASE_URL', 'file:./mastra.db');

const libsql = new LibSQLStore({
  id: 'mastra-storage',
  url: DATABASE_URL,
});

const feedbackRepo = new FeedbackRepository(DATABASE_URL);

const storage = new MastraCompositeStore({
  id: 'composite-storage',
  default: libsql,
  domains: {
    observability: await new DuckDBStore({ path: OBSERVABILITY_DB_PATH }).getStore('observability'),
  },
});

const memory = IS_CLI_RUN
  ? undefined
  : new Memory({
      storage: libsql,
      options: {
        observationalMemory: {
          model: 'openai/gpt-5.4-mini',
        },
        workingMemory: {
          enabled: true,
          scope: 'resource',
          template: `# User Profile
- Name:
- Role: [e.g., Legal aid attorney, Case manager, Beneficiary, Family member]
- Organization:
- Counties/Region of interest:

# Conversation Preferences
- Detail level: [e.g., Technical/legal detail, Plain language summary]
- Common topics of interest:
`,
        },
      },
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
      new PromptInjectionDetector({
        model: 'openai/gpt-5-mini',
        threshold: 0.8,
        strategy: 'block',
        detectionTypes: ['injection', 'jailbreak', 'system-override'],
      }),
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
const outputProcessors = isVerifierEnabled() && !IS_CLI_RUN ? [hallucinationVerifier] : [];

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
  observability: new Observability({
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
    port: intEnv('PORT', 4111),
    timeout: 10 * 60 * 1000, // 10 minutes — agent research can take many tool calls
    auth: new (class extends MastraAuthWorkos {
      async authorizeUser() { return true; } // allow any authenticated WorkOS user
    })(),
    // Runs after Mastra's auth middleware: forces every memory/thread/chat
    // request to operate on the authenticated user's own resource (anti-IDOR).
    middleware: [bindResourceToAuthenticatedUser],
    cors: {
      origin: strEnv('CORS_ORIGINS', 'http://localhost:3000').split(','),
      credentials: true,
    },
    // Mastra catches route handler errors itself, so the global Sentry handlers
    // never see them — report them here. No-op when SENTRY_DSN is unset.
    onError: (err, c) => {
      Sentry.captureException(err, {
        tags: { method: c.req.method, path: c.req.path },
      });
      return c.json({ error: 'Internal server error' }, 500);
    },
    apiRoutes: [
      chatRoute({
        path: '/chat',
        agent: 'ncMedicaidAgent',
        version: 'v6',
        defaultOptions: {
          ...AGENT_RUN_LIMITS,
          savePerStep: true,
          onStepFinish: async (step) => {
            log.debug('chat.step_finished', {
              stepType: step.stepType,
              textChars: step.text?.length ?? 0,
              toolCalls: step.toolCalls?.length ?? 0,
            });
          },
          onError: (err) => {
            log.error('chat.stream_error', errorFields(err));
            Sentry.captureException(err, { tags: { route: 'chat' } });
          },
        },
      }),
      ...feedbackApiRoutes(feedbackRepo),
      corpusStatusRoute(),
      registerApiRoute('/healthz', {
        method: 'GET',
        requiresAuth: false,
        handler: async (c) => {
          let neo4j: 'connected' | 'error' = 'error';
          try {
            const session = getDriver().session();
            try {
              await session.run('RETURN 1');
              neo4j = 'connected';
            } finally {
              await session.close();
            }
          } catch (err) {
            // Distinguish a network blip from a permanent outage for on-call:
            // healthz returns 503 either way, but the cause only lives here.
            log.error('healthz.neo4j_failed', errorFields(err));
          }

          // Verify the LibSQL store (chat memory + feedback, on the Railway
          // volume) actually accepts writes. Connectivity alone is not enough:
          // a read-only volume passes a liveness check but breaks every chat
          // write, so a write-broken deploy must fail this healthcheck and be
          // rejected rather than promoted.
          const storage: 'writable' | 'readonly' =
            (await feedbackRepo.probeWritable()) ? 'writable' : 'readonly';

          const ok = neo4j === 'connected' && storage === 'writable';
          return c.json({ status: ok ? 'ok' : 'degraded', neo4j, storage }, ok ? 200 : 503);
        },
      }),
    ],
  },
});

// ─── CLI runner ────────────────────────────────────────────────────────────────
// Usage: npx tsx --env-file=.env src/index.ts "your question here"
//        npx tsx --env-file=.env src/index.ts --deep-research "your question"

if (IS_DEEP_RESEARCH_CLI && CLI_QUESTION) {
  // Headless deep-research run: auto-approve the plan so the suspend gate is
  // skipped, then print the final report. Progress is visible via the logger.
  try {
    const run = await mastra.getWorkflow('deepResearchWorkflow').createRun();
    const result = await run.start({ inputData: { question: CLI_QUESTION, autoApprove: true } });
    if (result.status === 'success') {
      const report = result.result;
      console.log('\n---PLAN---\n');
      console.log(JSON.stringify({ brief: report.brief, subQuestions: report.subQuestions }, null, 2));
      console.log('\n---STATS---\n');
      console.log(JSON.stringify(report.stats));
      if (report.verification) {
        console.log('\n---VERIFIER---\n');
        console.log(JSON.stringify(report.verification));
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

    let finalAnswer = result.text ?? '';

    if (isVerifierEnabled() && finalAnswer) {
      try {
        // Prefer raw tool results (AI SDK shape); fall back to message parsing
        // if extractSourcesFromToolResults returns nothing.
        let sources = extractSourcesFromToolResults(toolResults);
        if (sources.length === 0) {
          const messages =
            (result as any).response?.messages
            ?? (result as any).messages
            ?? [];
          sources = extractSources(messages);
        }
        // Emit the extracted sources so the eval harness can give the judge
        // the same evidence the verifier sees. Single-line JSON so the
        // `last JSON object line` extractor on the Python side parses cleanly.
        const evidenceBytes = sources.reduce((n, s) => n + s.text.length, 0);
        console.log('\n---EVIDENCE---\n');
        console.log(JSON.stringify({ sources, evidence_bytes: evidenceBytes }));

        const run = await runVerificationForAnswer({
          question: CLI_QUESTION,
          answerText: finalAnswer,
          sources,
        });
        emitVerifierTelemetry(run.telemetry);
        finalAnswer = run.finalAnswer;
      } catch (err) {
        emitVerifierTelemetry({ error: String(err), rewrote: false });
      }
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
