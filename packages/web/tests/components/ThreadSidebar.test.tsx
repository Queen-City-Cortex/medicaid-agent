import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ThreadSidebar } from '../../src/components/ThreadSidebar';

const listMemoryThreads = vi.fn();
const listMessages = vi.fn();
const update = vi.fn();
const deleteThread = vi.fn();
const clone = vi.fn();
const getThread = vi.fn();
const signOut = vi.fn();

vi.mock('@workos-inc/authkit-nextjs/components', () => ({
  useAuth: () => ({ user: { email: 'testing@queencitycortex.com' }, signOut }),
}));


// A stable client object — returning a fresh object from the hook on every
// render would recreate fetchThreads each render and refetch (clearing error
// state) after every state change, which the real memoized client never does.
const mastraClient = {
  listMemoryThreads,
  getMemoryThread: () => ({
    listMessages,
    update,
    delete: deleteThread,
    clone,
    get: getThread,
  }),
};

vi.mock('@/lib/use-mastra-client', () => {
  // A STABLE pass-through runner (same reference every render) — the real
  // useMastraClientRunner returns a stable `run` (useCallback []); a fresh
  // object each render would churn fetchThreads's identity and refetch,
  // clearing error state (the bug the stable mock client above guards against).
  // The real fresh-token + 401-retry behavior is unit-tested separately in
  // tests/lib/mastra-client.test.ts (runWithFreshAuth).
  const runner = {
    run: <T,>(op: (c: typeof mastraClient) => T): T => op(mastraClient),
  };
  return {
    useMastraClientRunner: () => runner,
    useMastraReady: () => true,
  };
});

describe('ThreadSidebar', () => {
  beforeEach(() => {
    listMemoryThreads.mockReset();
    listMessages.mockReset();
    update.mockReset();
    deleteThread.mockReset();
    clone.mockReset();
    getThread.mockReset();
    signOut.mockReset();

    listMemoryThreads.mockResolvedValue({
      threads: [
        {
          id: 'thread-1',
          title: 'My conversation',
          updatedAt: '2026-04-13T12:00:00Z',
        },
      ],
    });
    listMessages.mockResolvedValue({ messages: [] });
  });

  it('signs out through the authenticated client provider', async () => {
    render(
      <ThreadSidebar
        currentThreadId="thread-1"
        resourceId="user-1"
        onSelectThread={() => {}}
        onNewThread={() => {}}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ returnTo: new URL('/', window.location.origin).href });
  });

  it('uses a dedicated selection button for the thread row', async () => {
    const onSelectThread = vi.fn();

    render(
      <ThreadSidebar
        currentThreadId="other-thread"
        resourceId="user-1"
        onSelectThread={onSelectThread}
        onNewThread={() => {}}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'My conversation' }));
    expect(onSelectThread).toHaveBeenCalledWith('thread-1');
  });

  it('does not select the thread when opening the actions menu or focusing rename input', async () => {
    const onSelectThread = vi.fn();
    const user = userEvent.setup();

    render(
      <ThreadSidebar
        currentThreadId="other-thread"
        resourceId="user-1"
        onSelectThread={onSelectThread}
        onNewThread={() => {}}
      />,
    );

    const actionsButton = await screen.findByRole('button', { name: 'Thread actions for My conversation' });
    await user.click(actionsButton);
    expect(onSelectThread).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('menuitem', { name: /Rename/i }));
    expect(onSelectThread).not.toHaveBeenCalled();

    const renameInput = await screen.findByRole('textbox', { name: 'Rename My conversation' });
    await user.click(renameInput);
    expect(onSelectThread).not.toHaveBeenCalled();

    await user.type(renameInput, ' updated');
    await waitFor(() => expect(renameInput).toHaveValue('My conversation updated'));
    expect(onSelectThread).not.toHaveBeenCalled();
  });

  it('renders Rename / Duplicate / Export / Delete menu items', async () => {
    const user = userEvent.setup();
    render(
      <ThreadSidebar
        currentThreadId="other-thread"
        resourceId="user-1"
        onSelectThread={() => {}}
        onNewThread={() => {}}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Thread actions for My conversation' }));

    expect(await screen.findByRole('menuitem', { name: /Rename/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Duplicate/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Export/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Delete/i })).toBeInTheDocument();
  });

  it('calls thread.clone with the original title plus "(copy)" when Duplicate is clicked', async () => {
    const user = userEvent.setup();
    clone.mockResolvedValue({
      thread: { id: 'thread-2', title: 'My conversation (copy)' },
      clonedMessages: [],
    });

    render(
      <ThreadSidebar
        currentThreadId="other-thread"
        resourceId="user-1"
        onSelectThread={() => {}}
        onNewThread={() => {}}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Thread actions for My conversation' }));
    await user.click(await screen.findByTestId('thread-duplicate'));

    await waitFor(() => expect(clone).toHaveBeenCalledTimes(1));
    expect(clone).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'My conversation (copy)',
        resourceId: 'user-1',
      }),
    );
  });

  it('preserves the thread metadata and resourceId when renaming', async () => {
    const user = userEvent.setup();
    listMemoryThreads.mockResolvedValue({
      threads: [
        {
          id: 'thread-1',
          title: 'My conversation',
          resourceId: 'user-1',
          updatedAt: '2026-04-13T12:00:00Z',
          metadata: { pinned: true, source: 'import' },
        },
      ],
    });
    update.mockResolvedValue({});

    render(
      <ThreadSidebar
        currentThreadId="other-thread"
        resourceId="user-1"
        onSelectThread={() => {}}
        onNewThread={() => {}}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Thread actions for My conversation' }));
    await user.click(await screen.findByRole('menuitem', { name: /Rename/i }));
    const renameInput = await screen.findByRole('textbox', { name: 'Rename My conversation' });
    await user.clear(renameInput);
    await user.type(renameInput, 'Renamed thread{Enter}');

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith({
      title: 'Renamed thread',
      metadata: { pinned: true, source: 'import' },
      resourceId: 'user-1',
    });
  });

  it('surfaces an inline error when rename fails', async () => {
    const user = userEvent.setup();
    update.mockRejectedValue(new Error('boom'));

    render(
      <ThreadSidebar
        currentThreadId="other-thread"
        resourceId="user-1"
        onSelectThread={() => {}}
        onNewThread={() => {}}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Thread actions for My conversation' }));
    await user.click(await screen.findByRole('menuitem', { name: /Rename/i }));
    const renameInput = await screen.findByRole('textbox', { name: 'Rename My conversation' });
    await user.type(renameInput, ' updated{Enter}');

    expect(await screen.findByText('Failed to rename thread')).toBeInTheDocument();
    // The edit state is closed and the thread row is still rendered.
    expect(screen.queryByRole('textbox', { name: 'Rename My conversation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My conversation' })).toBeInTheDocument();
  });

  it('surfaces an inline error when duplicate fails', async () => {
    const user = userEvent.setup();
    clone.mockRejectedValue(new Error('boom'));

    render(
      <ThreadSidebar
        currentThreadId="other-thread"
        resourceId="user-1"
        onSelectThread={() => {}}
        onNewThread={() => {}}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Thread actions for My conversation' }));
    await user.click(await screen.findByTestId('thread-duplicate'));

    expect(await screen.findByText('Failed to duplicate thread')).toBeInTheDocument();
  });

  it('exports the thread as a Markdown document with a slugged filename', async () => {
    const user = userEvent.setup();
    getThread.mockResolvedValue({
      id: 'thread-1',
      title: 'My conversation',
      resourceId: 'user-1',
      createdAt: '2026-04-23T12:00:00Z',
      updatedAt: '2026-04-23T12:30:00Z',
      metadata: null,
    });
    listMessages.mockResolvedValue({
      messages: [
        { id: 'm1', role: 'user', content: { parts: [{ type: 'text', text: 'hi' }] } },
      ],
    });

    // Spy on the download plumbing — the component clicks a synthetic <a>.
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      render(
        <ThreadSidebar
          currentThreadId="other-thread"
          resourceId="user-1"
          onSelectThread={() => {}}
          onNewThread={() => {}}
        />,
      );

      await user.click(await screen.findByRole('button', { name: 'Thread actions for My conversation' }));
      await user.click(await screen.findByTestId('thread-export'));

      await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
      const blob = createObjectURL.mock.calls[0][0];
      // Markdown, not a JSON blob — the export goes into a case file.
      expect(blob.type).toBe('text/markdown');
      const text = await blob.text();
      expect(text).toContain('# My conversation');
      expect(text).toContain('NC Medicaid Navigator');
      expect(clickSpy).toHaveBeenCalled();
      const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
      expect(anchor.download).toMatch(/^thread-my-conversation-\d{4}-\d{2}-\d{2}\.md$/);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      clickSpy.mockRestore();
    }
  });
});
