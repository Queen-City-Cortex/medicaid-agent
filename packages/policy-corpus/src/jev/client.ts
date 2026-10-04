/** Shared, pinned TypeSafe wire boundary. Never retry a runtime gate. */
export const JEV_MODEL = 'jev-1.13.0';
export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export type JevQuestion = { type: 'noul'; instructions: string } | {
  type: 'choice'; instructions: string; criteria: Record<string, string>;
};
export type JevAnswer = { type: 'noul'; noul: number } | {
  type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number;
};
export interface JevResponse {
  model: string; answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}
export class JevError extends Error {
  constructor(readonly code: 'credentials' | 'input' | 'deadline' | 'network' | 'http' | 'response', readonly status?: number) {
    super(`jev_${code}`);
  }
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const probability = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
export function validateJevResponse(value: unknown, questions: Record<string, JevQuestion>): JevResponse {
  const invalid = () => { throw new JevError('response'); };
  if (!object(value) || value.model !== JEV_MODEL || !object(value.answers) || !object(value.usage)) return invalid();
  const answers = value.answers;
  if (Object.keys(answers).sort().join('\0') !== Object.keys(questions).sort().join('\0')) return invalid();
  for (const [id, q] of Object.entries(questions)) {
    const a = answers[id];
    if (!object(a) || a.type !== q.type) return invalid();
    if (q.type === 'noul') {
      if (!probability(a.noul)) return invalid();
    } else {
      if (typeof a.choice !== 'string' || !Object.hasOwn(q.criteria, a.choice) || !object(a.probabilities) || !probability(a.confidence)) return invalid();
      const ps = a.probabilities;
      if (Object.keys(ps).sort().join('\0') !== Object.keys(q.criteria).sort().join('\0') || !Object.values(ps).every(probability)) return invalid();
      const values = Object.values(ps) as number[];
      if (Math.abs(values.reduce((s, p) => s + p, 0) - 1) > 0.001 || (ps[a.choice] as number) < Math.max(...values) - 0.001) return invalid();
    }
  }
  if (![value.usage.input_tokens, value.usage.output_tokens].every(v => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0)) return invalid();
  return value as unknown as JevResponse;
}
export async function classifyJev(state: string, questions: Record<string, JevQuestion>, options: {
  apiKey?: string; timeoutMs?: number; fetch?: typeof fetch;
} = {}): Promise<JevResponse> {
  if (!options.apiKey?.trim()) throw new JevError('credentials');
  const body = JSON.stringify({ model: JEV_MODEL, state, questions });
  // UTF-8 byte count is a conservative token bound. Never truncate a section.
  if (!state.trim() || new TextEncoder().encode(body).length > 30_000) throw new JevError('input');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new JevError('deadline')); }, options.timeoutMs ?? 500);
  });
  const request = async () => {
    try {
      const response = await (options.fetch ?? fetch)(JEV_ENDPOINT, {
        method: 'POST', headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body, signal: controller.signal, redirect: 'error',
      });
      if (!response.ok) throw new JevError('http', response.status);
      return validateJevResponse(await response.json(), questions);
    } catch (error) {
      if (error instanceof JevError) throw error;
      throw new JevError(controller.signal.aborted ? 'deadline' : 'network');
    }
  };
  try { return await Promise.race([request(), deadline]); } finally { clearTimeout(timer); }
}
