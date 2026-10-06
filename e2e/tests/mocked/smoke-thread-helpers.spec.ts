import { test, expect } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';
// @ts-expect-error The smoke helpers are an untyped script module.
import { activeThreadForRestore, allowThreadWritesOnlyTo, deleteSmokeThread, renameActiveThread } from '../../scripts/smoke-thread.mjs';

// The production smoke drives the sidebar's real menu, rename field and delete
// dialog, and cannot run in CI. This runs the same helpers against the real
// components, so a markup change that would break the smoke fails here first.
test('the production smoke helpers rename and delete only the thread the run created', async ({ page }) => {
  const question = 'What is EPSDT?';
  const threads = [{ id: 'leftover', title: question, updatedAt: new Date(Date.now() - 86_400_000).toISOString() }];
  const writes: string[] = [];
  let created = '';
  await mockMastraAPI(page, { threads });
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !new URL(request.url()).pathname.endsWith('/memory/threads')) return;
    created = request.postDataJSON().threadId;
    threads.unshift({ id: created, title: question, updatedAt: new Date().toISOString() });
  });
  await page.route(/\/api\/memory\/threads\/[^/?]+(\?.*)?$/, async (route) => {
    const request = route.request();
    const id = decodeURIComponent(new URL(request.url()).pathname.split('/').pop() ?? '');
    const index = threads.findIndex((thread) => thread.id === id);
    writes.push(`${request.method()} ${id}`);
    if (request.method() === 'PATCH') threads[index].title = request.postDataJSON().title;
    else if (request.method() === 'DELETE') threads.splice(index, 1);
    else return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(threads[index] ?? {}) });
  });
  await allowThreadWritesOnlyTo(page, () => [created]);

  const chat = new ChatPage(page);
  await chat.goto();
  await chat.sendMessage(question);
  await chat.waitForAssistantMessage('Mock response.');
  await expect(chat.threadItems()).toHaveCount(2);
  await expect(activeThreadForRestore(page)).rejects.toThrow(/uniquely identify/);

  await renameActiveThread(page, 'smoke run-1');
  expect(await activeThreadForRestore(page)).toBe('smoke run-1');
  expect(threads.map((thread) => [thread.id, thread.title])).toEqual([[created, 'smoke run-1'], ['leftover', question]]);

  await deleteSmokeThread(page, 'smoke run-1', created);
  await expect(chat.threadItems()).toHaveCount(1);
  expect(threads.map((thread) => thread.id)).toEqual(['leftover']);
  expect(new Set(writes)).toEqual(new Set([`PATCH ${created}`, `DELETE ${created}`]));
});
