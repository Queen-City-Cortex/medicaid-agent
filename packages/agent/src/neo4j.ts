import neo4j, { Driver, Session } from 'neo4j-driver';
import { intEnv, strEnv } from './env.js';

// Derived from the Session signature rather than imported from
// neo4j-driver-core, which this package doesn't declare as a dependency.
type TransactionConfig = NonNullable<Parameters<Session['run']>[2]>;

const NEO4J_URI = strEnv('NEO4J_URI', 'bolt://localhost:7687');
const NEO4J_USER = strEnv('NEO4J_USER', 'neo4j');
const NEO4J_PASSWORD = strEnv('NEO4J_PASSWORD', 'medicaid-dev');

// A slow or wedged Neo4j previously hung requests until the 10-minute server
// timeout. Connection-level limits bound how long we wait to reach the DB;
// the per-query transaction timeout (applied in withSession below) bounds how
// long any single query may run server-side. 30s is generous for the hybrid
// search + graph traversal queries the corpus issues (typically <5s).
const NEO4J_QUERY_TIMEOUT_MS = intEnv('NEO4J_QUERY_TIMEOUT_MS', 30_000);

// Close the driver (and its pooled bolt connections) after this long with no
// session in flight; the next getDriver() call reconnects transparently.
// Railway's Serverless sleep counts any outbound packet as activity, and an
// idle pooled bolt connection still exchanges keep-alive/ACK packets with
// Neo4j once a minute, which kept the agent awake and billed around the clock.
// <= 0 disables the idle close.
const NEO4J_IDLE_CLOSE_MS = intEnv('NEO4J_IDLE_CLOSE_MS', 5 * 60_000);

let driver: Driver | null = null;
let activeSessions = 0;
let lastUsedAt = 0;
let idleTimer: ReturnType<typeof setInterval> | null = null;

function closeIfIdle(): void {
  if (!driver || activeSessions > 0) return;
  if (Date.now() - lastUsedAt < NEO4J_IDLE_CLOSE_MS) return;
  void closeDriver();
}

export function getDriver(): Driver {
  lastUsedAt = Date.now();
  if (!driver) {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), {
      connectionTimeout: 10_000,
      connectionAcquisitionTimeout: 30_000,
      maxTransactionRetryTime: 30_000,
    });
    if (NEO4J_IDLE_CLOSE_MS > 0 && !idleTimer) {
      idleTimer = setInterval(closeIfIdle, Math.min(NEO4J_IDLE_CLOSE_MS, 60_000));
      idleTimer.unref();
    }
  }
  return driver;
}

export async function withSession<T>(fn: (session: Session) => Promise<T>): Promise<T> {
  const session = getDriver().session();
  activeSessions += 1;
  // Every session.run in the corpus goes through here, so inject the
  // transaction timeout at this single choke point rather than at each call
  // site. The override shadows the prototype method on this instance only; an
  // explicit TransactionConfig from a caller still wins via the spread.
  const originalRun = session.run.bind(session);
  session.run = ((query: unknown, parameters?: unknown, config?: TransactionConfig) =>
    originalRun(
      query as Parameters<typeof originalRun>[0],
      parameters as Parameters<typeof originalRun>[1],
      { timeout: NEO4J_QUERY_TIMEOUT_MS, ...config },
    )) as Session['run'];
  try {
    return await fn(session);
  } finally {
    try {
      await session.close();
    } finally {
      activeSessions -= 1;
      lastUsedAt = Date.now();
    }
  }
}

export async function closeDriver(): Promise<void> {
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
  const current = driver;
  driver = null;
  if (current) await current.close();
}
