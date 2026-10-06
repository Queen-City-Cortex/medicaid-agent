// The sidebar refresh is asynchronous. Its first row can still be the previous
// conversation after the new stream completes. Wait for the active row instead.
export async function activeThreadForRestore(page) {
  const active = page.locator('.group.border-l-accent [data-testid="thread-item"]');
  await active.waitFor({ state: 'visible', timeout: 15_000 });
  const title = ((await active.textContent()) ?? '').replace(/\s+/g, ' ').trim();
  if (!title || await threadByExactTitle(page, title).count() !== 1) {
    throw new Error('Cannot uniquely identify the active thread for persistence smoke');
  }
  return title;
}

export function threadByExactTitle(page, title) {
  return page.getByRole('button', { name: title, exact: true });
}

// Every run asks the same question, so its thread starts with the same title
// as every earlier run. A title of its own keeps the persistence checks able
// to find it, and tells an operator which leftovers are smoke threads.
export function smokeThreadTitle(runId, now = new Date()) {
  return ['smoke', runId, now.toISOString()].filter(Boolean).join(' ');
}

// Targets the active row, never a title: an earlier run that died before its
// rename leaves a row with the same question as this one.
export async function renameActiveThread(page, title) {
  const row = page.locator('.group.border-l-accent');
  await row.locator('[data-testid="thread-item"]').waitFor({ state: 'visible', timeout: 15_000 });
  await row.getByRole('button', { name: /^Thread actions for / }).click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const input = row.getByRole('textbox');
  await input.fill(title);
  await input.press('Enter');
  await row.getByRole('button', { name: title, exact: true }).waitFor({ state: 'visible' });
}

/** The thread a memory API request addresses, or null for any other URL. */
export function threadIdFromUrl(url) {
  const match = new URL(url).pathname.match(/\/memory\/threads\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

// The sidebar is driven by position and title. This ties every rename and
// delete to a thread this run created: a write to any other thread is aborted
// before it leaves the browser.
export async function allowThreadWritesOnlyTo(page, ownedThreads, report = console.warn) {
  await page.route(url => threadIdFromUrl(url.href) !== null, async route => {
    const request = route.request();
    const reads = ['GET', 'HEAD', 'OPTIONS'].includes(request.method());
    if (reads || ownedThreads().includes(threadIdFromUrl(request.url()))) return route.fallback();
    report(`Blocked ${request.method()} of a thread this smoke run did not create.`);
    return route.abort();
  });
}

export async function deleteSmokeThread(page, title, threadId) {
  const actions = page.getByRole('button', { name: `Thread actions for ${title}`, exact: true });
  if (await actions.count() !== 1) throw new Error('Cannot uniquely identify the smoke thread to delete');
  const deleted = page.waitForResponse(response => response.request().method() === 'DELETE'
    && threadIdFromUrl(response.url()) === threadId);
  deleted.catch(() => undefined);
  await actions.click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  if (!(await deleted).ok()) throw new Error('Smoke thread deletion was rejected');
  await threadByExactTitle(page, title).waitFor({ state: 'detached' });
}

// A passing run removes its thread; a failing run keeps it for diagnosis.
// Cleanup is hygiene, so it warns and never turns a passing smoke into a failure.
export async function finishSmokeThread({ succeeded, title, threadIds, deleteThread, report = console.warn }) {
  const named = `${title ? `"${title}"` : 'still titled with its question'} (thread ${threadIds.join(', ') || 'unknown'})`;
  if (!succeeded) {
    report(`Smoke thread kept for diagnosis: ${named}`);
    return 'kept';
  }
  try {
    if (!title || threadIds.length !== 1) throw new Error('the run did not record exactly one renamed thread');
    await deleteThread(title, threadIds[0]);
    return 'deleted';
  } catch (error) {
    report(`Smoke thread cleanup failed; delete it by hand: ${named}: ${error.message}`);
    return 'kept';
  }
}
