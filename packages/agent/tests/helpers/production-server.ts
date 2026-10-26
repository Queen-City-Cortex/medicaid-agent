import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mastra } from '@mastra/core';
import type { LibSQLStore } from '@mastra/libsql';
import { createHonoServer } from '@mastra/deployer/server';
import { deepResearchWorkflow } from '../../src/deep-research/workflow.js';
import { AgentServerAuth } from '../../src/workos-auth.js';
import { createAgentRuntime, refuseFrameworkRoutes, type AgentRuntimeOptions, type AgentServerRuntime } from '../../src/runtime.js';
import { STUB_OPENAI_KEY } from './openai-responses-stub.js';

/** Stands in for WorkOS's token check: a known token is its user, any other
 *  token is nobody. Nothing reaches WorkOS. */
const stubWorkos = (users: Readonly<Record<string, string>>) => ({
  authenticateToken: async (token: string) =>
    Object.hasOwn(users, token) ? { id: users[token], workosId: users[token] } as Awaited<ReturnType<AgentServerAuth['authenticateToken']>> : null,
});

export interface ProductionServer {
  runtime: AgentServerRuntime;
  app: Awaited<ReturnType<typeof createHonoServer>>;
  /** Closes both databases and removes the temporary directory. */
  close: () => Promise<void>;
}

/**
 * The app production serves, built by the production factory: real LibSQL
 * storage in a temporary file, the real processor lists and the real
 * middleware array, through Mastra's own server builder. Only the WorkOS token
 * check is replaced here (`users` maps a Bearer token to its user id); the
 * caller passes a mock chat model and stubs whatever else would leave the
 * process. Environment stubs the middleware reads (`vi.stubEnv`) must be in
 * place before this is called.
 */
export async function bootProductionServer(
  users: Readonly<Record<string, string>>,
  options: Omit<AgentRuntimeOptions, 'server'>,
): Promise<ProductionServer> {
  const directory = await mkdtemp(join(tmpdir(), 'production-server-'));
  try {
    const auth = new AgentServerAuth(stubWorkos(users));
    const runtime = await createAgentRuntime(
      { ...options, server: () => ({ auth, tokenVerifier: auth }) },
      { NODE_ENV: 'test', OPENAI_API_KEY: STUB_OPENAI_KEY, VOYAGE_API_KEY: 'stub', DATABASE_URL: `file:${directory}/app.db`, TRACE_STORE: 'off' },
    );
    // The same literal as src/index.ts, less the listener settings.
    const mastra = new Mastra({
      agents: { ncMedicaidAgent: runtime.agent },
      workflows: { deepResearchWorkflow },
      storage: runtime.storage,
      observability: runtime.observability,
      logger: false,
      server: { ...runtime.serverOptions },
    });
    refuseFrameworkRoutes(mastra);
    const app = await createHonoServer(mastra, { tools: {} });
    return { runtime, app, close: async () => {
      runtime.appDatabase.close();
      await (runtime.storage as LibSQLStore).close();
      await rm(directory, { recursive: true, force: true });
    } };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
