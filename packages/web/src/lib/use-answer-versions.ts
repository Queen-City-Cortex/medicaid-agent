'use client';

import { useCallback, useState } from 'react';
import type { UIMessage } from 'ai';

export interface RerunArgs {
  /** Current useChat messages — indexes below refer to this array. */
  messages: UIMessage[];
  /** useChat's regenerate, called after the current answer is archived. */
  regenerate: (options?: { messageId?: string }) => void;
  /** Index of the assistant message being re-run. */
  messageIndex: number;
  /** Index of the user message it answers. */
  userIndex: number;
}

/**
 * Owns the client-side answer version history shown by the VersionNav pager.
 *
 * Contract:
 * - Historical assistant messages are archived by the user msg they answer.
 *   The "live" version lives in useChat's `messages`; anything archived here
 *   is an earlier attempt preserved client-side so the user can flip between
 *   answers. Keyed by user msg id so it survives regenerate() swapping the
 *   live assistant's id.
 * - `activeVersion` is 1-based per user msg id: N = live, 1..N-1 = archived.
 *   An absent key means "show live" (the default).
 * - Nothing is persisted — call `resetVersions` whenever the thread changes.
 */
export function useAnswerVersions() {
  // Historical assistant messages archived by the user msg they answer. The
  // "live" version lives in `messages` (useChat); anything in this map is an
  // earlier attempt preserved client-side so the user can flip between
  // answers via the VersionNav pager. Keyed by user msg id so it survives
  // regenerate() swapping the live assistant's id. Not persisted — cleared
  // when the thread changes.
  const [archivedVersions, setArchivedVersions] = useState<Record<string, UIMessage[]>>({});
  // 1-based active version per user msg id. N = live, 1..N-1 = archived.
  // Absent key means "show live" (the default).
  const [activeVersion, setActiveVersion] = useState<Record<string, number>>({});

  const resetVersions = useCallback(() => {
    setArchivedVersions({});
    setActiveVersion({});
  }, []);

  const selectVersion = useCallback((userMsgId: string, version: number) => {
    setActiveVersion(prev => {
      const next = { ...prev };
      next[userMsgId] = version;
      return next;
    });
  }, []);

  /** Archive the live answer, then regenerate it in place. */
  const handleRerun = useCallback(({ messages, regenerate, messageIndex, userIndex }: RerunArgs) => {
    const assistantMsg = messages[messageIndex];
    const userMsg = messages[userIndex];
    if (!assistantMsg || !userMsg || assistantMsg.role !== 'assistant' || userMsg.role !== 'user') return;

    // Snapshot the current (live) answer so the user can navigate back to it
    // after the regenerate replaces it in place. Archived versions stack up
    // in the order they were replaced, oldest first.
    setArchivedVersions(prev => {
      const existing = prev[userMsg.id] ?? [];
      return { ...prev, [userMsg.id]: [...existing, assistantMsg] };
    });
    // Jump activeVersion to the new live answer so the UI follows the user's
    // expectation that "re-run" shows the new response.
    setActiveVersion(prev => {
      const next = { ...prev };
      delete next[userMsg.id];
      return next;
    });

    regenerate({ messageId: assistantMsg.id });
  }, []);

  return {
    archivedVersions,
    activeVersion,
    resetVersions,
    selectVersion,
    handleRerun,
  };
}
