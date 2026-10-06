/**
 * Prints recent thumbs-down ratings as a review queue: for each, the question,
 * the released answer and the user's comment, newest first. It only reads the
 * database. Reviewed cases are promoted into data/golden/dataset.json by hand;
 * this is not golden-dataset format.
 *
 * THE OUTPUT CONTAINS USER TEXT (questions and comments, which may hold client
 * details despite the screens). Read it in the terminal. Do not paste it into
 * tickets, chat, commits or documents, and do not redirect it to a file you
 * will keep. See RUNBOOK "Data classification & retention".
 *
 * Usage (from packages/agent):
 *   npx tsx scripts/feedback-review.ts [--days 30] [--limit 50]
 *   DATABASE_URL=file:/path/to/downloaded-backup.db npx tsx scripts/feedback-review.ts
 *
 * Point DATABASE_URL at a dated mastra backup from the Railway bucket (see
 * RUNBOOK "Backups & Restore"). A rating is listed only while its conversation
 * still exists: feedback is deleted with its thread and after 180 days.
 */
import '../src/load-env.js';
import { createClient } from '@libsql/client';
import { renderNegativeFeedbackReview } from '../src/feedback/review.js';

function positiveInteger(argv: string[], flag: string, fallback: number): number {
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    console.error('Usage: npx tsx scripts/feedback-review.ts [--days N] [--limit N]');
    process.exit(2);
  }
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  const options = { days: positiveInteger(argv, '--days', 30), limit: positiveInteger(argv, '--limit', 50) };
  const client = createClient({ url: process.env.DATABASE_URL || 'file:./mastra.db' });
  try {
    process.stdout.write(await renderNegativeFeedbackReview(client, options));
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : 'Could not read feedback.');
  process.exit(1);
});
