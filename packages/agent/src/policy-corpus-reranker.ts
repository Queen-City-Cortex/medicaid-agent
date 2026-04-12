import './load-env.js';
import { generateObject } from 'ai';
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

const RerankResponseSchema = z.object({
  sectionIds: z.array(z.string()).min(1),
  reason: z.string().nullable().optional(),
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

function createModel(modelId: string) {
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

    const { object } = await generateObject({
      model: createModel(config.model),
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
  };
}
