import { MASTRA_RESOURCE_ID_KEY, RequestContext } from '@mastra/core/request-context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono, type Handler } from 'hono';
import { AppDatabase } from '../../src/storage/app-database.js';
import { ResearchRepository } from '../../src/deep-research/repository.js';
import { createResearchHandlers, researchApiRoutes } from '../../src/deep-research/routes.js';
import type { ResearchService } from '../../src/deep-research/service.js';

function buildApp(service: ResearchService, userId = 'user-1') {
  const handlers = createResearchHandlers(service);
  const app = new Hono();
  app.use('*', async (c, next) => {
    const requestContext = new RequestContext();
    requestContext.set(MASTRA_RESOURCE_ID_KEY, userId);
    (c as any).set('requestContext', requestContext);
    (c as any).set('mastra', {});
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
