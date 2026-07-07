import { boolEnv, intEnv, strEnv } from './env.js';

export const VOYAGE_API_KEY = strEnv('VOYAGE_API_KEY', '');
// Overridable via env so the A/B eval harness can point query embedding at a
// candidate model. MUST match the pipeline's EMBEDDING_MODEL used to build the
// corpus being queried, or vector similarity is meaningless.
export const VOYAGE_MODEL = strEnv('VOYAGE_MODEL', 'voyage-4');
export const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
export const DEFAULT_TOP_K = 10;

export const POLICY_CORPUS_RERANK_ENABLED = boolEnv('POLICY_CORPUS_RERANK_ENABLED', true);
export const POLICY_CORPUS_RERANK_MODEL = strEnv('POLICY_CORPUS_RERANK_MODEL', 'gpt-5-mini');
export const POLICY_CORPUS_RERANK_TIMEOUT_MS = intEnv('POLICY_CORPUS_RERANK_TIMEOUT_MS', 1500);
export const POLICY_CORPUS_RERANK_MAX_CANDIDATES = intEnv('POLICY_CORPUS_RERANK_MAX_CANDIDATES', 20);
export const POLICY_CORPUS_RERANK_DEBUG = boolEnv('POLICY_CORPUS_RERANK_DEBUG', false);
