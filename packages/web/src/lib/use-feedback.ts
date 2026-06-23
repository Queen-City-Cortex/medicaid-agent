'use client';

import { useCallback, useState } from 'react';
import { getFeedbackByThread, submitFeedback, deleteFeedback } from '@/lib/feedback-client';
import { MASTRA_URL } from '@/lib/mastra-url';

/** Per-message feedback as rendered in the UI. */
export interface MessageFeedback {
  id: string;
  rating: 'up' | 'down';
  comment: string | null;
}

function removeFeedbackEntry(
  entries: Record<string, MessageFeedback>,
  messageId: string,
) {
  const nextEntries = { ...entries };
  delete nextEntries[messageId];
  return nextEntries;
}

export interface UseFeedbackOptions {
  /** Returns the current WorkOS access token; feedback writes require it. */
  getAccessToken: () => Promise<string | null | undefined>;
}

/**
 * Owns per-message feedback (thumbs + comments) with optimistic updates.
 *
 * Contract:
 * - Every mutation applies optimistically, then reconciles with the server's
 *   id on success. On any failure — including a missing access token — the
 *   optimistic change is reverted: a previous entry is restored, a brand-new
 *   one is removed.
 * - `handleRate`/`handleComment` take the thread id at call time so the hook
 *   has no dependency on which thread is active.
 * - `loadFeedback` never throws (it logs); callers check `isActive` is still
 *   true after its awaits so stale responses are dropped.
 * - `resetFeedback` clears the map; call it on thread switch.
 */
export function useFeedback({ getAccessToken }: UseFeedbackOptions) {
  const [feedbackMap, setFeedbackMap] = useState<Record<string, MessageFeedback>>({});

  const resetFeedback = useCallback(() => setFeedbackMap({}), []);

  const loadFeedback = useCallback(async (threadId: string, isActive: () => boolean) => {
    try {
      const token = await getAccessToken();
      if (token) {
        const entries = await getFeedbackByThread(threadId, MASTRA_URL, token);
        // The user may have switched threads while this request was in
        // flight — a stale response must not overwrite the newer thread's map.
        if (!isActive()) return;
        const map: Record<string, MessageFeedback> = {};
        for (const entry of entries) {
          map[entry.messageId] = { id: entry.id, rating: entry.rating, comment: entry.comment };
        }
        setFeedbackMap(map);
      }
    } catch (err) {
      console.error('Failed to load feedback:', err);
    }
  }, [getAccessToken]);

  const handleRate = useCallback(async (threadId: string, messageId: string, rating: 'up' | 'down') => {
    const prev = feedbackMap[messageId];
    const optimistic = { id: prev?.id ?? messageId, rating, comment: null };
    setFeedbackMap(m => ({ ...m, [messageId]: optimistic }));

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const result = await submitFeedback({ messageId, threadId, rating }, MASTRA_URL, token);
      setFeedbackMap(m => ({ ...m, [messageId]: { ...m[messageId], id: result.id } }));
    } catch {
      if (prev) setFeedbackMap(m => ({ ...m, [messageId]: prev }));
      else setFeedbackMap(m => removeFeedbackEntry(m, messageId));
    }
  }, [feedbackMap, getAccessToken]);

  const handleClearRating = useCallback(async (messageId: string) => {
    const prev = feedbackMap[messageId];
    if (!prev) return;
    setFeedbackMap(m => removeFeedbackEntry(m, messageId));

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      await deleteFeedback(prev.id, MASTRA_URL, token);
    } catch {
      setFeedbackMap(m => ({ ...m, [messageId]: prev }));
    }
  }, [feedbackMap, getAccessToken]);

  const handleComment = useCallback(async (threadId: string, messageId: string, comment: string) => {
    const prev = feedbackMap[messageId];
    if (!prev) return;
    setFeedbackMap(m => ({ ...m, [messageId]: { ...m[messageId], comment } }));

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const result = await submitFeedback(
        { messageId, threadId, rating: prev.rating, comment },
        MASTRA_URL,
        token,
      );
      setFeedbackMap(m => ({ ...m, [messageId]: { ...m[messageId], id: result.id } }));
    } catch {
      setFeedbackMap(m => ({ ...m, [messageId]: prev }));
    }
  }, [feedbackMap, getAccessToken]);

  return {
    feedbackMap,
    loadFeedback,
    resetFeedback,
    handleRate,
    handleClearRating,
    handleComment,
  };
}
