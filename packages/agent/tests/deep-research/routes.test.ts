import { MASTRA_RESOURCE_ID_KEY, RequestContext } from '@mastra/core/request-context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono, type Handler } from 'hono';
import { AppDatabase } from '../../src/storage/app-database.js';
import { ResearchRepository } from '../../src/deep-research/repository.js';
import { createResearchHandlers, researchApiRoutes } from '../../src/deep-research/routes.js';
import { ResearchService, type ResearchMastra } from '../../src/deep-research/service.js';

function buildApp(service: ResearchService, userId = 'user-1', mastra: unknown = {}) {
  const handlers = createResearchHandlers(service);
  const app = new Hono();
  app.use('*', async (c, next) => {
    const requestContext = new RequestContext();
    requestContext.set(MASTRA_RESOURCE_ID_KEY, userId);
    (c as any).set('requestContext', requestContext);
    (c as any).set('mastra', mastra);
    await next();
  });
  app.post('/research/runs', handlers.start as unknown as Handler);
  app.get('/research/runs/current', handlers.current as unknown as Handler);
  app.get('/research/runs/:runId', handlers.get as unknown as Handler);
  app.post('/research/runs/:runId/decision', handlers.decision as unknown as Handler);
  app.post('/research/runs/:runId/cancel', handlers.cancel as unknown as Handler);
  return app;
}

describe('owned research routes', () => {
  let database: AppDatabase;
  let repository: ResearchRepository;
  let service: ResearchService;

  beforeEach(() => {
    database = new AppDatabase(':memory:');
    repository = new ResearchRepository(database);
    service = {
      repository,
      plan: vi.fn().mockResolvedValue(undefined),
      decide: vi.fn(),
      cancel: vi.fn(),
    } as unknown as ResearchService;
  });

  afterEach(() => database.close());

  it('creates an owner-bound queued run and schedules planning', async () => {
    const app = buildApp(service);
    const response = await app.request('/research/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'What does Policy 3L cover?' }),
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toMatchObject({ state: 'queued', question: 'What does Policy 3L cover?' });
    expect(service.plan).toHaveBeenCalledWith(body.runId, {});
    expect(await repository.get(body.runId, 'user-1')).toMatchObject({ runId: body.runId });
    expect(await repository.get(body.runId, 'user-2')).toBeNull();
  });

  it('rejects client identifiers before storing or scheduling the question', async () => {
    const app = buildApp(service);
    const response = await app.request('/research/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'Research Medicaid ID ABC-12345' }),
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: 'client_identifier_detected' },
    });
    expect(service.plan).not.toHaveBeenCalled();
    expect(await repository.listQueued()).toEqual([]);
  });

  it('stores and plans from the question with its phone number and e-mail address replaced', async () => {
    const app = buildApp(service);
    const response = await app.request('/research/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'My notice says to call 866-219-5262 or write to sentinel.client@example.com. What are my appeal rights?' }),
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    const question = 'My notice says to call [phone number removed] or write to [email removed]. What are my appeal rights?';
    expect(body.question).toBe(question);
    // The planner reads the question from this row, never from the request.
    expect(await repository.get(body.runId, 'user-1')).toMatchObject({ question });
    expect(JSON.stringify([body, await repository.listQueued(), vi.mocked(service.plan).mock.calls])).not.toMatch(/866-219-5262|sentinel\.client/);
  });

  it('returns a coverage notice before storing an unsupported research request or consuming quota', async () => {
    const app = buildApp(service);
    const response = await app.request('/research/runs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'Quote the official Gujarati DHB-5097 form.' }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'coverage-limitation', message: expect.stringContaining('unavailable') } });
    expect(service.plan).not.toHaveBeenCalled();
    expect(await repository.listQueued()).toEqual([]);
    const supported = await app.request('/research/runs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'What language-access rights apply when a Gujarati speaker receives DHB-5097?' }),
    });
    expect(supported.status).toBe(202);
    expect(service.plan).toHaveBeenCalledTimes(1);
  });

  it('returns conflicts and daily quota responses without starting providers', async () => {
    const app = buildApp(service);
    const start = () => app.request('/research/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'A policy question' }),
    });
    expect((await start()).status).toBe(202);
    expect((await start()).status).toBe(409);
  });

  it('refuses a third approved run in a day with a retry time, and counts no declined plan', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const startedAt = Date.parse('2026-07-23T12:00:00.000Z');
      vi.setSystemTime(startedAt);
      const app = buildApp(service);
      const start = () => app.request('/research/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: 'A policy question' }),
      });
      const plan = { brief: 'Find coverage', subQuestions: [{ question: 'Scope?', rationale: 'Scope', channels: ['vector' as const], useWeb: false }] };
      const propose = async () => {
        const { runId } = await (await start()).json();
        await repository.acquire(runId, 'queued', 'planning', runId, 2);
        await repository.awaitingApproval(runId, plan, runId);
        return runId as string;
      };
      for (let declined = 0; declined < 2; declined += 1) await repository.cancel(await propose(), 'user-1');
      for (let approved = 0; approved < 2; approved += 1) {
        const runId = await propose();
        await repository.acquire(runId, 'awaiting_approval', 'researching', runId, 2, Date.now(), { approved: true, editedSubQuestions: plan.subQuestions });
        await repository.cancel(runId, 'user-1');
      }

      vi.setSystemTime(startedAt + 3_600_000);
      const quota = await start();
      expect(quota.status).toBe(429);
      expect(quota.headers.get('Retry-After')).toBe(String(23 * 3600));
      expect(await quota.json()).toEqual({ error: {
        code: 'research_daily_quota',
        message: expect.stringContaining('both research reports'),
        retryAfterSeconds: 23 * 3600,
        retryAt: '2026-07-24T12:00:00.000Z',
      } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses a seventh plan in a day with its own code', async () => {
    const app = buildApp(service);
    const start = () => app.request('/research/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'A policy question' }),
    });
    for (let plans = 0; plans < 6; plans += 1) {
      const { runId } = await (await start()).json();
      await repository.cancel(runId, 'user-1');
    }

    const limited = await start();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(86_000);
    expect(await limited.json()).toMatchObject({ error: { code: 'research_planning_limit', retryAt: expect.any(String) } });
    expect(service.plan).toHaveBeenCalledTimes(6);
  });

  it('returns the caller\'s active run and never another user\'s', async () => {
    const owner = buildApp(service, 'user-1');
    const started = await (await owner.request('/research/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'A policy question' }),
    })).json();

    const mine = await owner.request('/research/runs/current');
    expect(mine.status).toBe(200);
    expect(await mine.json()).toMatchObject({ runId: started.runId, state: 'queued' });

    const theirs = await buildApp(service, 'user-2').request('/research/runs/current');
    expect(theirs.status).toBe(204);
    expect(await theirs.text()).toBe('');

    await repository.cancel(started.runId, 'user-1');
    expect((await owner.request('/research/runs/current')).status).toBe(204);
  });

  it('requires an authenticated caller for the active run', async () => {
    const response = await buildApp(service, '').request('/research/runs/current');
    expect(response.status).toBe(401);
  });

  it('registers the active-run route ahead of the run-id route', () => {
    const paths = researchApiRoutes(service).map((route) => route.path);
    expect(paths.indexOf('/research/runs/current')).toBeGreaterThanOrEqual(0);
    expect(paths.indexOf('/research/runs/current')).toBeLessThan(paths.indexOf('/research/runs/:runId'));
  });
});

const question = (text: string) => ({ question: text, rationale: 'Read governing evidence', channels: ['vector' as const], useWeb: false });
const PLAN = { brief: 'Find coverage', subQuestions: [question('Scope?'), question('Eligibility?'), question('Appeals?')] };

describe('plan approval route', () => {
  let database: AppDatabase;
  let repository: ResearchRepository;
  let service: ResearchService;
  let resume: ReturnType<typeof vi.fn>;
  let mastra: ResearchMastra;

  beforeEach(async () => {
    database = new AppDatabase(':memory:');
    repository = new ResearchRepository(database);
    service = new ResearchService(repository, 2, undefined, async () => 'release-1');
    // Research never finishes here: the tests read what the workflow was resumed with.
    resume = vi.fn(() => new Promise(() => {}));
    const workflowRun = { runId: 'workflow-1', start: vi.fn(), resume, cancel: vi.fn().mockResolvedValue(undefined) };
    mastra = { getWorkflow: () => ({ createRun: vi.fn().mockResolvedValue(workflowRun) }) } as unknown as ResearchMastra;
    await repository.create('run-1', 'user-1', 'What is covered?');
    await repository.acquire('run-1', 'queued', 'planning', 'planner', 2);
    await repository.attachWorkflow('run-1', 'workflow-1', 'planner');
    await repository.awaitingApproval('run-1', PLAN, 'planner');
  });

  afterEach(() => {
    service.dispose();
    database.close();
  });

  const decide = (body: unknown, userId = 'user-1') => buildApp(service, userId, mastra).request('/research/runs/run-1/decision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  async function expectStillAwaitingApproval() {
    expect(await repository.getInternal('run-1')).toMatchObject({ state: 'awaiting_approval', approval: null });
    expect((await repository.get('run-1', 'user-1'))?.plan).toEqual(PLAN);
    expect(resume).not.toHaveBeenCalled();
  }

  it('researches exactly the kept subset of the proposed plan', async () => {
    const response = await decide({ approved: true, keptSubQuestions: [2, 0] });

    expect(response.status).toBe(202);
    const kept = [PLAN.subQuestions[2], PLAN.subQuestions[0]];
    expect((await response.json()).plan.subQuestions).toEqual(kept);
    expect((await repository.getInternal('run-1'))?.approval).toEqual({ approved: true, editedSubQuestions: kept });
    await vi.waitFor(() => expect(resume).toHaveBeenCalledWith({
      step: 'plan-approval',
      resumeData: { approved: true, editedSubQuestions: kept },
    }));
  });

  it('keeps the whole proposed plan when the approval names no sub-questions', async () => {
    expect((await decide({ approved: true })).status).toBe(202);
    expect((await repository.getInternal('run-1'))?.approval).toEqual({ approved: true, editedSubQuestions: PLAN.subQuestions });
  });

  it.each([
    ['a position outside the proposed plan', { approved: true, keptSubQuestions: [0, 3] }],
    ['no kept sub-questions', { approved: true, keptSubQuestions: [] }],
    ['a repeated sub-question', { approved: true, keptSubQuestions: [1, 1] }],
    ['a negative position', { approved: true, keptSubQuestions: [-1] }],
    ['a fractional position', { approved: true, keptSubQuestions: [0.5] }],
    ['question text in place of a position', { approved: true, keptSubQuestions: ['Scope?'] }],
    ['a reworded sub-question', { approved: true, editedSubQuestions: [question('Scope for Medicaid ID ABC-12345?')] }],
    ['a new sub-question beside kept positions', { approved: true, keptSubQuestions: [0], editedSubQuestions: [question('Something else?')] }],
  ])('rejects an approval with %s', async (_shape, body) => {
    const response = await decide(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_decision' } });
    await expectStillAwaitingApproval();
  });

  it('does not let another user approve or prune the plan', async () => {
    const response = await decide({ approved: true, keptSubQuestions: [0] }, 'user-2');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'research_run_not_found' } });
    await expectStillAwaitingApproval();
  });
});
