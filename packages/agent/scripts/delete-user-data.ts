/**
 * Prints the SQL that deletes one user's data from the agent's chat store:
 * the same statements AppDatabase.deleteUserData runs, in one transaction.
 * It opens no database and contacts nothing; an operator passes the output
 * to sqlite3 on the agent volume (RUNBOOK "Account deletion requests").
 *
 * Usage (from packages/agent):
 *   npx tsx scripts/delete-user-data.ts user_01ABCDEFGHJKMNPQRSTVWXYZ01
 *
 * Exits 2 and prints nothing on stdout unless the single argument is a
 * WorkOS user id.
 */
import { renderUserDataDeletionSql } from '../src/storage/app-database.js';

const args = process.argv.slice(2);
try {
  if (args.length !== 1) throw new Error('Usage: npx tsx scripts/delete-user-data.ts <WorkOS user id>');
  process.stdout.write(renderUserDataDeletionSql(args[0]));
} catch (err) {
  console.error(err instanceof Error ? err.message : 'Could not print the deletion SQL.');
  process.exit(2);
}
