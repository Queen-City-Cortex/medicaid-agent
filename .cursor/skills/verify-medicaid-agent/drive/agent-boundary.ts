// Agent-boundary guard for skill recipes. Import { test, expect } from here, not @playwright/test.
//
// Every signed-in /chat page calls the agent (NEXT_PUBLIC_MASTRA_URL = http://localhost:4111)
// from the browser. The repo's mockMastraAPI covers chat, memory threads, feedback and
// research runs, but not GET /corpus-status (useCorpusStatus, polled every minute). This
// context-level route sits underneath every page.route mock:
//   - GET /corpus-status is answered with CORPUS_STATUS (shape: CorpusStatusSchema in
//     packages/contracts/src/schemas.ts);
//   - any other agent request a recipe did not mock is aborted, never sent;
// and every browser request to the agent port is logged to artifacts/agent-boundary.json.
// The test fails if anything fell through unmocked. verify.sh also refuses to drive while
// anything listens on :4111, so even an unguarded request would hit a closed port.
import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const AGENT_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]):4111(\/|$)/;

/** Fixture corpus freshness. Plainly synthetic: a real agent reads this from Neo4j. */
export const CORPUS_STATUS = {
  lastUpdated: '2026-10-01T12:00:00.000Z',
  documentCount: 1234,
  releaseId: 'verify-fixture-release',
  releaseMarkedAt: '2026-10-01T12:00:00.000Z',
  releaseAgeDays: 9,
  retrievalMode: 'hybrid' as const,
};

type Hit = { method: string; path: string; servedBy: 'recipe-mock' | 'corpus-status-mock' | 'aborted-unmocked' };

export const test = base.extend<{ agentBoundary: Hit[] }>({
  agentBoundary: [
    async ({ context }, use) => {
      const hits: Hit[] = [];
      const fellThrough = new Set<string>();
      context.on('request', (req) => {
        if (!AGENT_ORIGIN.test(req.url())) return;
        const u = new URL(req.url());
        hits.push({ method: req.method(), path: `${u.pathname}${u.search}`, servedBy: 'recipe-mock' });
      });
      await context.route(AGENT_ORIGIN, async (route) => {
        const req = route.request();
        const u = new URL(req.url());
        const tag = `${req.method()} ${u.pathname}${u.search}`;
        if (req.method() === 'GET' && u.pathname === '/corpus-status') {
          fellThrough.add(`corpus:${tag}`);
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CORPUS_STATUS) });
        }
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
        fellThrough.add(`abort:${tag}`);
        return route.abort('connectionrefused');
      });
      await use(hits);
      // Attribute each logged request: anything the guard saw was not served by a recipe mock.
      for (const h of hits) {
        const tag = `${h.method} ${h.path}`;
        if (fellThrough.has(`corpus:${tag}`)) h.servedBy = 'corpus-status-mock';
        else if (fellThrough.has(`abort:${tag}`)) h.servedBy = 'aborted-unmocked';
      }
      const dir = path.join(process.env.VERIFY_EVIDENCE_DIR ?? '.', 'artifacts');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'agent-boundary.json'), JSON.stringify({ agentOrigin: 'http://localhost:4111', requests: hits }, null, 2));
      const unmocked = hits.filter((h) => h.servedBy === 'aborted-unmocked');
      expect(unmocked, 'agent requests no recipe mock handled (aborted, never sent)').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
