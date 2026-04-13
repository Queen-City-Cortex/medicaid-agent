import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ThreadSidebar } from '../../src/components/ThreadSidebar';

const listMemoryThreads = vi.fn();
const listMessages = vi.fn();
const update = vi.fn();
const deleteThread = vi.fn();

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
});
