import { test, expect } from '@playwright/test';

// The landing, terms, and privacy pages are the public (pre-auth) surface —
// these specs run logged out to prove the proxy allow-list actually admits
// them without a WorkOS round-trip.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Landing page', () => {
  test('renders logged out with the citation-footnote disclaimer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Answers from the policy record, not from memory.',
    );
    // The hero footnote resolves to the disclaimer block, like an answer citation.
    await page.getByRole('link', { name: /see disclaimer/i }).click();
    const disclaimer = page.locator('#disclaimer');
    await expect(disclaimer).toContainText('does not give legal advice');
    await expect(disclaimer).toContainText('NC DHHS');
  });

  test('links to terms, privacy, and sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
      'href',
      '/chat',
    );
    // "Terms of use" appears in both the disclaimer block and the footer —
    // scope to the footer nav to keep the locator strict.
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: 'Terms of use' })).toHaveAttribute(
      'href',
      '/terms',
    );
    await expect(footer.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });
});

test.describe('Auth boundary', () => {
  test('/chat still requires sign-in when logged out', async ({ page }) => {
    // Guards the proxy allow-list semantics: '/' being unauthenticated must
    // NOT prefix-admit protected routes. A logged-out /chat visit has to
    // bounce to the WorkOS hosted sign-in, off this origin.
    await page.goto('/chat', { waitUntil: 'commit' });
    await page.waitForURL((url) => url.hostname !== 'localhost', { timeout: 10_000 });
    expect(new URL(page.url()).hostname).not.toBe('localhost');
  });
});

test.describe('Legal pages', () => {
  test('terms page renders with the draft banner and core clauses', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms of Use');
    await expect(page.getByTestId('legal-draft-banner')).toContainText(/pending attorney review/i);
    await expect(page.getByRole('heading', { name: /not legal advice/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /limitation of liability/i })).toBeVisible();
  });

  test('privacy page renders with retention and subprocessor sections', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy Policy');
    await expect(page.getByTestId('legal-draft-banner')).toBeVisible();
    await expect(page.getByRole('heading', { name: /retention and deletion/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /who processes it/i })).toBeVisible();
  });
});
