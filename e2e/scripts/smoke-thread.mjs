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
