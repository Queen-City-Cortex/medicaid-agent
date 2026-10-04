/** Explicit offline campaign only; all retries reserve against the same ledger. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const pipeline = fileURLToPath(new URL('../../../pipeline/', import.meta.url));
const python = `${pipeline}.venv/bin/python`;
function ledgerRpc(payload: Record<string, unknown>): Record<string, unknown> {
  const result = spawnSync(python, ['-m', 'pipeline.jev.ledger_rpc'], {
    cwd: pipeline, input: JSON.stringify({ ...payload, ledger: process.env.JEV_VALIDATION_LEDGER, pricing: process.env.JEV_VALIDATION_PRICING }), encoding: 'utf8', timeout: 30_000,
  });
  if (result.status !== 0) throw new Error('validation_budget_refused');
  try {
    const response = JSON.parse(result.stdout);
    if (!response.result) throw new Error();
    return response.result;
  } catch { throw new Error('validation_budget_refused'); }
}
let installed = false;
export function installValidationBudget(): void {
  if (installed || !process.env.JEV_VALIDATION_LEDGER) return;
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_SERVICE_ID) throw new Error('validation_requires_local_environment');
  if (!process.env.JEV_VALIDATION_PRICING) throw new Error('validation_pricing_required');
  installed = true;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    if (method !== 'POST') throw new Error('validation_unmetered_transport');
    const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    if (typeof raw !== 'string') throw new Error('validation_unbounded_transport');
    const reservation = ledgerRpc({ action: 'reserve', url, body: JSON.parse(raw) });
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.delete('content-length');
    const response = await original(input, { ...init, headers, body: JSON.stringify(reservation.body) });
    if (response.ok && !response.headers.get('content-type')?.includes('text/event-stream')) {
      let usage: unknown;
      try { usage = (await response.clone().json()).usage; } catch { /* Full reservation retained. */ }
      if (usage) ledgerRpc({ action: 'settle', reservation, usage });
    }
    return response;
  };
}
