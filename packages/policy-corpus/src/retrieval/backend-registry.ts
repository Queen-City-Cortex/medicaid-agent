import type { RetrievalBackend } from '../contracts.js';
import { amendmentContextBackend } from './backends/amendment-context.js';
import { chunkVectorBackend } from './backends/chunk-vector.js';
import { conceptBackend } from './backends/concept.js';
import { documentKeywordBackend, sectionKeywordBackend } from './backends/keyword.js';
import { policyScopedBackend } from './backends/policy-scoped.js';
import { sectionVectorBackend } from './backends/section-vector.js';

// Independent merge-max backends run by stage 1 of the collector pipeline.
// The fulltext backend is intentionally absent: it has different merge
// semantics (boost + mid-range insert) and is invoked directly by the
// collector's fulltext-recovery stage.
export const RETRIEVAL_BACKENDS = new Map<string, RetrievalBackend>([
  [sectionVectorBackend.name, sectionVectorBackend],
  [chunkVectorBackend.name, chunkVectorBackend],
  [conceptBackend.name, conceptBackend],
  [sectionKeywordBackend.name, sectionKeywordBackend],
  [documentKeywordBackend.name, documentKeywordBackend],
  [amendmentContextBackend.name, amendmentContextBackend],
  [policyScopedBackend.name, policyScopedBackend],
]);
