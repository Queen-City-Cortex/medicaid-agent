'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@workos-inc/authkit-nextjs/components';
import { signOut } from '@workos-inc/authkit-nextjs';
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
import { mastraClient } from '@/lib/mastra-client';
import { formatDate, getThreadTitle } from '@/lib/thread-helpers';
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
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [menuOpenThreadId, setMenuOpenThreadId] = useState<string | null>(null);
  const [deleteThreadId, setDeleteThreadId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

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

  // Focus the rename input when editing starts
  useEffect(() => {
    if (editingThreadId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingThreadId]);

  const handleDelete = async (threadId: string) => {
    try {
      const thread = mastraClient.getMemoryThread({ threadId, agentId: AGENT_ID });
      await thread.delete();
      if (threadId === currentThreadId) {
        onNewThread();
      }
      fetchThreads();
    } catch (err) {
      console.error('Failed to delete thread:', err);
    }
  };

  const handleRename = async (threadId: string) => {
    if (!editTitle.trim()) {
      setEditingThreadId(null);
      return;
    }
    try {
      const thread = mastraClient.getMemoryThread({ threadId, agentId: AGENT_ID });
      await thread.update({ title: editTitle.trim(), metadata: {}, resourceId });
      setEditingThreadId(null);
      fetchThreads();
    } catch (err) {
      console.error('Failed to rename thread:', err);
      setEditingThreadId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      <div className="px-4 py-4 flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/50">
          Threads
        </span>
        <Button
          variant="ghost"
          size="sm"
          data-testid="new-thread-button"
          onClick={onNewThread}
          className="h-7 px-2 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          + New
        </Button>
      </div>

      <Separator className="bg-sidebar-accent shrink-0" />

      {/* Thread list */}
      <ScrollArea className="flex-1">
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
              <p className="text-xs text-red-400 mb-2">{error}</p>
              <button
                onClick={fetchThreads}
                className="text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !error && threads.length === 0 && (
            <p className="px-4 py-3 text-xs text-sidebar-foreground/40">No threads yet</p>
          )}

          {threads.map((thread) => {
            const isActive = thread.id === currentThreadId;
            const isEditing = editingThreadId === thread.id;

            return (
              <div
                key={thread.id}
                data-testid="thread-item"
                className={`group w-full text-left px-4 py-2.5 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/90'
                }`}
                onClick={() => !isEditing && onSelectThread(thread.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  {isEditing ? (
                    <input
                      ref={editInputRef}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(thread.id);
                        if (e.key === 'Escape') setEditingThreadId(null);
                      }}
                      onBlur={() => handleRename(thread.id)}
                      className="flex-1 min-w-0 text-xs bg-sidebar-accent border border-sidebar-border rounded px-1.5 py-0.5 text-sidebar-foreground outline-none focus:ring-1 focus:ring-ring"
                    />
                  ) : (
                    <>
                      <span className="text-xs leading-snug line-clamp-2 flex-1 min-w-0">
                        {getThreadTitle(thread)}
                      </span>
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        <span className={`text-[10px] text-sidebar-foreground/40 ${menuOpenThreadId === thread.id ? 'hidden' : 'group-hover:hidden'}`}>
                          {formatDate(thread.updatedAt)}
                        </span>
                        <DropdownMenu onOpenChange={(open) => setMenuOpenThreadId(open ? thread.id : null)}>
                          <DropdownMenuTrigger
                            className={`${menuOpenThreadId === thread.id ? 'flex' : 'hidden group-hover:flex'} p-0.5 rounded text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Ellipsis className="w-3.5 h-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" side="bottom">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditTitle(thread.title || 'New conversation');
                                setEditingThreadId(thread.id);
                              }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
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
      <div className="px-4 py-3 shrink-0 bg-sidebar-accent/50">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-sidebar-foreground/50 truncate min-w-0">
            {user?.email ?? ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut()}
            className="h-7 px-2 text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
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
