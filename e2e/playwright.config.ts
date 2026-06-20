import { defineConfig, devices } from '@playwright/test';
import { config as dotenv } from 'dotenv';
import path from 'path';

dotenv({ path: path.resolve(import.meta.dirname, '../.env') });

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Auth setup — runs first, saves session cookies for other projects
    { name: 'setup', testMatch: /.*\.setup\.ts/ },

    {
      name: 'mocked',
      testDir: './tests/mocked',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
      timeout: 15_000,
    },
    {
      name: 'smoke',
      testDir: './tests/smoke',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
      timeout: 120_000,
    },

    // Opt-in screenshot project for design review. Gated behind DESIGN_SHOTS so
    // a bare `npx playwright test` never pulls it in (it would otherwise force a
    // real WorkOS `setup` login on every full local run). Authenticated like the
    // others but with the Mastra backend mocked; writes PNGs to design-shots/
    // rather than asserting. Run: `DESIGN_SHOTS=1 npx playwright test --project=design`.
    ...(process.env.DESIGN_SHOTS
      ? [
          {
            name: 'design',
            testDir: './tests/design',
            testMatch: /.*\.shots\.ts/,
            use: {
              ...devices['Desktop Chrome'],
              viewport: { width: 1280, height: 900 },
              storageState: 'playwright/.auth/user.json',
            },
            dependencies: ['setup'],
            timeout: 30_000,
          },
        ]
      : []),
  ],

  webServer: {
    command: 'npm run dev',
    cwd: '../packages/web',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
