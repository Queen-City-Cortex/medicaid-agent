import { Agent } from '@mastra/core/agent';
import { PromptInjectionDetector } from '@mastra/core/processors';
import { createModel } from '../model.js';
import { CITATION_GUIDANCE } from '../prompt.js';
import { DEEP_RESEARCH_MODEL, WEB_SEARCH_ENABLED } from './config.js';
import { searchSections } from '../tools/search.js';
import { getSection, getDocument, getSectionContext } from '../tools/read.js';
import { followReferences, getAmendments } from '../tools/navigate.js';
import { findConceptSections } from '../tools/concepts.js';
import { lookupPolicy } from '../tools/lookup.js';
import { resolveAnswerFrame } from '../tools/answer-frame.js';
import { webSearch } from '../tools/web-search.js';
import { ScopeGateProcessor } from '../processors/scope-gate.js';

const CORPUS_TOOLS = {
  resolveAnswerFrame,
  searchSections,
  getSection,
  getDocument,
  getSectionContext,
  followReferences,
  getAmendments,
  findConceptSections,
  lookupPolicy,
};

// Worker gets the full corpus toolset; the web tool is only added when an Exa
// key is configured (so the feature degrades cleanly to corpus-only).
const WORKER_TOOLS = WEB_SEARCH_ENABLED ? { ...CORPUS_TOOLS, webSearch } : CORPUS_TOOLS;

const CORPUS_OVERVIEW = `You work over a knowledge graph of NC Medicaid policy: DHHS policies (MA-series), Clinical Coverage Policies, federal regulations (42 CFR / SSA), and change notices. Corpus tools: resolveAnswerFrame (evidence plan), searchSections (hybrid search), getSection (full text), getDocument, getSectionContext, followReferences, getAmendments, findConceptSections, lookupPolicy.`;

// ── Planner ─────────────────────────────────────────────────────────────────
// Decomposes a research question into a brief + independent sub-questions.
// Also reused for the reflection pass (with a different prompt + output schema).
// The input processors guard the user's question on the plan call; the
// reflection call turns them off. The start route enforces the length cap.

export const deepResearchPlannerAgent = new Agent({
  id: 'deep-research-planner',
  name: 'Deep Research Planner',
  description: 'Decomposes a broad NC Medicaid research question into a research brief and independent sub-questions.',
  model: createModel(DEEP_RESEARCH_MODEL),
  instructions: `You are the planning lead for a deep-research run on NC Medicaid policy.

${CORPUS_OVERVIEW}

Your job: turn a broad question into (1) a compressed research BRIEF that is the "north star" for the whole run, and (2) a set of focused, independently-researchable SUB-QUESTIONS.

The brief must pin down scope: program/population (e.g. aged/blind/disabled vs. expansion), effective date / policy version, geography (county / managed-care plan), and what a complete answer must cover.

Each sub-question must be self-contained (a worker researches it with no other context), be tagged with the corpus channels most likely to surface evidence, and set useWeb=true ONLY when the answer genuinely needs context outside the NC Medicaid corpus (e.g. very recent federal guidance).${WEB_SEARCH_ENABLED ? '' : ' Web search is currently DISABLED — always set useWeb=false.'}

Prefer fewer, high-leverage sub-questions over many overlapping ones. You may run a couple of probe searches to ground the decomposition, but do not try to answer the question yourself.`,
  tools: { resolveAnswerFrame, searchSections, lookupPolicy },
  inputProcessors: [
    new ScopeGateProcessor(),
    new PromptInjectionDetector({
      model: 'openai/gpt-5-mini',
      threshold: 0.8,
      strategy: 'block',
      detectionTypes: ['injection', 'jailbreak', 'system-override'],
    }),
  ],
});

// ── Worker ──────────────────────────────────────────────────────────────────
// Researches ONE sub-question in an isolated context and returns compressed,
// citation-bearing findings. Isolation is the main reason multi-agent beats a
// single loop — each worker gets a clean window for its slice.

export const deepResearchWorkerAgent = new Agent({
  id: 'deep-research-worker',
  name: 'Deep Research Worker',
  description: 'Researches a single NC Medicaid sub-question and returns cited findings.',
  model: createModel(DEEP_RESEARCH_MODEL),
  instructions: `You are a research worker. You are given ONE sub-question about NC Medicaid policy. Research it thoroughly, then return a compressed, citation-bearing summary.

${CORPUS_OVERVIEW}
${WEB_SEARCH_ENABLED ? '\nA SUPPLEMENTARY web-search tool is available for context outside the corpus. The corpus is authoritative; treat web results as supplementary only.\n' : ''}
Method:
1. Start from resolveAnswerFrame when the question is about coverage/PA/amendments/federal authority. Use searchSections / lookupPolicy / findConceptSections to find the governing sections.
2. READ full section text with getSection before making any factual claim — snippets are not enough.
3. Check getAmendments for every document you would present as current.
4. Compress to the essentials for THIS sub-question. Do not pad. Abstain explicitly ("not addressed in the NC Medicaid corpus") rather than guessing, and set foundEvidence=false in that case.

${CITATION_GUIDANCE}`,
  tools: WORKER_TOOLS,
});

// ── Report writer ─────────────────────────────────────────────────────────────
// Synthesises all findings into one long, cohesive, cited report. No tools — it
// works purely from the supplied brief + findings (each already carries inline
// citations from the workers).

export const deepResearchReportAgent = new Agent({
  id: 'deep-research-report',
  name: 'Deep Research Report Writer',
  description: 'Synthesizes deep-research findings into a long, cited NC Medicaid policy report.',
  model: createModel(DEEP_RESEARCH_MODEL),
  instructions: `You are the report writer for a deep-research run on NC Medicaid policy. You are given the research brief and a set of per-sub-question findings, each already carrying inline citations.

The findings below are COMPLETE and are the only input you need. NEVER ask the user to paste findings, grant permission, or answer clarifying questions, and never offer to produce the report "once you have" more input — write the full report immediately from the findings provided. If a finding says the corpus was silent on something, report that gap; do not request more data.

Write a cohesive, well-structured markdown report (typically 1,500-4,000 words) that DIRECTLY answers the original question:
- Open with a short executive summary / direct answer under an \`## Executive summary\` heading.
- Organise the body into thematic sections using ATX markdown headings (\`## \` and \`### \`) — NOT numbered labels like "1)" or bold text. Do NOT just concatenate the sub-question findings.
- Preserve EVERY inline citation from the findings verbatim (do not drop or invent citationLinks). Merge duplicate points and resolve any conflicts between findings, noting the conflict explicitly.
- Be explicit about gaps: where the corpus is silent, say so plainly rather than papering over it.
- End with a "## Sources" appendix listing **Authoritative (NC Medicaid corpus)** sources and, separately, any **Supplementary (web)** sources used.

${CITATION_GUIDANCE}`,
});
