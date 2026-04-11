import type { RetrievalBackend } from '../contracts.js';
import { amendmentContextBackend } from './backends/amendment-context.js';
import { chunkVectorBackend } from './backends/chunk-vector.js';
import { conceptBackend } from './backends/concept.js';
import { fulltextBackend } from './backends/fulltext.js';
import { documentKeywordBackend, sectionKeywordBackend } from './backends/keyword.js';
import { policyScopedBackend } from './backends/policy-scoped.js';
import { sectionVectorBackend } from './backends/section-vector.js';

export const RETRIEVAL_BACKENDS = new Map<string, RetrievalBackend>([
  [sectionVectorBackend.name, sectionVectorBackend],
  [chunkVectorBackend.name, chunkVectorBackend],
  [conceptBackend.name, conceptBackend],
  [sectionKeywordBackend.name, sectionKeywordBackend],
  [documentKeywordBackend.name, documentKeywordBackend],
  [amendmentContextBackend.name, amendmentContextBackend],
  [policyScopedBackend.name, policyScopedBackend],
  [fulltextBackend.name, fulltextBackend],
]);
