// Public API for the hallucination verifier. The implementation lives in the
// `verifier/` folder, split by concern (evidence extraction, the LLM verify
// call, deterministic answer validation, the orchestrator,
// and the Mastra Processor). This barrel preserves the original import path so
// consumers (`src/index.ts` and the test suites) need no changes.
export * from './verifier/evidence.js';
export * from './verifier/verify.js';
export * from './verifier/answer-validation.js';
export * from './verifier/run.js';
export * from './verifier/processor.js';
