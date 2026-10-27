import type { MastraAuthWorkos } from '@mastra/auth-workos';
import { MastraAuthProvider } from '@mastra/core/server';
import { userIdOf } from './auth-middleware.js';

type WorkosUser = NonNullable<Awaited<ReturnType<MastraAuthWorkos['authenticateToken']>>>;
/** WorkOS's token check, which reads a session cookie only when given a request. */
interface WorkosTokenCheck { authenticateToken(token: string, request?: unknown): Promise<WorkosUser | null> }

/**
 * Route-level authentication for the agent server: any WorkOS user with a
 * valid Bearer token. Users sign in on the web app, so this is Mastra's
 * token-only provider pattern rather than `MastraAuthWorkos` itself, which
 * would also give the server a browser sign-in and session flow. Mastra serves
 * those `/api/auth/*` routes ahead of every application middleware, the
 * execution gateway included, and answers them from whichever provider methods
 * exist; with only these two, each says "not configured".
 */
export class AgentServerAuth extends MastraAuthProvider<WorkosUser> {
  constructor(private readonly workos: WorkosTokenCheck) {
    // Mastra's own tenancy: route-level authentication binds each request to
    // the user's resource, and its memory and workflow-run checks then refuse
    // other owners. `createResourceBindingMiddleware` binds the same id earlier,
    // for the gateway and the application routes, which run ahead of it. An
    // option, not a method: the base constructor overwrites the method.
    super({ name: 'workos', mapUserToResourceId: userIdOf });
  }

  // No request, so no session cookie: the Bearer token alone.
  async authenticateToken(token: string) { return this.workos.authenticateToken(token); }

  async authorizeUser() { return true; }
}
