import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { activeThreadForRestore } from '../smoke-thread.mjs';

test('waits for the active thread when the previous answer still leads the sidebar', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<div class="group"><button data-testid="thread-item">Old EPSDT answer</button></div>');
    const title = activeThreadForRestore(page);
    await page.evaluate(() => setTimeout(() => {
      document.body.insertAdjacentHTML('beforeend', '<div class="group border-l-accent"><button data-testid="thread-item">New EPSDT answer</button></div>');
    }, 100));
    assert.equal(await title, 'New EPSDT answer');
  } finally { await browser.close(); }
});

test('rejects ambiguous sidebar titles instead of selecting the first match', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<div class="group"><button data-testid="thread-item">EPSDT</button></div><div class="group border-l-accent"><button data-testid="thread-item">EPSDT</button></div>');
    await assert.rejects(activeThreadForRestore(page), /uniquely identify/);
  } finally { await browser.close(); }
});
