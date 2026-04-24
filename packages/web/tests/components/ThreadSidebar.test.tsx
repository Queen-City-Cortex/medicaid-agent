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

vi.mock('@workos-inc/authkit-nextjs/components', () => ({
  useAuth: () => ({ user: { email: 'testing@queencitycortex.com' } }),
}));

vi.mock('@workos-inc/authkit-nextjs', () => ({
  signOut: vi.fn(),
}));

vi.mock('@/lib/use-mastra-client', () => ({
  useMastraClient: () => ({
    listMemoryThreads,
    getMemoryThread: () => ({
      listMessages,
      update,
      delete: deleteThread,
      clone,
      get: getThread,
    }),
  }),
  useMastraReady: () => true,
}));

describe('ThreadSidebar', () => {
  beforeEach(() => {
    listMemoryThreads.mockReset();
    listMessages.mockReset();
    update.mockReset();
    deleteThread.mockReset();
    clone.mockReset();
    getThread.mockReset();

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

  it('triggers a JSON download with a slugged filename when Export is clicked', async () => {
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
    const createObjectURL = vi.fn(() => 'blob:mock-url');
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
      const blob = createObjectURL.mock.calls[0][0] as Blob;
      expect(blob.type).toBe('application/json');
      expect(clickSpy).toHaveBeenCalled();
      // Confirm the anchor had a slugged .json download name.
      const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
      expect(anchor.download).toMatch(/^thread-my-conversation-\d{4}-\d{2}-\d{2}\.json$/);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      clickSpy.mockRestore();
    }
  });
});
