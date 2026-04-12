export const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY || '';
export const VOYAGE_MODEL = 'voyage-law-2';
export const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
export const DEFAULT_TOP_K = 10;
const DEFAULT_POLICY_CORPUS_RERANK_ENABLED = true;

function parseBoolean(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

export const POLICY_CORPUS_RERANK_ENABLED =
  process.env.POLICY_CORPUS_RERANK_ENABLED === undefined
    ? DEFAULT_POLICY_CORPUS_RERANK_ENABLED
    : parseBoolean(process.env.POLICY_CORPUS_RERANK_ENABLED);
export const POLICY_CORPUS_RERANK_MODEL = process.env.POLICY_CORPUS_RERANK_MODEL || 'gpt-5-mini';
export const POLICY_CORPUS_RERANK_TIMEOUT_MS = parseInt(process.env.POLICY_CORPUS_RERANK_TIMEOUT_MS || '1500', 10);
export const POLICY_CORPUS_RERANK_MAX_CANDIDATES = parseInt(process.env.POLICY_CORPUS_RERANK_MAX_CANDIDATES || '20', 10);
export const POLICY_CORPUS_RERANK_DEBUG = parseBoolean(process.env.POLICY_CORPUS_RERANK_DEBUG);
