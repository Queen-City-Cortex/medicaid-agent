'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@workos-inc/authkit-nextjs/components';
import { signOut } from '@workos-inc/authkit-nextjs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { mastraClient } from '@/lib/mastra-client';
import type { StorageThreadType } from '@mastra/core/memory';

const AGENT_ID = 'nc-medicaid-navigator';

interface ThreadSidebarProps {
  currentThreadId: string;
  resourceId: string;
  refreshKey?: number;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
}

export function ThreadSidebar({ currentThreadId, resourceId, refreshKey, onSelectThread, onNewThread }: ThreadSidebarProps) {
  const { user } = useAuth();
  const [threads, setThreads] = useState<StorageThreadType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchThreads = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await mastraClient.listMemoryThreads({
        resourceId,
        agentId: AGENT_ID,
        orderBy: 'updatedAt',
        sortDirection: 'DESC',
        perPage: 50,
      });
      setThreads(result.threads ?? []);
    } catch (err) {
      console.error('Failed to fetch threads:', err);
      setThreads([]);
      setError('Failed to load threads');
    } finally {
      setIsLoading(false);
    }
  }, [resourceId]);

  // Fetch threads on mount and when currentThreadId changes (new thread created)
  useEffect(() => {
    fetchThreads();
  }, [fetchThreads, currentThreadId, refreshKey]);

  function formatDate(date: string | Date | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return d.toLocaleDateString([], { weekday: 'short' });
    } else {
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }

  function getThreadTitle(thread: StorageThreadType): string {
    if (thread.title && thread.title.trim()) {
      return thread.title.length > 50 ? thread.title.slice(0, 50) + '...' : thread.title;
    }
    return 'New conversation';
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-r border-zinc-800">
      {/* Header */}
      <div className="px-4 py-4 flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Threads
        </span>
        <Button
          variant="ghost"
          size="sm"
          data-testid="new-thread-button"
          onClick={onNewThread}
          className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        >
          + New
        </Button>
      </div>

      <Separator className="bg-zinc-800 shrink-0" />

      {/* Thread list */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {isLoading && threads.length === 0 && (
            <p className="px-4 py-3 text-xs text-zinc-600">Loading...</p>
          )}

          {!isLoading && error && (
            <div className="px-4 py-3">
              <p className="text-xs text-red-400 mb-2">{error}</p>
              <button
                onClick={fetchThreads}
                className="text-xs text-zinc-400 hover:text-zinc-100 underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !error && threads.length === 0 && (
            <p className="px-4 py-3 text-xs text-zinc-600">No threads yet</p>
          )}

          {threads.map((thread) => {
            const isActive = thread.id === currentThreadId;
            return (
              <button
                key={thread.id}
                data-testid="thread-item"
                onClick={() => onSelectThread(thread.id)}
                className={`w-full text-left px-4 py-2.5 transition-colors ${
                  isActive
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs leading-snug line-clamp-2 flex-1 min-w-0">
                    {getThreadTitle(thread)}
                  </span>
                  <span className="text-[10px] text-zinc-600 shrink-0 mt-0.5">
                    {formatDate(thread.updatedAt)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* User footer */}
      <Separator className="bg-zinc-800 shrink-0" />
      <div className="px-4 py-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-zinc-500 truncate min-w-0">
            {user?.email ?? ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut()}
            className="h-7 px-2 text-xs text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 shrink-0"
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
