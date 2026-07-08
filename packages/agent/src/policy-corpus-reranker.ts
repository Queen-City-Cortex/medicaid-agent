import './load-env.js';
import { generateObject, type LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import type { CorpusReranker, CorpusRerankerArgs } from '@nc-medicaid/policy-corpus';
import {
  POLICY_CORPUS_RERANK_DEBUG,
  POLICY_CORPUS_RERANK_ENABLED,
  POLICY_CORPUS_RERANK_MAX_CANDIDATES,
  POLICY_CORPUS_RERANK_MODEL,
  POLICY_CORPUS_RERANK_TIMEOUT_MS,
} from './config.js';

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
});

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Groq serves open-weight models behind an OpenAI-compatible endpoint at
// several times OpenAI's mini-tier throughput. That matters here because the
// rerank call races POLICY_CORPUS_RERANK_TIMEOUT_MS and a timeout silently
// degrades to the raw vector order (see diagnostics below). Select via a
// groq/ model prefix, e.g. POLICY_CORPUS_RERANK_MODEL=groq/openai/gpt-oss-20b
// (Groq's own ids may contain slashes; only the leading groq/ is stripped).
const groq = createOpenAI({
  name: 'groq',
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// `reason` must be `.nullable()` but NOT `.optional()`. OpenAI's structured-output
// strict schema validator rejects any property that isn't listed in `required`;
// `.optional()` excludes it from `required` and produces an AI_APICallError:
// "'required' is required to be supplied and to be an array including every key
//  in properties. Missing 'reason'." Nullable keeps it in required while still
//  letting the model skip the field by returning null.
const RerankResponseSchema = z.object({
  sectionIds: z.array(z.string()).min(1),
  reason: z.string().nullable(),
});

export interface PolicyCorpusRerankConfig {
  enabled: boolean;
  model: string;
  timeoutMs: number;
  maxCandidates: number;
  debug: boolean;
}

function debugReranker(enabled: boolean, message: string): void {
  if (enabled) {
    console.error(`[agent:policy-corpus-rerank] ${message}`);
  }
}

/** Exported for routing tests. Explicit return type: the inferred type points
 *  at a non-portable AI-SDK internal and breaks declaration emit (TS2883). */
export function createRerankerModel(modelId: string): LanguageModel {
  if (modelId.startsWith('groq/')) {
    if (!process.env.GROQ_API_KEY) {
      // Without this guard @ai-sdk/openai's key loader silently falls back to
      // OPENAI_API_KEY and sends it to api.groq.com — a confusing 401 in the
      // fallback diagnostics and a key sent to the wrong provider.
      throw new Error('GROQ_API_KEY is required for groq/ reranker models');
    }
    return groq(modelId.slice('groq/'.length));
  }
  if (modelId.startsWith('openai/')) {
    return openai(modelId.slice('openai/'.length));
  }
  if (modelId.startsWith('anthropic/')) {
    return anthropic(modelId.slice('anthropic/'.length));
  }
  if (modelId.startsWith('gpt-') || modelId.startsWith('o3') || modelId.startsWith('o4')) {
    return openai(modelId);
  }
  return anthropic(modelId);
}

function buildCandidatePreview(args: CorpusRerankerArgs, maxCandidates: number) {
  return args.candidates.slice(0, maxCandidates).map((candidate) => ({
    sectionId: candidate.sectionId,
    sectionNumber: candidate.sectionNumber,
    sectionTitle: candidate.sectionTitle,
    documentTitle: candidate.documentTitle,
    documentType: candidate.documentType,
    policyNumber: candidate.policyNumber,
    content: candidate.content?.slice(0, 500) ?? null,
    score: Number(candidate.score.toFixed(4)),
  }));
}

function buildPrompt(args: CorpusRerankerArgs, maxCandidates: number): string {
  const candidates = buildCandidatePreview(args, maxCandidates);
  return [
    'Rank the provided candidate policy sections by how likely they are to contain the best evidence for answering the user query.',
    'Return only sectionIds from the provided candidates.',
    'Do not invent new ids, citations, or facts.',
    'Prefer sections that directly govern the query, are more authoritative for the detected route, and are more specific to the user question.',
    'For Medicaid questions that do not explicitly mention CHIP (Children\'s Health Insurance Program) or Title XXI, prefer base-Medicaid CFR parts (42 CFR 430, 431, 438, 440, 441, 442, 447, 455, 456, 460) over 42 CFR 457 (CHIP). CHIP sections often share vocabulary with Medicaid ("state plan", "amendment", "managed care") but are not authoritative for adult Medicaid questions.',
    '',
    `User query: ${args.query}`,
    `Detected question type: ${args.analysis.questionType}`,
    `Route lane: ${args.analysis.route.lane}`,
    `Route rationale: ${args.analysis.route.rationale}`,
    '',
    'Candidates:',
    JSON.stringify(candidates, null, 2),
  ].join('\n');
}

function buildAbortSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

export function getPolicyCorpusRerankConfig(): PolicyCorpusRerankConfig {
  return {
    enabled: POLICY_CORPUS_RERANK_ENABLED,
    model: POLICY_CORPUS_RERANK_MODEL,
    timeoutMs: POLICY_CORPUS_RERANK_TIMEOUT_MS,
    maxCandidates: Math.max(6, POLICY_CORPUS_RERANK_MAX_CANDIDATES),
    debug: POLICY_CORPUS_RERANK_DEBUG,
  };
}

// Process-wide diagnostics so the agent / verifier / eval harness can tell when reranking
// degraded to the raw vector order. Reset at process start; never reset mid-run.
export interface PolicyCorpusRerankerDiagnostics {
  fallbackCount: number;
  lastError: string | null;
  lastErrorAt: number | null;
}

const diagnostics: PolicyCorpusRerankerDiagnostics = {
  fallbackCount: 0,
  lastError: null,
  lastErrorAt: null,
};

export function getPolicyCorpusRerankerDiagnostics(): PolicyCorpusRerankerDiagnostics {
  return { ...diagnostics };
}

export function resetPolicyCorpusRerankerDiagnostics(): void {
  diagnostics.fallbackCount = 0;
  diagnostics.lastError = null;
  diagnostics.lastErrorAt = null;
}

function recordRerankerFallback(err: unknown, context: string): void {
  diagnostics.fallbackCount += 1;
  diagnostics.lastError = `${context}: ${err instanceof Error ? err.message : String(err)}`;
  diagnostics.lastErrorAt = Date.now();
  console.error(`[agent:policy-corpus-rerank] fallback ${context}: ${diagnostics.lastError}`);
}

export function createPolicyCorpusReranker(
  config: PolicyCorpusRerankConfig = getPolicyCorpusRerankConfig(),
): CorpusReranker | undefined {
  if (!config.enabled) {
    return undefined;
  }

  return async (args) => {
    const candidates = args.candidates.slice(0, config.maxCandidates);
    if (candidates.length === 0) {
      debugReranker(config.debug, 'skip reason=no_candidates');
      return null;
    }

    debugReranker(config.debug, `attempt model=${config.model} candidates=${candidates.length}`);
    const prompt = buildPrompt(
      {
        ...args,
        candidates,
      },
      config.maxCandidates,
    );

    try {
      const { object } = await generateObject({
        model: createRerankerModel(config.model),
        temperature: 0,
        abortSignal: buildAbortSignal(config.timeoutMs),
        schema: RerankResponseSchema,
        schemaName: 'policy_corpus_rerank',
        schemaDescription: 'Ordered candidate section ids ranked by retrieval relevance.',
        prompt,
      });

      debugReranker(
        config.debug,
        `success returned=${(object.sectionIds ?? []).join(',')} reason=${object.reason ?? 'none'}`,
      );
      return {
        sectionIds: object.sectionIds,
        reason: object.reason ?? null,
      };
    } catch (err) {
      // Returning null lets the caller use the original vector ranks.
      // Diagnostics surface the fallback so eval + verifier can flag it.
      const isAbort = err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
      recordRerankerFallback(err, isAbort ? `timeout after ${config.timeoutMs}ms` : 'generateObject error');
      return null;
    }
  };
}
