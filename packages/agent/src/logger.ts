import { PinoLogger } from '@mastra/loggers';

/**
 * Structured application logger for `packages/agent`.
 *
 * This is distinct from the Mastra framework logger wired into the `Mastra`
 * instance (which drives `@mastra/observability` LLM/agent tracing). This one is
 * for our own operational logs — external-call failures, fail-closed paths,
 * health-check failures — emitted as JSON to stdout so Railway/Sentry pick them
 * up. Level is `info` by default; override with `LOG_LEVEL`.
 *
 * Exported as a plain object so call sites read `log.error('event', { … })` and
 * tests can `vi.spyOn(log, 'error')` to assert that an important path logged.
 * Use a short, dot-namespaced event string as the message and put variable data
 * in the fields object — never interpolate secrets or full payloads.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const LEVEL: Level = ((): Level => {
  const v = process.env.LOG_LEVEL;
  return v === 'debug' || v === 'info' || v === 'warn' || v === 'error' ? v : 'info';
})();

const pino = new PinoLogger({ name: 'agent', level: LEVEL });

export const log = {
  debug(event: string, fields?: Fields): void {
    pino.debug(event, fields ?? {});
  },
  info(event: string, fields?: Fields): void {
    pino.info(event, fields ?? {});
  },
  warn(event: string, fields?: Fields): void {
    pino.warn(event, fields ?? {});
  },
  error(event: string, fields?: Fields): void {
    pino.error(event, fields ?? {});
  },
};

/**
 * Normalize an unknown thrown value into compact, loggable fields — message and
 * error name only, never the full stack in structured fields (stacks bloat the
 * log line; Sentry already captures them where it's wired).
 *
 * Node's `fetch` surfaces network failures as `TypeError: fetch failed` with the
 * real reason (`ECONNREFUSED`, DNS failure, …) on `err.cause`, so include the
 * cause's message when present — otherwise the log would only ever say
 * "fetch failed".
 */
export function errorFields(err: unknown): Fields {
  if (err && typeof err === 'object' && 'message' in err) {
    const fields: Fields = { err: String(err.message), errName: 'name' in err ? String(err.name) : 'Error' };
    if ('cause' in err && err.cause !== undefined) {
      fields.cause = err.cause instanceof Error ? err.cause.message : String(err.cause);
    }
    return fields;
  }
  return { err: String(err) };
}
