import { test as setup } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import { writeHermeticStorageState } from '../helpers/test-auth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '../playwright/.auth/user.json');

// Hermetic replacement for auth.setup.ts: no browser, no WorkOS network
// round-trip — mint + seal a test session locally (see helpers/test-auth.ts).
setup('authenticate (hermetic)', async () => {
  await writeHermeticStorageState(authFile);
});
