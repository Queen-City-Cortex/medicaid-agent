/**
 * Monthly usage/cost rollup over the usage_events table.
 *
 * Usage (from packages/agent):
 *   npx tsx scripts/usage-report.ts --month 2026-07 [--by model|user|day]
 *   DATABASE_URL=file:/path/to/downloaded-backup.db npx tsx scripts/usage-report.ts --month 2026-07
 *
 * Point DATABASE_URL at a dated mastra backup from the Railway bucket (see
 * RUNBOOK "Backups & Restore") to report on production numbers. Costs are
 * estimates from src/usage/pricing.ts — rows whose model has no price entry
 * are counted and flagged, never dropped.
 */
import '../src/load-env.js';
import { createClient } from '@libsql/client';
import { estimateCostUsd } from '../src/usage/pricing.js';

interface Args {
  month: string;
  by: 'model' | 'user' | 'day';
}

function parseArgs(argv: string[]): Args {
  let month = '';
  let by: Args['by'] = 'model';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--month') month = argv[++i] ?? '';
    else if (argv[i] === '--by') by = (argv[++i] ?? 'model') as Args['by'];
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    console.error('Usage: npx tsx scripts/usage-report.ts --month YYYY-MM [--by model|user|day]');
    process.exit(2);
  }
  if (!['model', 'user', 'day'].includes(by)) {
    console.error(`Invalid --by ${by}: expected model|user|day`);
    process.exit(2);
  }
  return { month, by };
}

const GROUP_EXPR: Record<Args['by'], string> = {
  model: 'model_id',
  user: 'user_id',
  day: "strftime('%Y-%m-%d', created_at / 1000, 'unixepoch')",
};

async function main() {
  const { month, by } = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL || 'file:./mastra.db';
  const client = createClient({ url });

  const start = Date.parse(`${month}-01T00:00:00Z`);
  const endDate = new Date(start);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  const end = endDate.getTime();

  const result = await client.execute({
    sql: `SELECT ${GROUP_EXPR[by]} AS grp, model_id,
                 COUNT(*) AS runs,
                 SUM(COALESCE(input_tokens, 0)) AS input_tokens,
                 SUM(COALESCE(output_tokens, 0)) AS output_tokens,
                 SUM(COALESCE(cached_input_tokens, 0)) AS cached_input_tokens
          FROM usage_events
          WHERE created_at >= ? AND created_at < ?
          GROUP BY grp, model_id
          ORDER BY grp, model_id`,
    args: [start, end],
  });

  if (result.rows.length === 0) {
    console.log(`No usage recorded for ${month} in ${url}`);
    return;
  }

  let totalCost = 0;
  const unknownModels = new Set<string>();
  const lines: string[] = [];
  for (const row of result.rows) {
    const modelId = String(row.model_id);
    const { costUsd, known } = estimateCostUsd({
      modelId,
      inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens),
      cachedInputTokens: Number(row.cached_input_tokens),
    });
    if (!known) unknownModels.add(modelId);
    totalCost += costUsd;
    lines.push(
      [
        String(row.grp).padEnd(28),
        by === 'model' ? '' : modelId.padEnd(18),
        `runs=${String(row.runs).padStart(5)}`,
        `in=${String(row.input_tokens).padStart(11)}`,
        `cached=${String(row.cached_input_tokens).padStart(11)}`,
        `out=${String(row.output_tokens).padStart(9)}`,
        `~$${costUsd.toFixed(2)}${known ? '' : ' (no price!)'}`,
      ].join('  '),
    );
  }

  console.log(`Usage for ${month} (grouped by ${by}) — ${url}\n`);
  for (const line of lines) console.log(line);
  console.log(`\nEstimated total: $${totalCost.toFixed(2)}`);
  if (unknownModels.size > 0) {
    console.log(
      `WARNING: no price entry for: ${[...unknownModels].join(', ')} — add to src/usage/pricing.ts`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
