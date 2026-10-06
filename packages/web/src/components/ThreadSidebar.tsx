'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Copy, Download, Ellipsis, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@workos-inc/authkit-nextjs/components';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMastraClientRunner, useMastraReady } from '@/lib/use-mastra-client';
import {
  buildThreadDisplayTitles,
  buildThreadMarkdown,
  deriveThreadTitleFromMessages,
  formatDate,
} from '@/lib/thread-helpers';
import { coalesceThreadMessages } from '@/lib/parse-message';
import { listAllThreadMessages } from '@/lib/thread-messages';
import type { UpdateMemoryThreadParams } from '@mastra/client-js';
import type { Thread } from '@/lib/thread-helpers';

const AGENT_ID = 'nc-medicaid-navigator';

// The agent titles a thread from its first question when it creates it, so
// deriving titles from messages is a legacy path for old threads. Cap how many
// we derive so a sidebar of 50 untitled threads doesn't fan out 50 requests.
const MAX_DERIVED_TITLE_THREADS = 10;

interface ThreadSidebarProps {
  currentThreadId: string;
  resourceId: string;
  refreshKey?: number;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
}

export function ThreadSidebar({ currentThreadId, resourceId, refreshKey, onSelectThread, onNewThread }: ThreadSidebarProps) {
  const { user, signOut } = useAuth();
  // `run` builds a client with a freshly-fetched token per call and retries
  // once on a 401, so thread ops survive the access token expiring mid-session
  // (a render-time client snapshot would 401 with no recovery).
  const { run } = useMastraClientRunner();
  const ready = useMastraReady();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [menuOpenThreadId, setMenuOpenThreadId] = useState<string | null>(null);
  const [deleteThreadId, setDeleteThreadId] = useState<string | null>(null);
  const [derivedTitles, setDerivedTitles] = useState<Record<string, string>>({});
  const editInputRef = useRef<HTMLInputElement>(null);
  const requestedDerivedTitlesRef = useRef<Set<string>>(new Set());

  const fetchThreads = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await run((client) =>
        client.listMemoryThreads({
          resourceId,
          agentId: AGENT_ID,
          orderBy: { field: 'updatedAt', direction: 'DESC' },
          perPage: 50,
        }),
      );
      if (signal?.aborted) return;
      setThreads(result.threads ?? []);
    } catch (err) {
      if (signal?.aborted) return;
      // Silently ignore 401 — token may not be ready yet; will retry when mastraClient updates
      const is401 = err instanceof Error && err.message.includes('401');
      if (is401 && !ready) return;
      console.error('Failed to fetch threads:', err);
      setThreads([]);
      setError('Failed to load threads');
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [resourceId, run, ready]);

  // Fetch threads on mount and when dependencies change; abort stale requests
  useEffect(() => {
    const ac = new AbortController();
    fetchThreads(ac.signal);
    return () => ac.abort();
  }, [fetchThreads, currentThreadId, refreshKey]);

  // Focus the rename input when editing starts
  useEffect(() => {
    if (editingThreadId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingThreadId]);

  useEffect(() => {
    let cancelled = false;

    // Only the most recent untitled threads get a derived title (the list is
    // already sorted by updatedAt DESC); older ones keep the fallback label.
    const untitledThreads = threads
      .filter((thread) => !thread.title || !thread.title.trim())
      .slice(0, MAX_DERIVED_TITLE_THREADS)
      .filter((thread) => !requestedDerivedTitlesRef.current.has(thread.id));

    if (untitledThreads.length === 0) return;

    // Fetch sequentially instead of fanning out one request per thread. An
    // in-flight fetch is never aborted — its result is still applied — the
    // cleanup only stops further fetches from starting.
    void (async () => {
      for (const thread of untitledThreads) {
        requestedDerivedTitlesRef.current.add(thread.id);
        try {
          // The title is the first question, so the ten oldest messages are
          // enough; the default request returns the newest ones instead.
          const result = await run((client) =>
            client.getMemoryThread({ threadId: thread.id, agentId: AGENT_ID }).listMessages({
              page: 0,
              perPage: 10,
              orderBy: { field: 'createdAt', direction: 'ASC' },
            }),
          );

          const derivedTitle = deriveThreadTitleFromMessages(
            (result.messages ?? []) as Array<{ role?: string; content?: unknown }>,
          );

          if (derivedTitle) {
            setDerivedTitles((current) => {
              if (current[thread.id] === derivedTitle) return current;
              return { ...current, [thread.id]: derivedTitle };
            });
          }
        } catch (err) {
          // Let a future pass retry this thread instead of poisoning it forever.
          requestedDerivedTitlesRef.current.delete(thread.id);
          console.error('Failed to derive thread title:', err);
        }
        if (cancelled) return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threads, run]);

  const handleDelete = async (threadId: string) => {
    setError(null);
    try {
      await run((client) => client.getMemoryThread({ threadId, agentId: AGENT_ID }).delete());
      if (threadId === currentThreadId) {
        onNewThread();
      }
      fetchThreads();
    } catch (err) {
      console.error('Failed to delete thread:', err);
      setError('Failed to delete thread');
    }
  };

  const handleRename = async (threadId: string) => {
    if (!editTitle.trim()) {
      setEditingThreadId(null);
      return;
    }
    setError(null);
    try {
      // Send the title alone. The server keeps the stored metadata only when
      // the key is absent, and thread responses omit the framework's part of
      // it, so echoing `metadata` back (even `{}`) would erase memory state.
      // The client's type still lists every field; the server binds the owner.
      const title = { title: editTitle.trim() } as UpdateMemoryThreadParams;
      await run((client) => client.getMemoryThread({ threadId, agentId: AGENT_ID }).update(title));
      setEditingThreadId(null);
      fetchThreads();
    } catch (err) {
      console.error('Failed to rename thread:', err);
      setError('Failed to rename thread');
      setEditingThreadId(null);
    }
  };

  const handleDuplicate = async (threadId: string, sourceTitle: string) => {
    setError(null);
    try {
      // Mastra's clone endpoint copies the thread + all messages server-side.
      // We pass a fresh title so the sidebar shows the copy distinctly.
      const titled = sourceTitle.trim() || 'Untitled';
      await run((client) =>
        client.getMemoryThread({ threadId, agentId: AGENT_ID }).clone({ title: `${titled} (copy)`, resourceId }),
      );
      fetchThreads();
    } catch (err) {
      console.error('Failed to duplicate thread:', err);
      setError('Failed to duplicate thread');
    }
  };

  const handleExport = async (threadId: string, sourceTitle: string) => {
    setError(null);
    try {
      const [meta, msgs] = await run((client) => {
        const thread = client.getMemoryThread({ threadId, agentId: AGENT_ID });
        // Every stored message, or a rejection: a file that silently lacked
        // the start of the conversation would be worse than no file.
        return Promise.all([thread.get(), listAllThreadMessages(thread)]);
      });
      // Export as Markdown — the deliverable for legal-aid users is a
      // readable document for a case file, not a JSON blob. Turns are merged
      // as on screen, so each answer has its sources and verification status.
      const markdown = buildThreadMarkdown({
        title: sourceTitle || meta.title || 'Conversation',
        exportedAt: new Date(),
        messages: coalesceThreadMessages(msgs),
      });
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const slug = (sourceTitle || meta.title || 'thread')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'thread';
      const date = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `thread-${slug}-${date}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Give the browser a tick to start the download before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('Failed to export thread:', err);
      setError('Failed to export thread. No file was saved.');
    }
  };

  const displayTitles = buildThreadDisplayTitles(threads, derivedTitles);

  return (
    <div className="flex flex-col h-full bg-sidebar">
      <div className="px-4 py-4 flex items-center justify-between shrink-0">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Threads
        </span>
        <Button
          variant="ghost"
          size="sm"
          data-testid="new-thread-button"
          onClick={onNewThread}
          className="h-7 gap-1.5 px-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Plus className="size-3.5" />
          New
        </Button>
      </div>

      <Separator className="bg-sidebar-border shrink-0" />

      {/* Thread list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="py-2">
          {isLoading && threads.length === 0 && (
            <div className="space-y-1 py-1" aria-label="Loading threads">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-4 py-2.5">
                  <div
                    className="h-3.5 rounded bg-sidebar-accent animate-pulse"
                    style={{ width: `${65 + (i % 3) * 12}%` }}
                  />
                </div>
              ))}
            </div>
          )}

          {!isLoading && error && (
            <div className="px-4 py-3">
              <p className="text-xs text-destructive mb-2">{error}</p>
              <button
                onClick={() => fetchThreads()}
                className="text-xs text-muted-foreground hover:text-sidebar-foreground underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !error && threads.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted-foreground">No threads yet</p>
          )}

          {threads.map((thread) => {
            const isActive = thread.id === currentThreadId;
            const isEditing = editingThreadId === thread.id;
            const displayTitle = displayTitles.get(thread.id) ?? '';

            return (
              <div
                key={thread.id}
                className={`group border-l-2 px-4 py-2.5 transition-colors ${
                  isActive
                    ? 'border-l-accent bg-sidebar-accent text-sidebar-foreground'
                    : 'border-l-transparent text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  {isEditing ? (
                    <>
                      <input
                        ref={editInputRef}
                        value={editTitle}
                        aria-label={`Rename ${displayTitle}`}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(thread.id);
                          if (e.key === 'Escape') setEditingThreadId(null);
                        }}
                        onBlur={() => handleRename(thread.id)}
                        className="flex-1 min-w-0 text-xs bg-sidebar-accent border border-sidebar-border rounded px-1.5 py-0.5 text-sidebar-foreground outline-none focus:ring-1 focus:ring-ring"
                      />
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground shrink-0 mt-0.5">
                        {formatDate(thread.updatedAt)}
                      </span>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        data-testid="thread-item"
                        onClick={() => onSelectThread(thread.id)}
                        className="flex-1 min-w-0 text-left rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="text-[13px] leading-snug line-clamp-2 block">
                          {displayTitle}
                        </span>
                      </button>
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                          {formatDate(thread.updatedAt)}
                        </span>
                        <DropdownMenu onOpenChange={(open) => setMenuOpenThreadId(open ? thread.id : null)}>
                          <DropdownMenuTrigger
                            aria-label={`Thread actions for ${displayTitle}`}
                            className={`flex p-0.5 rounded transition-colors ${
                              menuOpenThreadId === thread.id
                                ? 'text-sidebar-foreground bg-sidebar-accent'
                                : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent'
                            }`}
                          >
                            <Ellipsis className="w-3.5 h-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" side="bottom">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditTitle(displayTitle);
                                setEditingThreadId(thread.id);
                              }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              data-testid="thread-duplicate"
                              onClick={() => handleDuplicate(thread.id, displayTitle)}
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              data-testid="thread-export"
                              onClick={() => handleExport(thread.id, displayTitle)}
                            >
                              <Download className="w-3.5 h-3.5" />
                              Export
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setDeleteThreadId(thread.id);
                              }}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* User footer */}
      <Separator className="bg-sidebar-border shrink-0" />
      <div className="px-4 py-3 shrink-0 bg-sidebar-accent/40">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-muted-foreground truncate min-w-0">
            {user?.email ?? ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ returnTo: new URL('/', window.location.origin).href })}
            className="h-7 px-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
          >
            Sign out
          </Button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteThreadId} onOpenChange={(open) => !open && setDeleteThreadId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chat? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteThreadId) handleDelete(deleteThreadId);
                setDeleteThreadId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
