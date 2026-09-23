import { Command } from 'commander';
import { registerCrawlCommand } from './cli/crawl.js';
import { registerCheckCommand } from './cli/check.js';
import { registerStatsCommand } from './cli/stats.js';
import { registerListCommand } from './cli/list.js';
import { registerAddUrlCommand } from './cli/add-url.js';
import { registerExportCommand } from './cli/export.js';
import { registerUpdateFixturesCommand } from './cli/update-fixtures.js';
import { registerReconcileCommand } from './cli/reconcile.js';

import { registerReactivateCommand } from './cli/reactivate.js';

const program = new Command()
  .name('nc-medicaid-crawler')
  .description('Polite incremental crawler for NC Medicaid policy documents')
  .version('1.0.0');

registerCrawlCommand(program);
registerCheckCommand(program);
registerStatsCommand(program);
registerListCommand(program);
registerAddUrlCommand(program);
registerExportCommand(program);
registerUpdateFixturesCommand(program);
registerReconcileCommand(program);
registerReactivateCommand(program);

program.parse();
