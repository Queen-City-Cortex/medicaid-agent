import './load-env.js';
import './sentry.js';
import { log } from './logger.js';
import { Mastra } from '@mastra/core';
import { MastraAuthWorkos } from '@mastra/auth-workos';
import { deepResearchWorkflow } from './deep-research/workflow.js';
import { createAgentRuntime } from './runtime.js';

// The HTTP server entrypoint. `createAgentRuntime` builds the agent, storage
// and server options; this file owns what only a long-running server has: the
// WorkOS clients, the timers, research recovery and the `mastra` export that
// `mastra build` and `mastra dev` read. The one-shot CLI is `cli.ts`.
const runtime = await createAgentRuntime({
  memory: true,
  promptInjectionDetector: true,
  verifyOutput: true,
  server: () => ({
    auth: new (class extends MastraAuthWorkos {
      async authorizeUser() { return true; } // allow any authenticated WorkOS user
    })(),
    // trustJwtClaims = local JWKS check, no per-request WorkOS API call.
    tokenVerifier: new MastraAuthWorkos({ trustJwtClaims: true }),
  }),
});

// The timers are unref'd so they never keep graceful shutdown alive.
void runtime.runRetention();
setInterval(runtime.runRetention, 24 * 60 * 60 * 1000).unref();

// Periodic process-memory snapshot so a slow leak is attributable from logs
// (JS heap vs native/external) instead of only visible as a Railway bill.
const logMemory = () => {
  const m = process.memoryUsage();
  const mb = (n: number) => Math.round(n / 1024 / 1024);
  log.info('process.memory', {
    rss_mb: mb(m.rss),
    heap_used_mb: mb(m.heapUsed),
    heap_total_mb: mb(m.heapTotal),
    external_mb: mb(m.external),
    array_buffers_mb: mb(m.arrayBuffers),
  });
};
logMemory();
setInterval(logMemory, 15 * 60 * 1000).unref();

// Keep this a literal `export const mastra = new Mastra({...})`: the deployer
// finds the instance by that shape, and `mastra dev` reads `server` from it.
export const mastra = new Mastra({
  agents: { ncMedicaidAgent: runtime.agent },
  workflows: { deepResearchWorkflow },
  storage: runtime.storage,
  observability: runtime.observability,
  logger: runtime.logger,
  server: {
    host: '0.0.0.0',
    port: runtime.config.port,
    timeout: 10 * 60 * 1000, // 10 minutes — agent research can take many tool calls
    ...runtime.serverOptions,
  },
});

void runtime.researchService.recover(mastra);
