import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyJev, validateJevResponse, JEV_MODEL, type JevQuestion } from '../../src/jev/client.js';
const questions: Record<string, JevQuestion> = { department: { type: 'choice', instructions: 'Which department?', criteria: { billing: 'Billing', technical: 'Technical', sales: 'Sales' } }, urgent: { type: 'noul', instructions: 'Urgent?' } };
const valid = () => ({ model: JEV_MODEL, answers: { department: { type: 'choice', choice: 'billing', probabilities: { billing: .88, technical: .12, sales: 0 }, confidence: .81 }, urgent: { type: 'noul', noul: .9 } }, usage: { input_tokens: 318, output_tokens: 34 } });
afterEach(() => vi.useRealTimers());
describe('Jev wire contract', () => {
  it('accepts documented probability and independently derived confidence', () => {
    expect(validateJevResponse(valid(), questions)).toEqual(valid());
  });
  it.each([
    (v: ReturnType<typeof valid>) => { v.model = 'jev-latest'; },
    (v: ReturnType<typeof valid>) => { v.answers.department.choice = 'sales'; },
    (v: ReturnType<typeof valid>) => { v.answers.department.probabilities.sales = .5; },
    (v: ReturnType<typeof valid>) => { v.answers.department.confidence = NaN; },
    (v: ReturnType<typeof valid>) => { v.answers.urgent.noul = -1; },
    (v: ReturnType<typeof valid>) => { v.usage.input_tokens = 1.5; },
  ])('rejects malformed response', change => {
    const v = valid(); change(v); expect(() => validateJevResponse(v, questions)).toThrow('jev_response');
  });
  it('requires exactly one answer per requested question and all choice options', () => {
    expect(() => validateJevResponse({ ...valid(), answers: {} }, questions)).toThrow();
    expect(() => validateJevResponse({ ...valid(), answers: { ...valid().answers, extra: { type: 'noul', noul: 1 } } }, questions)).toThrow();
  });
  it('does not retry rate limits', async () => {
    const f = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
    await expect(classifyJev('Text', questions, { apiKey: 'test', fetch: f })).rejects.toMatchObject({ code: 'http', status: 429 });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('enforces a total deadline even when fetch ignores abort', async () => {
    vi.useFakeTimers();
    const promise = classifyJev('Text', questions, { apiKey: 'test', fetch: vi.fn(() => new Promise<Response>(() => {})) });
    const assertion = expect(promise).rejects.toMatchObject({ code: 'deadline' });
    await vi.advanceTimersByTimeAsync(500); await assertion;
  });
  it('includes body reading in the deadline', async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) });
    const assertion = expect(classifyJev('Text', questions, { apiKey: 'test', fetch: f })).rejects.toMatchObject({ code: 'deadline' });
    await vi.advanceTimersByTimeAsync(500); await assertion;
  });
  it('never sends oversized or empty inputs', async () => {
    const f = vi.fn();
    for (const state of ['', 'x'.repeat(30_000)]) await expect(classifyJev(state, questions, { apiKey: 'test', fetch: f })).rejects.toMatchObject({ code: 'input' });
    expect(f).not.toHaveBeenCalled();
  });
});
