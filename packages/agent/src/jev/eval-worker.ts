/** JSON stdin/stdout boundary for budgeted offline diagnostics; not a server. */
import '../load-env.js';
import { readFileSync } from 'node:fs';
import { analyzeQuery, sectionRoleHeuristics, type AnswerFrameSection, type AnswerQuestionType } from '@nc-medicaid/policy-corpus';
import { classifyJev } from '@nc-medicaid/policy-corpus';
import { CLASSIFIER_INSTRUCTIONS, conversationWindow, classifyScopeWithOpenAI } from '../processors/scope-gate.js';
import { scopeQuestions } from './scope.js';
const input = JSON.parse(readFileSync(0, 'utf8')) as { mode: string; question?: string; questions?: string[]; frameRows?: Array<{ id: string; query: string; questionType?: AnswerQuestionType }>; sections?: Array<{ id: string; input: Record<string, unknown> }>; messages?: Array<{ role: string; content: string }> };
const state = conversationWindow(input.messages ?? []);
const started = performance.now();
try {
  let result: unknown;
  if (input.mode === 'routing-batch') result = (input.questions ?? []).map(q => analyzeQuery(q));
  else if (input.mode === 'routing') result = analyzeQuery(input.question ?? '');
  else if (input.mode === 'frames') {
    const { policyCorpus } = await import('../policy-corpus.js');
    const { closeDriver } = await import('../neo4j.js');
    try {
      result = await Promise.all((input.frameRows ?? []).map(async row => ({ id: row.id, frame: await policyCorpus.resolveAnswerFrame({ query: row.query, questionType: row.questionType }) })));
    } finally { await closeDriver(); }
  }
  else if (input.mode === 'section-heuristics') result = Object.fromEntries((input.sections ?? []).map(row => [row.id, sectionRoleHeuristics({ ...row.input, reason: null } as unknown as AnswerFrameSection)]));
  else if (input.mode === 'scope-spec') result = { state, questions: scopeQuestions(CLASSIFIER_INSTRUCTIONS), instructions: CLASSIFIER_INSTRUCTIONS };
  else if (input.mode === 'scope-jev') result = await classifyJev(state, scopeQuestions(CLASSIFIER_INSTRUCTIONS), { apiKey: process.env.TYPESAFE_API_KEY, timeoutMs: 500 });
  else if (input.mode === 'scope-openai') {
    const response = await classifyScopeWithOpenAI(state);
    result = { verdict: response.object.verdict, usage: { input_tokens: response.usage.inputTokens, output_tokens: response.usage.outputTokens } };
  } else throw new Error('unsupported_mode');
  process.stdout.write(JSON.stringify({ result, latencyMs: performance.now() - started }) + '\n');
} catch (error) {
  const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
  const code = status === 401 || status === 403 ? 'credentials' : error instanceof Error && error.message === 'validation_budget_refused' ? 'budget_or_pricing' : 'classifier_failed_open';
  process.stdout.write(JSON.stringify({ error: code, latencyMs: performance.now() - started }) + '\n');
}
