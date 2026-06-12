import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';
import { useAnswerVersions } from '@/lib/use-answer-versions';

function makeMessage(id: string, role: 'user' | 'assistant', text: string): UIMessage {
  return { id, role, parts: [{ type: 'text', text }] };
}

describe('useAnswerVersions', () => {
  it('archives the live answer on rerun and regenerates it in place', () => {
    const { result } = renderHook(() => useAnswerVersions());
    const regenerate = vi.fn();
    const messages = [makeMessage('u1', 'user', 'q'), makeMessage('a1', 'assistant', 'v1')];

    act(() => {
      result.current.handleRerun({ messages, regenerate, messageIndex: 1, userIndex: 0 });
    });

    // Archived under the USER msg id so the history survives regenerate()
    // swapping the live assistant's id.
    expect(result.current.archivedVersions).toEqual({ u1: [messages[1]] });
    expect(regenerate).toHaveBeenCalledWith({ messageId: 'a1' });
  });

  it('stacks archived versions oldest-first across successive reruns', () => {
    const { result } = renderHook(() => useAnswerVersions());
    const regenerate = vi.fn();
    const userMsg = makeMessage('u1', 'user', 'q');
    const answerV1 = makeMessage('a1', 'assistant', 'v1');
    const answerV2 = makeMessage('a2', 'assistant', 'v2');

    act(() => {
      result.current.handleRerun({ messages: [userMsg, answerV1], regenerate, messageIndex: 1, userIndex: 0 });
    });
    act(() => {
      result.current.handleRerun({ messages: [userMsg, answerV2], regenerate, messageIndex: 1, userIndex: 0 });
    });

    expect(result.current.archivedVersions['u1']).toEqual([answerV1, answerV2]);
  });

  it('jumps activeVersion back to the live answer on rerun', () => {
    const { result } = renderHook(() => useAnswerVersions());
    const regenerate = vi.fn();
    const messages = [makeMessage('u1', 'user', 'q'), makeMessage('a1', 'assistant', 'v1')];

    act(() => {
      result.current.selectVersion('u1', 1);
    });
    expect(result.current.activeVersion).toEqual({ u1: 1 });

    act(() => {
      result.current.handleRerun({ messages, regenerate, messageIndex: 1, userIndex: 0 });
    });

    // Absent key means "show live" — the rerun must follow the new response.
    expect(result.current.activeVersion).toEqual({});
  });

  it('ignores reruns with invalid indexes or mismatched roles', () => {
    const { result } = renderHook(() => useAnswerVersions());
    const regenerate = vi.fn();
    const messages = [makeMessage('u1', 'user', 'q'), makeMessage('a1', 'assistant', 'v1')];

    act(() => {
      // Roles swapped.
      result.current.handleRerun({ messages, regenerate, messageIndex: 0, userIndex: 1 });
      // Out of range.
      result.current.handleRerun({ messages, regenerate, messageIndex: 5, userIndex: 0 });
    });

    expect(result.current.archivedVersions).toEqual({});
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('resetVersions clears history and selection (thread switch)', () => {
    const { result } = renderHook(() => useAnswerVersions());
    const regenerate = vi.fn();
    const messages = [makeMessage('u1', 'user', 'q'), makeMessage('a1', 'assistant', 'v1')];

    act(() => {
      result.current.handleRerun({ messages, regenerate, messageIndex: 1, userIndex: 0 });
      result.current.selectVersion('u1', 1);
    });
    expect(result.current.archivedVersions['u1']).toHaveLength(1);

    act(() => {
      result.current.resetVersions();
    });

    expect(result.current.archivedVersions).toEqual({});
    expect(result.current.activeVersion).toEqual({});
  });
});
