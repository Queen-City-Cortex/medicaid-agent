import { connect, type AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { serve } from '@hono/node-server';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { log } from '../src/logger.js';
import { CHAT_PRIOR_TURNS } from '../src/processors/prior-turns.js';
import { CHAT_ABORT_SIGNAL } from '../src/processors/scope-gate.js';
import { CHAT_DIAGNOSTIC_CONTEXT, CHAT_VERIFICATION_QUESTION } from '../src/processors/verifier/context.js';
import { verifyAnswer } from '../src/processors/verifier/verify.js';
import { stubOpenAIResponses } from './helpers/openai-responses-stub.js';
import { bootProductionServer, type ProductionServer } from './helpers/production-server.js';

// Two signed-in users against the app production serves (see
// `bootProductionServer`): Mastra's own memory handlers, context merge and
// per-route authentication behind the production middleware array. User A owns
// a conversation, a rating and a research run; user B, and a caller with no
// usable token, try every route with A's ids in the path, the query and the
// body. Only what would leave the process is replaced: the chat model, the
// WorkOS token check, the scope classifier (an offline OpenAI endpoint) and
// the verifier's model call.
vi.mock('../src/processors/verifier/verify.js', async original => ({
  ...await original<typeof import('../src/processors/verifier/verify.js')>(), verifyAnswer: vi.fn(),
}));
vi.mock('../src/processors/verifier/evidence.js', async original => ({
  ...await original<typeof import('../src/processors/verifier/evidence.js')>(),
  extractSources: () => [{ key: 'policy', toolName: 'getSection', text: 'The service is covered.', link: 'https://example.gov/policy' }],
}));

const DRAFT = 'PRIVATE_DRAFT_SENTINEL';
const RELEASED = 'The service is covered. [Policy](https://example.gov/policy)';
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const verdict = { supported: true, relevant: true, citationsComplete: true, unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '' };
const ON_TOPIC = [{ type: 'message' as const, id: 'msg', text: JSON.stringify({ verdict: 'on_topic', reason: 'About Medicaid coverage.' }) }];

const USERS = { 'token-a': 'user-a', 'token-b': 'user-b' } as const;
type Caller = 'a' | 'b' | null;
const AGENT = 'ncMedicaidAgent';
const THREAD_A = 'thread-a';
const THREAD_B = 'thread-b';
const RUN_A = 'run-a';
/** In A's question, and so in A's thread title and stored message. */
const SECRET_A = 'ALPHAONLYSENTINEL';
const QUESTION_A = `${SECRET_A} which dental services are covered?`;
const QUESTION_B = 'Which vision services are covered by this policy?';
const COMMENT_A = 'ALPHAONLYCOMMENT the answer missed a limit';

/** The gateway's answer for a route the application does not own. */
const REFUSED = { error: { code: 'not_found', message: 'Not found' } };
/** The gateway's answer for an owned route without a verified user. */
const UNAUTHORIZED = { error: { code: 'unauthorized', message: 'Authentication required' } };
const FORBIDDEN = { error: { code: 'forbidden', message: 'You do not have access to this conversation.' } };

// Every route the gateway lets through, by Hono path. Anything else the built
// app registers behind the gateway must answer REFUSED for every caller; the
// sweep below fails, naming the route, when a framework upgrade adds one that
// does not, or when one of these disappears.
const PUBLIC_ROUTES = [
  // Health probes: no user data. Only liveness is requested here, since the
  // others probe Neo4j and the providers.
  'GET /livez', 'GET /readyz', 'GET /dependencyz', 'GET /healthz',
];
// Routes the framework marks `requiresAuth: false`. The server skips every
// application middleware for them, the gateway included, so none of ours can
// refuse them. They answer from the auth provider, which only checks Bearer
// tokens (`AgentServerAuth`), so each says "not configured" or
// rejects the forged request before its handler runs. Each is pinned to the
// answer it gives any caller, so a framework upgrade that adds one, or makes
// one say more, fails the sweep below.
const CREDENTIALS_REJECTED = { error: 'Invalid request body', issues: [
  { field: 'email', message: 'Invalid input: expected string, received undefined' },
  { field: 'password', message: 'Invalid input: expected string, received undefined' },
] };
const FRAMEWORK_PUBLIC_ROUTES: Readonly<Record<string, readonly [number, unknown]>> = {
  'GET /api/auth/capabilities': [200, { enabled: true, login: null }],
  'GET /api/auth/me': [200, null],
  'GET /api/auth/sso/login': [404, { error: 'SSO not configured' }],
  'GET /api/auth/sso/callback': [400, { error: 'Invalid query parameters', issues: [{ field: 'code', message: 'Invalid input: expected string, received undefined' }] }],
  'POST /api/auth/logout': [404, { error: 'Logout not configured' }],
  'POST /api/auth/refresh': [404, { error: 'Session refresh not configured' }],
  'POST /api/auth/credentials/sign-in': [400, CREDENTIALS_REJECTED],
  'POST /api/auth/credentials/sign-up': [400, CREDENTIALS_REJECTED],
};
const OWNED_ROUTES = [
  // Application routes: the user is the verified token's.
  'POST /chat',
  'POST /feedback', 'GET /feedback', 'DELETE /feedback/:id',
  'POST /research/runs', 'GET /research/runs/current', 'GET /research/runs/:runId',
  'POST /research/runs/:runId/decision', 'POST /research/runs/:runId/cancel',
  // Shared corpus metadata, the same for every signed-in user.
  'GET /corpus-status',
  // Framework memory routes, scoped to the bound resource id.
  'GET /api/memory/threads',
  'GET /api/memory/threads/:threadId', 'PATCH /api/memory/threads/:threadId', 'DELETE /api/memory/threads/:threadId',
  'GET /api/memory/threads/:threadId/messages',
  'POST /api/memory/threads/:threadId/clone',
];
// The framework's whole memory surface on the installed server, so a new
// memory route is looked at even when the gateway already refuses it.
const MEMORY_ROUTES = [
  'DELETE /api/memory/network/threads/:threadId',
  'DELETE /api/memory/threads/:threadId',
  'GET /api/memory/config',
  'GET /api/memory/network/status',
  'GET /api/memory/network/threads',
  'GET /api/memory/network/threads/:threadId',
  'GET /api/memory/network/threads/:threadId/messages',
  'GET /api/memory/observational-memory',
  'GET /api/memory/search',
  'GET /api/memory/status',
  'GET /api/memory/threads',
  'GET /api/memory/threads/:threadId',
  'GET /api/memory/threads/:threadId/messages',
  'GET /api/memory/threads/:threadId/working-memory',
  'PATCH /api/memory/network/threads/:threadId',
  'PATCH /api/memory/threads/:threadId',
  'POST /api/memory/messages/delete',
  'POST /api/memory/network/messages/delete',
  'POST /api/memory/network/save-messages',
  'POST /api/memory/network/threads',
  'POST /api/memory/observational-memory/buffer-status',
  'POST /api/memory/save-messages',
  'POST /api/memory/threads',
  'POST /api/memory/threads/:threadId/clone',
  'POST /api/memory/threads/:threadId/transfer',
  'POST /api/memory/threads/:threadId/working-memory',
];
// Every family of framework route on the installed server (the segment after
// `/api/`). All of them are refused but `memory`; a family not listed here is
// new surface and fails the sweep until someone has read what it does.
const FRAMEWORK_FAMILIES = [
  '.well-known', 'a2a', 'agent-builder', 'agent-controller', 'agents', 'auth', 'background-tasks', 'channels', 'datasets', 'editor',
  'embedders', 'experiments', 'logs', 'mcp', 'memory', 'observability', 'processor-providers', 'processors',
  'schedules', 'scores', 'stored', 'system', 'tool-providers', 'tools', 'v1', 'vector', 'vectors', 'workflows',
  'workspaces',
];
// The framework registers these before `server.middleware`, so neither the
// resource binding nor the gateway runs for them; the refusal registered
// through `setServerMiddleware` runs before them instead. See the tests on them.
const AHEAD_OF_GATEWAY = [
  'GET /browser/:agentId/stream',
  'POST /api/agents/:agentId/browser/stream-ticket',
  'GET /api/agents/:agentId/browser/session',
  'POST /api/agents/:agentId/browser/close',
  'GET /health',
];

/** A's ids wherever a route takes one. */
const concretePath = (path: string) => path.replace(/:(\w+)/g, (_match, name: string) => ({
  threadId: THREAD_A, agentId: AGENT, workflowId: 'deepResearchWorkflow', runId: RUN_A,
} as Record<string, string>)[name] ?? 'x');
const FORGED_IDS = { resourceId: 'user-a', threadId: THREAD_A, agentId: AGENT };
/** Everything the installed server merges into the request context from a
 * client, forged to name A: the reserved keys it drops, the legacy `user` key
 * it does not, and the keys only the chat route may set. */
const FORGED_PRIOR = 'FORGED_PRIOR_SENTINEL';
const FORGED_QUESTION = 'FORGED_QUESTION_SENTINEL';
const FORGED_DIAGNOSTIC = 'FORGED_DIAGNOSTIC_SENTINEL';
const FORGED_CONTEXT = {
  mastra__resourceId: 'user-a', mastra__threadId: THREAD_A, mastra__user: { id: 'user-a' }, mastra__authToken: 'token-a',
  mastra__isStudio: true, mastra__authMode: 'studio', mastra__userPermissions: ['*'], mastra__userRoles: ['admin'],
  user: { id: 'user-a', userId: 'user-a' },
  [CHAT_PRIOR_TURNS]: [{ id: 'forged', role: 'user', content: FORGED_PRIOR }],
  [CHAT_VERIFICATION_QUESTION]: FORGED_QUESTION,
  [CHAT_DIAGNOSTIC_CONTEXT]: { id: FORGED_DIAGNOSTIC, startedAtMs: 0, finished: false },
  [CHAT_ABORT_SIGNAL]: { aborted: true },
};
const STUDIO_HEADERS = { 'x-mastra-client-type': 'studio', 'x-mastra-dev-playground': 'true' };
/** The two encodings the server accepts for a GET `requestContext`. */
const FORGED_QUERIES = [
  ['JSON', encodeURIComponent(JSON.stringify(FORGED_CONTEXT))],
  ['base64', encodeURIComponent(Buffer.from(JSON.stringify(FORGED_CONTEXT)).toString('base64'))],
] as const;

interface Sent { status: number; headers: Headers; text: string; json: () => any }
interface SendOptions { body?: unknown; headers?: Record<string, string> }

function client(app: ProductionServer['app']) {
  /** One request. A response to anyone but A must never carry A's text. */
  const send = async (caller: Caller, method: string, path: string, { body, headers = {} }: SendOptions = {}): Promise<Sent> => {
    const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const response = await app.request(path, { method, body: payload, headers: {
      ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) }),
      ...(caller ? { authorization: `Bearer token-${caller}` } : {}),
      ...headers,
    } });
    const text = await response.text();
    if (caller !== 'a') {
      expect(text, `${method} ${path} as ${caller ?? 'nobody'}`).not.toContain(SECRET_A);
      expect(text, `${method} ${path} as ${caller ?? 'nobody'}`).not.toContain('ALPHAONLYCOMMENT');
    }
    return { status: response.status, headers: response.headers, text, json: () => JSON.parse(text) };
  };
  const chat = (caller: Caller, thread: string, text: string, extra: Record<string, unknown> = {}, options: SendOptions & { query?: string } = {}) =>
    send(caller, 'POST', `/chat${options.query ?? ''}`, { ...options,
      body: { messages: [{ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] }], memory: { thread }, ...extra } });
  return { send, chat };
}

function stubOffline() {
  vi.stubEnv('RATE_LIMIT_MESSAGES_PER_HOUR', '1000');
  vi.stubEnv('SCOPE_GATE_ENABLED', 'true');
  vi.stubEnv('SCOPE_GATE_PROVIDER', 'openai');
  vi.stubEnv('VERIFIER_PRIVATE_DIAGNOSTICS_DIR', '');
  vi.stubEnv('NEO4J_URI', 'bolt://127.0.0.1:1');
  vi.stubEnv('MASTRA_DEV', undefined);
  // Any request but the scope classifier's fails the test instead of reaching a network.
  return stubOpenAIResponses([ON_TOPIC]).bodies;
}

describe('two users on the production server', () => {
  let server: ProductionServer;
  let app: ProductionServer['app'];
  let send: ReturnType<typeof client>['send'];
  let chat: ReturnType<typeof client>['chat'];
  let classifierCalls: unknown[];
  const modelPrompts: string[] = [];
  let messageA: string;
  let feedbackA: string;
  let before: unknown;

  const sql = async (statement: string, args: string[] = []) =>
    (await server.runtime.appDatabase.client.execute({ sql: statement, args })).rows.map(row => ({ ...row }));
  /** Every row A owns: the thread, its messages, the rating, the verification record, the run. */
  const rowsOfA = async () => ({
    threads: await sql('SELECT * FROM mastra_threads WHERE id = ? OR (resourceId = ? AND id != ?)', [THREAD_A, 'user-a', 'thread-race']),
    messages: await sql('SELECT * FROM mastra_messages WHERE thread_id = ? ORDER BY id', [THREAD_A]),
    feedback: await sql('SELECT * FROM feedback WHERE thread_id = ? OR message_id = ? AND resource_id = ?', [THREAD_A, messageA, 'user-a']),
    verification: await sql('SELECT * FROM answer_audit WHERE thread_id = ?', [THREAD_A]),
    research: await sql('SELECT * FROM research_runs WHERE id = ? OR resource_id = ?', [RUN_A, 'user-a']),
  });
  const threadsOf = async (user: string) => (await sql('SELECT id FROM mastra_threads WHERE resourceId = ? ORDER BY id', [user])).map(row => row.id);
  /** One answered turn, waiting until its released answer is in the store. */
  const answered = async (caller: 'a' | 'b', thread: string, text: string) => {
    const turn = await chat(caller, thread, text);
    expect(turn.status).toBe(200);
    expect(turn.text).toContain(RELEASED);
    await vi.waitFor(async () => {
      expect(JSON.stringify(await sql('SELECT content FROM mastra_messages WHERE thread_id = ?', [thread]))).toContain('The service is covered.');
      expect(await sql('SELECT 1 FROM answer_audit WHERE thread_id = ?', [thread])).toHaveLength(1);
    });
  };

  beforeAll(async () => {
    classifierCalls = stubOffline();
    vi.stubEnv('ALLOW_MASTRA_STUDIO', undefined);
    vi.mocked(verifyAnswer).mockImplementation(async (_question, text) => text === RELEASED ? verdict : { ...verdict, supported: false, correctedAnswer: RELEASED });
    const model = new MockLanguageModelV3({ doStream: async options => {
      modelPrompts.push(JSON.stringify(options.prompt));
      return { stream: simulateReadableStream({ chunks: [
        { type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'draft' },
        { type: 'text-delta', id: 'draft', delta: DRAFT }, { type: 'text-end', id: 'draft' },
        { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
      ] }) };
    } });
    server = await bootProductionServer(USERS, { memory: true, promptInjectionDetector: false, verifyOutput: true, model });
    ({ app } = server);
    ({ send, chat } = client(app));

    await answered('a', THREAD_A, QUESTION_A);
    await answered('b', THREAD_B, QUESTION_B);
    messageA = String((await sql('SELECT id FROM mastra_messages WHERE thread_id = ? AND role = ?', [THREAD_A, 'assistant']))[0].id);
    const rated = await send('a', 'POST', '/feedback', { body: { messageId: messageA, threadId: THREAD_A, rating: 'down', comment: COMMENT_A } });
    expect(rated.status).toBe(201);
    feedbackA = rated.json().id;
    // Not through POST /research/runs, which would start planning with a model.
    await server.runtime.researchService.repository.create(RUN_A, 'user-a', QUESTION_A);
    before = await rowsOfA();
  }, 60_000);

  // Whatever a test sent, A's rows are what they were.
  afterEach(async () => {
    expect(await rowsOfA()).toEqual(before);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await server?.close();
  });

  const routeTable = () => {
    // The server wraps `server.middleware` in an anonymous handler and
    // registers it immediately before the application's own routes, so the
    // first of those marks where the gateway starts to run.
    const gateway = app.routes.findIndex(route => route.path === '/chat');
    expect(gateway).toBeGreaterThan(0);
    const names = (routes: typeof app.routes) => [...new Set(routes.filter(route => route.path !== '/*').map(route => `${route.method} ${route.path}`))];
    return { ahead: names(app.routes.slice(0, gateway)), behind: names(app.routes.slice(gateway)) };
  };

  it('starts from rows only their owner can read', async () => {
    expect(before).toMatchObject({
      threads: [{ id: THREAD_A, resourceId: 'user-a', title: QUESTION_A }],
      messages: [{}, {}],
      feedback: [{ id: feedbackA, resource_id: 'user-a', comment: COMMENT_A }],
      verification: [{ message_id: messageA, resource_id: 'user-a' }],
      research: [{ id: RUN_A, resource_id: 'user-a', state: 'queued' }],
    });
    // The refusals below are not a server that refuses everyone.
    expect((await send('a', 'GET', `/api/memory/threads/${THREAD_A}?agentId=${AGENT}`)).json()).toMatchObject({ resourceId: 'user-a', title: QUESTION_A });
    expect((await send('a', 'GET', `/api/memory/threads/${THREAD_A}/messages?agentId=${AGENT}`)).text).toContain(SECRET_A);
    expect((await send('a', 'GET', `/feedback?threadId=${THREAD_A}`)).json().feedback).toMatchObject([{ id: feedbackA, comment: COMMENT_A }]);
    expect((await send('a', 'GET', `/research/runs/${RUN_A}`)).json()).toMatchObject({ runId: RUN_A, question: QUESTION_A });
    expect((await send('a', 'GET', '/research/runs/current')).json()).toMatchObject({ runId: RUN_A });
    expect((await send('b', 'GET', `/api/memory/threads/${THREAD_B}?agentId=${AGENT}`)).json()).toMatchObject({ resourceId: 'user-b', title: QUESTION_B });
  });

  it('refuses every route the gateway does not own, for a signed-in user and for nobody', async () => {
    const { behind } = routeTable();
    const failures: string[] = [];
    const needsUser: string[] = [];
    for (const name of behind.filter(route => !PUBLIC_ROUTES.includes(route))) {
      // An open gateway reaches real handlers; a few of them are enough to say so.
      if (failures.length >= 10) break;
      const [method, path] = name.split(' ');
      const family = path.startsWith('/api/') ? path.split('/')[2] : null;
      if (family && !FRAMEWORK_FAMILIES.includes(family)) failures.push(`${name}: unclassified framework family "${family}"`);
      // An `ALL` route is tried as a read and as a write.
      for (const verb of method === 'ALL' ? ['GET', 'POST'] : [method]) {
        const query = `?${new URLSearchParams(FORGED_IDS)}`;
        const body = verb === 'GET' ? undefined : FORGED_IDS;
        const pinned = FRAMEWORK_PUBLIC_ROUTES[name];
        if (pinned) {
          for (const caller of [null, 'b'] as const) {
            const response = await send(caller, verb, concretePath(path) + query, { body, headers: STUDIO_HEADERS });
            if (response.status !== pinned[0] || response.text !== JSON.stringify(pinned[1])) {
              failures.push(`${verb} ${path} (framework-public) as ${caller ?? 'nobody'}: ${response.status} ${response.text.slice(0, 200)}`);
            }
          }
          continue;
        }
        const anonymous = await send(null, verb, concretePath(path) + query, { body });
        if (anonymous.status === 401 && anonymous.text === JSON.stringify(UNAUTHORIZED)) {
          needsUser.push(name);
          continue;
        }
        if (anonymous.status !== 404 || anonymous.text !== JSON.stringify(REFUSED)) {
          failures.push(`${verb} ${path} without a token: ${anonymous.status} ${anonymous.text.slice(0, 200)}`);
        }
        // B, claiming to be Studio, with A's ids in the path, the query and the body.
        const asB = await send('b', verb, concretePath(path) + query, { body, headers: STUDIO_HEADERS });
        if (asB.status !== 404 || asB.text !== JSON.stringify(REFUSED)) {
          failures.push(`${verb} ${path} as another user: ${asB.status} ${asB.text.slice(0, 200)}`);
        }
      }
    }
    // The failure message is the list of routes to classify.
    expect(failures).toEqual([]);
    expect([...new Set(needsUser)].sort()).toEqual([...OWNED_ROUTES].sort());
    expect(behind).toEqual(expect.arrayContaining([...PUBLIC_ROUTES, ...Object.keys(FRAMEWORK_PUBLIC_ROUTES)]));
    expect(behind.filter(route => route.includes(' /api/memory')).sort()).toEqual(MEMORY_ROUTES);
    expect(behind.length).toBeGreaterThan(300);
  }, 60_000);

  // The sweep's forged requests fail validation on two of these routes; a
  // well-formed one reaches the handler, which finds no method to call.
  it.each([
    ['GET', '/api/auth/sso/callback?code=forged', 302, ''],
    ['POST', '/api/auth/credentials/sign-in', 404, JSON.stringify({ error: 'Credentials authentication not configured' })],
    ['POST', '/api/auth/credentials/sign-up', 404, JSON.stringify({ error: 'Credentials authentication not configured' })],
  ])('answers a well-formed %s %s as not configured', async (method, path, status, text) => {
    const body = method === 'POST' ? { email: 'b@example.com', password: 'forged-password', name: 'B' } : undefined;
    const response = await send('b', method, path, { body });
    expect([response.status, response.text]).toEqual([status, text]);
    if (status === 302) expect(response.headers.get('location')).toContain('error=sso_not_configured');
  });

  // The installed server (@mastra/deployer 1.45.0) registers these framework
  // routes before `server.middleware`, so neither the resource binding nor the
  // gateway runs for them. `refuseFrameworkRoutes` in runtime.ts puts a refusal
  // ahead of them through `mastra.setServerMiddleware`, which the server
  // registers right after its context middleware. The pinned set is the list
  // that refusal must cover: a framework upgrade that registers a fifth route
  // ahead of the gateway fails here until it is read and either listed in the
  // refusal or ruled public.
  it('pins the framework routes registered ahead of the gateway', () => {
    expect(routeTable().ahead).toEqual(AHEAD_OF_GATEWAY);
  });

  it.each([
    ['GET', `/api/agents/${AGENT}/browser/session?threadId=${THREAD_A}`],
    ['POST', `/api/agents/${AGENT}/browser/close`],
    ['GET', '/health'],
    ['GET', `/browser/${AGENT}/stream?threadId=${THREAD_A}`],
  ])('refuses the framework route %s %s, registered ahead of the gateway, to everyone', async (method, path) => {
    for (const [caller, headers] of [[null, {}], ['b', STUDIO_HEADERS]] as const) {
      const response = await send(caller, method, path, { body: method === 'POST' ? { threadId: THREAD_A } : undefined, headers });
      expect([response.status, response.json()], `as ${caller ?? 'nobody'}`).toEqual([404, REFUSED]);
    }
  });

  const UPGRADE_HEADERS = {
    upgrade: 'websocket', connection: 'Upgrade', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', 'sec-websocket-version': '13',
  };

  it('refuses the stream route when asked to upgrade to a WebSocket', async () => {
    const response = await send('a', 'GET', `/browser/${AGENT}/stream?threadId=${THREAD_A}`, { headers: UPGRADE_HEADERS });
    expect([response.status, response.json()]).toEqual([404, REFUSED]);
  });

  it('refuses a real WebSocket upgrade on the stream route', async () => {
    // The listener the deployer builds: the app over node:http, with the
    // framework's upgrade handler attached. @hono/node-ws runs the upgrade
    // request through the app and, when no handler claimed it, writes the
    // app's status to the socket and closes it.
    const listener = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
    try {
      // The deployer hangs the upgrade handler on the app, outside its type.
      const { injectWebSocket } = app as typeof app & { injectWebSocket?: (server: typeof listener) => void };
      expect(typeof injectWebSocket).toBe('function');
      injectWebSocket!(listener);
      await new Promise<void>(resolve => listener.listening ? resolve() : listener.once('listening', () => resolve()));
      const { port } = listener.address() as AddressInfo;
      const reply = await new Promise<string>((resolve, reject) => {
        let data = '';
        const socket = connect(port, '127.0.0.1', () => {
          socket.write([
            `GET /browser/${AGENT}/stream?threadId=${THREAD_A} HTTP/1.1`, `Host: 127.0.0.1:${port}`, 'Authorization: Bearer token-a',
            ...Object.entries(UPGRADE_HEADERS).map(([name, value]) => `${name}: ${value}`), '', '',
          ].join('\r\n'));
        });
        socket.on('data', chunk => { data += chunk.toString(); });
        socket.on('close', () => resolve(data));
        socket.on('error', reject);
        // An accepted upgrade keeps the socket open: give up and report what came back.
        socket.setTimeout(2_000, () => { socket.destroy(); resolve(data); });
      });
      expect(reply.startsWith('HTTP/1.1 404 ')).toBe(true);
      expect(reply).not.toContain('101');
    } finally {
      await new Promise<void>(resolve => listener.close(() => resolve()));
    }
  });

  it.each([
    ['no Authorization header', {}, ''],
    ['an empty Bearer token', { authorization: 'Bearer ' }, ''],
    ['a token no user holds', { authorization: 'Bearer token-c' }, ''],
    ['a malformed token', { authorization: 'Bearer eyJhbGciOiJub25lIn0.e30.' }, ''],
    ['two tokens in one header', { authorization: 'Bearer token-c, Bearer token-a' }, ''],
    ['A\'s token without the Bearer scheme', { authorization: 'token-a' }, ''],
    ['A\'s token under a lower-case scheme', { authorization: 'bearer token-a' }, ''],
    ['A\'s token as Basic credentials', { authorization: `Basic ${Buffer.from('token-a:').toString('base64')}` }, ''],
    ['A\'s token in the apiKey query the framework also reads', {}, 'apiKey=token-a'],
    ['a forged request context and Studio headers', STUDIO_HEADERS, `requestContext=${FORGED_QUERIES[0][1]}`],
  ] as Array<[string, Record<string, string>, string]>)('answers 401 on every owned route to %s', async (_label, headers, extraQuery) => {
    for (const name of OWNED_ROUTES) {
      const [method, path] = name.split(' ');
      const query = `?${new URLSearchParams(FORGED_IDS)}${extraQuery ? `&${extraQuery}` : ''}`;
      const response = await send(null, method, concretePath(path).replace('/x', `/${feedbackA}`) + query, {
        headers, body: method === 'GET' ? undefined : { ...FORGED_IDS, title: 'Seized', requestContext: FORGED_CONTEXT },
      });
      expect([name, response.status, response.json()]).toEqual([name, 401, UNAUTHORIZED]);
    }
    expect(modelPrompts).toHaveLength(2);
  });

  describe('user B, with A\'s ids', () => {
    const forgedQuery = `resourceId=user-a&requestContext=${FORGED_QUERIES[0][1]}`;

    it('lists only B\'s threads, whatever resource the query names', async () => {
      for (const query of [`agentId=${AGENT}`, `agentId=${AGENT}&resourceId=user-a`, 'resourceId=user-a', `agentId=${AGENT}&${forgedQuery}`,
        `agentId=${AGENT}&resourceId=user-a&page=0&perPage=100`, ...FORGED_QUERIES.map(([, encoded]) => `requestContext=${encoded}`)]) {
        const list = await send('b', 'GET', `/api/memory/threads?${query}`, { headers: STUDIO_HEADERS });
        expect([query, list.status]).toEqual([query, 200]);
        const threads = list.json().threads as Array<{ id: string; resourceId: string }>;
        expect(threads.map(thread => thread.id)).toContain(THREAD_B);
        expect(threads.every(thread => thread.resourceId === 'user-b')).toBe(true);
      }
    });

    it.each([
      ['GET', `/api/memory/threads/${THREAD_A}?agentId=${AGENT}`, undefined, 403],
      ['GET', `/api/memory/threads/${THREAD_A}`, undefined, 403],
      ['GET', `/api/memory/threads/${THREAD_A}?agentId=${AGENT}&${forgedQuery}`, undefined, 403],
      ['GET', `/api/memory/threads/${THREAD_A}?agentId=unknown-agent&resourceId=user-a`, undefined, 403],
      // Rename.
      ['PATCH', `/api/memory/threads/${THREAD_A}?agentId=${AGENT}`, { title: 'Seized' }, 403],
      ['PATCH', `/api/memory/threads/${THREAD_A}?agentId=${AGENT}&resourceId=user-a`, { title: 'Seized' }, 403],
      ['PATCH', `/api/memory/threads/${THREAD_A}`, { title: 'Seized' }, 400],
      // A write that names a new owner, or carries anything but a title.
      ['PATCH', `/api/memory/threads/${THREAD_A}?agentId=${AGENT}`, { title: 'Seized', resourceId: 'user-b' }, 400],
      ['PATCH', `/api/memory/threads/${THREAD_A}?agentId=${AGENT}`, { resourceId: 'user-b' }, 400],
      ['PATCH', `/api/memory/threads/${THREAD_A}?agentId=${AGENT}`, { title: 'Seized', metadata: { owner: 'user-b' } }, 400],
      ['PATCH', `/api/memory/threads/${THREAD_A}?agentId=${AGENT}`, { title: 'Seized', requestContext: FORGED_CONTEXT }, 400],
      // Copy.
      ['POST', `/api/memory/threads/${THREAD_A}/clone?agentId=${AGENT}`, {}, 403],
      ['POST', `/api/memory/threads/${THREAD_A}/clone?agentId=${AGENT}`, { title: 'Copy', resourceId: 'user-b' }, 403],
      ['POST', `/api/memory/threads/${THREAD_A}/clone?agentId=${AGENT}&resourceId=user-a`, { title: 'Copy' }, 403],
      ['POST', `/api/memory/threads/${THREAD_A}/clone?agentId=${AGENT}`, { resourceId: 'user-a' }, 400],
      ['POST', `/api/memory/threads/${THREAD_A}/clone?agentId=${AGENT}`, { newThreadId: THREAD_B }, 400],
      ['POST', `/api/memory/threads/${THREAD_A}/clone?agentId=${AGENT}`, { requestContext: FORGED_CONTEXT }, 400],
      // B's own thread, copied into A's account or over A's thread.
      ['POST', `/api/memory/threads/${THREAD_B}/clone?agentId=${AGENT}`, { resourceId: 'user-a' }, 400],
      ['POST', `/api/memory/threads/${THREAD_B}/clone?agentId=${AGENT}`, { newThreadId: THREAD_A }, 400],
      // Delete.
      ['DELETE', `/api/memory/threads/${THREAD_A}?agentId=${AGENT}`, undefined, 403],
      ['DELETE', `/api/memory/threads/${THREAD_A}?agentId=${AGENT}&resourceId=user-a`, undefined, 403],
      ['DELETE', `/api/memory/threads/${THREAD_A}`, undefined, 400],
      ['DELETE', `/api/memory/threads/${THREAD_A}?agentId=${AGENT}`, { resourceId: 'user-a' }, 403],
      // The create route, which wrote over an existing id (SEC-2), is gone.
      ['POST', `/api/memory/threads?agentId=${AGENT}`, { threadId: THREAD_A, resourceId: 'user-b', title: 'Seized' }, 404],
    ] as Array<[string, string, unknown, number]>)('cannot read, rename, copy, delete or re-own A\'s thread: %s %s %j', async (method, path, body, status) => {
      const threadsOfB = await threadsOf('user-b');
      const response = await send('b', method, path, { body, headers: STUDIO_HEADERS });
      expect(response.status).toBe(status);
      expect(response.json().error.code).toBe({ 400: 'bad_request', 403: 'forbidden', 404: 'not_found' }[status]);
      // No copy landed in either account.
      expect(await threadsOf('user-b')).toEqual(threadsOfB);
      expect(await threadsOf('user-a')).toEqual([THREAD_A]);
    });

    it('cannot read A\'s messages, paged or not', async () => {
      for (const query of ['', `agentId=${AGENT}`, 'page=0&perPage=1', `agentId=${AGENT}&page=0&perPage=40`, 'resourceId=user-a',
        `agentId=${AGENT}&resourceId=user-a&page=1&perPage=1`, `agentId=unknown-agent&resourceId=user-a`, forgedQuery,
        `orderBy=${encodeURIComponent(JSON.stringify({ field: 'createdAt', direction: 'ASC' }))}`]) {
        const response = await send('b', 'GET', `/api/memory/threads/${THREAD_A}/messages?${query}`, { headers: STUDIO_HEADERS });
        expect([query, response.status, response.json()]).toEqual([query, 403, FORBIDDEN]);
      }
    });

    it('cannot pull A\'s messages into its own thread with include', async () => {
      // The framework resolves included ids with no owner filter (SEC-2): on
      // B's own thread, without an agent id, this returned A's message.
      const include = encodeURIComponent(JSON.stringify([{ id: messageA, withPreviousMessages: 5, withNextMessages: 5 }]));
      for (const query of [`include=${include}`, `agentId=${AGENT}&include=${include}`, `agentId=unknown-agent&include=${include}`,
        `%69nclude=${include}`, `page=0&perPage=40&include=${include}`, `include=${include}&resourceId=user-a`]) {
        for (const thread of [THREAD_B, THREAD_A]) {
          const response = await send('b', 'GET', `/api/memory/threads/${thread}/messages?${query}`);
          expect([query, response.status, response.json()]).toEqual([query, 400, { error: { code: 'bad_request', message: 'Query parameter "include" is not supported' } }]);
          expect(response.text).not.toContain(messageA);
        }
      }
      // B's own history still reads, and holds nothing of A's.
      const own = await send('b', 'GET', `/api/memory/threads/${THREAD_B}/messages?agentId=${AGENT}`);
      expect(own.status).toBe(200);
      expect(own.text).toContain(QUESTION_B);
    });

    it('cannot add a turn to A\'s thread', async () => {
      for (const extra of [{}, { memory: { thread: THREAD_A, resource: 'user-a' } }, { resourceId: 'user-a', requestContext: FORGED_CONTEXT }]) {
        const response = await chat('b', THREAD_A, 'What else is covered?', extra, { headers: STUDIO_HEADERS });
        expect([response.status, response.json()]).toEqual([404, { error: { code: 'not_found', message: 'Conversation not found' } }]);
      }
      // No run started: neither the classifier nor the model saw the turn.
      expect(modelPrompts).toHaveLength(2);
      expect(JSON.stringify(classifierCalls)).not.toContain('What else is covered?');
    });

    it('cannot take an id A is creating at the same moment', async () => {
      const [first, second] = await Promise.all([chat('a', 'thread-race', QUESTION_B), chat('b', 'thread-race', QUESTION_B)]);
      expect([first.status, second.status].sort()).toEqual([200, 404]);
      const owner = first.status === 200 ? 'user-a' : 'user-b';
      await vi.waitFor(async () => expect(await sql('SELECT 1 FROM answer_audit WHERE thread_id = ?', ['thread-race'])).toHaveLength(1));
      expect(await sql('SELECT resourceId FROM mastra_threads WHERE id = ?', ['thread-race'])).toEqual([{ resourceId: owner }]);
      expect(await sql('SELECT DISTINCT resourceId FROM mastra_messages WHERE thread_id = ?', ['thread-race'])).toEqual([{ resourceId: owner }]);
    });

    it('cannot re-own A\'s thread through the store the server uses', async () => {
      // No gateway route reaches this write with another owner; the store's
      // own guard is what stops the next route that does.
      const store = (await server.runtime.storage.getStore('memory'))!;
      const now = new Date();
      await expect(store.saveThread({ thread: { id: THREAD_A, resourceId: 'user-b', title: 'Seized', createdAt: now, updatedAt: now } }))
        .rejects.toMatchObject({ status: 404 });
    });

    it('cannot read, rate or delete A\'s feedback', async () => {
      for (const query of [`threadId=${THREAD_A}`, `threadId=${THREAD_A}&resourceId=user-a`, ...FORGED_QUERIES.map(([, encoded]) => `threadId=${THREAD_A}&requestContext=${encoded}`)]) {
        const read = await send('b', 'GET', `/feedback?${query}`, { headers: STUDIO_HEADERS });
        expect([query, read.status, read.json()]).toEqual([query, 200, { feedback: [] }]);
      }
      for (const extra of [{}, { resourceId: 'user-a' }, { requestContext: FORGED_CONTEXT }]) {
        const rate = await send('b', 'POST', '/feedback', { body: { messageId: messageA, threadId: THREAD_A, rating: 'up', ...extra } });
        expect([rate.status, rate.json()]).toEqual([404, { error: { code: 'not_found', message: 'Conversation not found' } }]);
      }
      for (const query of ['', '?resourceId=user-a', `?requestContext=${FORGED_QUERIES[0][1]}`]) {
        const remove = await send('b', 'DELETE', `/feedback/${feedbackA}${query}`, { headers: STUDIO_HEADERS });
        expect([remove.status, remove.json()]).toEqual([404, { error: { code: 'not_found', message: 'Feedback not found' } }]);
      }
    });

    it('cannot read, decide or cancel A\'s research run', async () => {
      const notFound = { error: { code: 'research_run_not_found', message: 'Research run not found.' } };
      for (const query of ['', '?resourceId=user-a', ...FORGED_QUERIES.map(([, encoded]) => `?requestContext=${encoded}`)]) {
        const read = await send('b', 'GET', `/research/runs/${RUN_A}${query}`, { headers: STUDIO_HEADERS });
        expect([query, read.status, read.json()]).toEqual([query, 404, notFound]);
        expect((await send('b', 'GET', `/research/runs/current${query}`, { headers: STUDIO_HEADERS })).status).toBe(204);
      }
      // A forged context in the body is not a decision; without it the run is still not B's.
      const decided = await send('b', 'POST', `/research/runs/${RUN_A}/decision`, { body: { approved: true } });
      expect([decided.status, decided.json()]).toEqual([404, notFound]);
      const forged = await send('b', 'POST', `/research/runs/${RUN_A}/decision`, { body: { approved: false, requestContext: FORGED_CONTEXT } });
      expect(forged.status).toBe(400);
      for (const body of [undefined, { resourceId: 'user-a', requestContext: FORGED_CONTEXT }]) {
        const cancelled = await send('b', 'POST', `/research/runs/${RUN_A}/cancel`, { body, headers: { 'content-length': body ? String(Buffer.byteLength(JSON.stringify(body))) : '0' } });
        expect([cancelled.status, cancelled.json()]).toEqual([404, { error: { code: 'research_run_not_found', message: 'Research run not found or is already terminal.' } }]);
      }
    });
  });

  describe('a forged request context', () => {
    // What @mastra/server 1.45.0 merges from a client before any application
    // code runs: `requestContext` in a JSON POST or PUT body, `requestContext`
    // in a GET query (JSON or base64), and the `x-mastra-client-type: studio`
    // header, which sets `mastra__isStudio`. It drops the eight `mastra__*`
    // keys from the first two and keeps every other key, `user` included.
    it('in a chat body cannot name the owner, the prior turns, the verified question or the diagnostic record', async () => {
      const info = vi.spyOn(log, 'info');
      const verified = vi.mocked(verifyAnswer).mock.calls.length;
      const classified = classifierCalls.length;
      const prompts = modelPrompts.length;
      try {
        const turn = await chat('b', 'thread-forged', QUESTION_B, { resourceId: 'user-a', memory: { thread: 'thread-forged', resource: 'user-a' }, requestContext: FORGED_CONTEXT },
          { headers: STUDIO_HEADERS, query: `?resourceId=user-a&requestContext=${FORGED_QUERIES[0][1]}` });
        expect(turn.status).toBe(200);
        // A forged abort signal did not stop the turn.
        expect(turn.text).toContain(RELEASED);
        await vi.waitFor(async () => expect(await sql('SELECT 1 FROM answer_audit WHERE thread_id = ?', ['thread-forged'])).toHaveLength(1));
        // The thread and every row of the turn belong to the token's user.
        expect(await sql('SELECT resourceId FROM mastra_threads WHERE id = ?', ['thread-forged'])).toEqual([{ resourceId: 'user-b' }]);
        expect(await sql('SELECT DISTINCT resourceId FROM mastra_messages WHERE thread_id = ?', ['thread-forged'])).toEqual([{ resourceId: 'user-b' }]);
        expect(await sql('SELECT resource_id FROM answer_audit WHERE thread_id = ?', ['thread-forged'])).toEqual([{ resource_id: 'user-b' }]);
        // The verifier judged the question that was asked.
        const questions = vi.mocked(verifyAnswer).mock.calls.slice(verified).map(call => call[0]);
        expect(questions.length).toBeGreaterThan(0);
        expect(new Set(questions)).toEqual(new Set([QUESTION_B]));
        // The scope gate and the model saw this turn and no forged prior turn.
        const seen = JSON.stringify([classifierCalls.slice(classified), modelPrompts.slice(prompts)]);
        expect(classifierCalls.length).toBe(classified + 1);
        expect(modelPrompts.length).toBe(prompts + 1);
        expect(seen).toContain(QUESTION_B);
        for (const forged of [FORGED_PRIOR, FORGED_QUESTION, FORGED_DIAGNOSTIC, SECRET_A]) expect(seen).not.toContain(forged);
        // No diagnostic was finished under the client's record.
        expect(JSON.stringify(info.mock.calls)).not.toContain(FORGED_DIAGNOSTIC);
        expect(info.mock.calls.map(call => call[0])).not.toContain('chat.diagnostic_finished');
      } finally {
        info.mockRestore();
      }
    }, 30_000);

    it('in a GET query or a Studio header opens nothing of A\'s', async () => {
      for (const [encoding, encoded] of FORGED_QUERIES) {
        const query = `agentId=${AGENT}&resourceId=user-a&requestContext=${encoded}`;
        for (const path of [`/api/memory/threads/${THREAD_A}`, `/api/memory/threads/${THREAD_A}/messages`]) {
          const response = await send('b', 'GET', `${path}?${query}`, { headers: STUDIO_HEADERS });
          expect([encoding, path, response.status, response.json()]).toEqual([encoding, path, 403, FORBIDDEN]);
        }
        const unowned = await send('b', 'GET', `/api/agents?${query}`, { headers: STUDIO_HEADERS });
        expect([unowned.status, unowned.json()]).toEqual([404, REFUSED]);
      }
    });

    it('is not trusted when the framework\'s development bypass is switched on', async () => {
      // `x-mastra-dev-playground` skips authentication only for a server
      // with no auth provider; this one has one.
      vi.stubEnv('MASTRA_DEV', 'true');
      try {
        const anonymous = await send(null, 'GET', `/api/memory/threads/${THREAD_A}?agentId=${AGENT}`, { headers: STUDIO_HEADERS });
        expect([anonymous.status, anonymous.json()]).toEqual([401, UNAUTHORIZED]);
        const asB = await send('b', 'GET', `/api/memory/threads/${THREAD_A}/messages?agentId=${AGENT}`, { headers: STUDIO_HEADERS });
        expect([asB.status, asB.json()]).toEqual([403, FORBIDDEN]);
        const unowned = await send(null, 'POST', `/api/agents/${AGENT}/generate`, { body: { messages: 'hello' }, headers: STUDIO_HEADERS });
        expect([unowned.status, unowned.json()]).toEqual([404, REFUSED]);
      } finally {
        vi.stubEnv('MASTRA_DEV', undefined);
      }
    });
  });
});

describe('the Studio flag on the production server', () => {
  let server: ProductionServer;
  let send: ReturnType<typeof client>['send'];
  const thread = async () => (await server.runtime.appDatabase.client.execute({ sql: 'SELECT id, resourceId, title FROM mastra_threads WHERE id = ?', args: [THREAD_A] })).rows.map(row => ({ ...row }));
  const seize = () => send('b', 'POST', `/api/memory/threads?agentId=${AGENT}`, { body: { threadId: THREAD_A, resourceId: 'user-b', title: 'Seized' } });

  beforeAll(async () => {
    stubOffline();
    vi.stubEnv('ALLOW_MASTRA_STUDIO', 'true');
    server = await bootProductionServer(USERS, { memory: true, promptInjectionDetector: false, verifyOutput: true,
      model: new MockLanguageModelV3({ doStream: async () => { throw new Error('No model call is expected'); } }) });
    ({ send } = client(server.app));
    // No request has made the framework create its tables yet.
    await server.runtime.storage.init();
    const now = new Date();
    await (await server.runtime.storage.getStore('memory'))!.saveThread({ thread: { id: THREAD_A, resourceId: 'user-a', title: QUESTION_A, createdAt: now, updatedAt: now } });
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await server?.close();
  });

  it('opens nothing in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      for (const [method, path, body] of [
        ['GET', '/api/agents', undefined],
        ['POST', `/api/agents/${AGENT}/generate`, { messages: 'hello' }],
        ['GET', `/api/memory/search?agentId=${AGENT}&resourceId=user-a&searchQuery=dental`, undefined],
        ['GET', `/api/memory/threads/${THREAD_A}/working-memory?agentId=${AGENT}&resourceId=user-a`, undefined],
        ['POST', `/api/memory/threads?agentId=${AGENT}`, { threadId: THREAD_A, resourceId: 'user-b', title: 'Seized' }],
        ['POST', '/api/workflows/deepResearchWorkflow/start-async', {}],
      ] as Array<[string, string, unknown]>) {
        for (const caller of ['b', null] as const) {
          const response = await send(caller, method, path, { body, headers: STUDIO_HEADERS });
          expect([method, path, response.status, response.json()]).toEqual([method, path, 404, REFUSED]);
        }
      }
    } finally {
      vi.stubEnv('NODE_ENV', 'test');
    }
    expect(await thread()).toEqual([{ id: THREAD_A, resourceId: 'user-a', title: QUESTION_A }]);
  });

  it('outside production still asks for a token, and the framework\'s create route cannot re-own a thread', async () => {
    // The flag is in effect: an unowned framework route answers a signed-in user.
    expect((await send('b', 'GET', '/api/agents')).status).toBe(200);
    expect((await send(null, 'GET', '/api/agents')).status).toBe(401);
    // SEC-2: the framework's create route looks up no existing owner and the
    // adapter writes with INSERT OR REPLACE. The store's guard refuses it.
    // The framework now checks the owner first and answers 403; either way the thread keeps its owner.
    const seized = await seize();
    expect([403, 404]).toContain(seized.status);
    expect(await thread()).toEqual([{ id: THREAD_A, resourceId: 'user-a', title: QUESTION_A }]);
    // The same route does create a thread for an id nobody holds.
    const created = await send('b', 'POST', `/api/memory/threads?agentId=${AGENT}`, { body: { threadId: 'thread-new', resourceId: 'user-b', title: 'Mine' } });
    expect(created.status).toBe(200);
    expect(created.json()).toMatchObject({ id: 'thread-new', resourceId: 'user-b' });
  });
});
