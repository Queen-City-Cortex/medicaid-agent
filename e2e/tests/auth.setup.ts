import { test as setup, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  // Navigate to the app — proxy redirects to WorkOS hosted login
  await page.goto('/chat');

  // WorkOS AuthKit hosted login page
  // Fill email and continue
  await page.getByLabel(/email/i).fill(process.env.TEST_USER_EMAIL!);
  await page.getByRole('button', { name: /continue/i }).click();

  // Fill password and sign in
  await page.getByLabel(/password/i).fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole('button', { name: /continue|sign in/i }).click();

  // Wait for redirect back to /chat after OAuth callback
  await page.waitForURL('**/chat', { timeout: 15_000 });

  // Verify we're authenticated — the chat UI should be visible
  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 10_000 });

  // Save the authenticated state (wos-session cookie)
  await page.context().storageState({ path: authFile });
});
