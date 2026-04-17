import './load-env.js';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { PromptInjectionDetector, TokenLimiterProcessor } from '@mastra/core/processors';
import { MastraCompositeStore } from '@mastra/core/storage';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
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
  buildSourceText,
  verifyAnswer,
  renderCorrectedAnswer,
  type ToolResultRecord,
} from './processors/hallucination-verifier.js';
import { getPolicyCorpusRerankerDiagnostics } from './policy-corpus-reranker.js';
import { AnswerFramePrefetchProcessor } from './processors/answer-frame-prefetch.js';
import { AnswerFramePlanningProcessor } from './processors/answer-frame-planning.js';
import { OpenAIResponsesDedupProcessor } from './processors/openai-responses-dedup.js';
import { MastraAuthWorkos } from '@mastra/auth-workos';
import { PinoLogger } from '@mastra/loggers';
import { FeedbackRepository } from './feedback/repository.js';
import { feedbackApiRoutes } from './feedback/routes.js';
import { buildSystemPrompt } from './prompt.js';

// ── Startup validation ────────────────────────────────────────────────────────

const REQUIRED_ENV = ['VOYAGE_API_KEY'] as const;

function validateEnv() {
  const missing: string[] = REQUIRED_ENV.filter((v) => !process.env[v]);
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    missing.push('OPENAI_API_KEY or ANTHROPIC_API_KEY');
  }
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

validateEnv();

const CLI_QUESTION = process.argv[2];
const IS_CLI_RUN = Boolean(CLI_QUESTION);
const OBSERVABILITY_DB_PATH = process.env.MASTRA_OBSERVABILITY_PATH || (IS_CLI_RUN ? ':memory:' : 'mastra.duckdb');

// ── Model providers ──────────────────────────────────────────────────────────

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
});

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const AGENT_MODEL = process.env.AGENT_MODEL || 'gpt-5.4';

function createModel(modelId: string) {
  if (modelId.startsWith('gpt-') || modelId.startsWith('o3') || modelId.startsWith('o4')) {
    return openai(modelId);
  }
  return anthropic(modelId);
}

const libsql = new LibSQLStore({
  id: 'mastra-storage',
  url: process.env.DATABASE_URL || 'file:./mastra.db',
});

const feedbackRepo = new FeedbackRepository(process.env.DATABASE_URL || 'file:./mastra.db');

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
// below calls `verifyAnswer` directly after `agent.generate()` completes. That
// keeps eval scores aligned with what web users see while still letting
// VERIFIER_ENABLED=false skip the extra cost for fast debug runs.
const verifierEnabled = process.env.VERIFIER_ENABLED !== 'false';
const outputProcessors = verifierEnabled && !IS_CLI_RUN ? [hallucinationVerifier] : [];

const MAX_STEPS = 99;

// Force synthesis when the agent is about to hit the step limit.
// Mastra's onIterationComplete injects feedback and gives one final step to respond.
const onIterationComplete = ({ iteration, finishReason }: {
  iteration: number;
  finishReason: string;
  [key: string]: unknown;
}) => {
  if (iteration >= MAX_STEPS - 2 && finishReason === 'tool-calls') {
    return {
      feedback: 'You are running out of steps. Provide your final answer NOW based on everything you have found so far. Use markdown formatting, cite specific policy sections, and explicitly state what you could not find.',
      continue: false,
    };
  }
  return undefined;
};

export const ncMedicaidAgent = new Agent({
  id: 'nc-medicaid-navigator',
  name: 'NC Medicaid Navigator',
  instructions: () => {
    const now = new Date();
    const date = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const time = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    return `Current date: ${date}. Current time: ${time}.\n\n${SYSTEM_PROMPT}`;
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
    port: parseInt(process.env.PORT || '4111'),
    timeout: 10 * 60 * 1000, // 10 minutes — agent research can take many tool calls
    auth: new (class extends MastraAuthWorkos {
      async authorizeUser() { return true; } // allow any authenticated WorkOS user
    })(),
    cors: {
      origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
      credentials: true,
    },
    apiRoutes: [
      chatRoute({
        path: '/chat',
        agent: 'ncMedicaidAgent',
        version: 'v6',
        defaultOptions: {
          savePerStep: true,
          onStepFinish: async (step) => {
            console.log(`[chat] step finished: ${step.stepType} | text: ${step.text?.length ?? 0} chars | tools: ${step.toolCalls?.length ?? 0}`);
          },
          onError: (err) => {
            console.error('[chat] stream error:', err);
          },
        },
      }),
      ...feedbackApiRoutes(feedbackRepo),
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
          } catch { /* neo4j stays 'error' */ }

          const ok = neo4j === 'connected';
          return c.json({ status: ok ? 'ok' : 'degraded', neo4j }, ok ? 200 : 503);
        },
      }),
    ],
  },
});

// ─── CLI runner ────────────────────────────────────────────────────────────────
// Usage: npx tsx --env-file=.env src/index.ts "your question here"

if (CLI_QUESTION) {
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
      maxSteps: MAX_STEPS,
      memory: { thread: `cli-${Date.now()}`, resource: 'cli' },
      onIterationComplete,
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

    if (verifierEnabled && finalAnswer) {
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
        const sourceText = buildSourceText(sources, finalAnswer);
        const verification = await verifyAnswer(CLI_QUESTION, finalAnswer, sourceText);
        const hasMajorRelevanceIssue = verification.relevanceIssues?.some(
          (i) => i.severity === 'major',
        ) ?? false;
        const citationsComplete = verification.citationsComplete !== false;
        const rewrote = !(
          verification.supported
          && verification.relevant
          && !hasMajorRelevanceIssue
          && citationsComplete
        );
        const rerankerDiag = getPolicyCorpusRerankerDiagnostics();
        const telemetry = {
          rewrote,
          supported: verification.supported,
          relevant: verification.relevant,
          citations_complete: citationsComplete,
          unsupported_claim_count: verification.unsupportedClaims?.length ?? 0,
          missing_citation_count: verification.missingCitationClaims?.length ?? 0,
          relevance_issue_count: verification.relevanceIssues?.length ?? 0,
          major_relevance_issue: hasMajorRelevanceIssue,
          verifier_unavailable: verification.unsupportedClaims?.some(
            (c) => c.reason === 'Verification service unavailable',
          ) ?? false,
          verifier_model: process.env.VERIFIER_MODEL || 'gpt-5.4-mini',
          reranker_fallback_count: rerankerDiag.fallbackCount,
          reranker_last_error: rerankerDiag.lastError,
          source_entry_count: sources.length,
        };
        console.log('\n---VERIFIER---\n');
        console.log(JSON.stringify(telemetry));

        if (rewrote && verification.correctedAnswer) {
          finalAnswer = renderCorrectedAnswer(verification.correctedAnswer);
        }
      } catch (err) {
        console.log('\n---VERIFIER---\n');
        console.log(JSON.stringify({ error: String(err), rewrote: false }));
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
