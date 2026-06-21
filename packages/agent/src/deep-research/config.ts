import { AGENT_MODEL } from '../model.js';

// Deep Research tuning knobs. These bound the fan-out so a run stays inside the
// server's 10-minute request timeout and within a sane token budget — a
// multi-agent research run can otherwise cost ~10-15x a single chat answer.

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Model for the deep-research agents; defaults to the chat agent's model. */
export const DEEP_RESEARCH_MODEL = process.env.DEEP_RESEARCH_MODEL || AGENT_MODEL;

/** Max sub-questions the planner may propose (and we will research). */
export const MAX_SUB_QUESTIONS = intEnv('DEEP_RESEARCH_MAX_SUB_QUESTIONS', 6);

/** How many gap-filling reflection rounds may run after the initial pass. */
export const MAX_REFLECTION_ROUNDS = intEnv('DEEP_RESEARCH_MAX_REFLECTION_ROUNDS', 2);

/** Tool-call budget for a single sub-question worker run. The worker is forced
 *  to synthesize a summary two steps before this limit (see workflow.ts), so it
 *  needs enough headroom to run a frame + searches + several getSection reads
 *  AND still write its findings. */
export const WORKER_MAX_STEPS = intEnv('DEEP_RESEARCH_WORKER_MAX_STEPS', 16);

/** Tool-call budget for the planner (it mostly reasons; a few probe searches help). */
export const PLANNER_MAX_STEPS = intEnv('DEEP_RESEARCH_PLANNER_MAX_STEPS', 6);

/** Sub-question workers run in batches of this size to cap peak concurrency. */
export const RESEARCH_CONCURRENCY = intEnv('DEEP_RESEARCH_CONCURRENCY', 3);

/**
 * Closed-corpus novelty stop: if a reflection round surfaces fewer than this
 * many *new* corpus node IDs, treat the corpus as exhausted and stop looping.
 */
export const NOVELTY_MIN_NEW_IDS = intEnv('DEEP_RESEARCH_NOVELTY_MIN_NEW_IDS', 2);

/** Exa web search. When unset, web augmentation is disabled (corpus-only). */
export const EXA_API_KEY = process.env.EXA_API_KEY || '';
export const WEB_SEARCH_ENABLED = Boolean(EXA_API_KEY);
export const WEB_SEARCH_MAX_RESULTS = intEnv('DEEP_RESEARCH_WEB_MAX_RESULTS', 5);
