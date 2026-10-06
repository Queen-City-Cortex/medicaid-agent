import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFeedback } from '@/lib/use-feedback';
import { submitFeedback, deleteFeedback, getFeedbackByThread } from '@/lib/feedback-client';

vi.mock('@/lib/feedback-client', () => ({
  submitFeedback: vi.fn(),
  deleteFeedback: vi.fn(),
  getFeedbackByThread: vi.fn(),
}));

const submitFeedbackMock = vi.mocked(submitFeedback);
const deleteFeedbackMock = vi.mocked(deleteFeedback);
const getFeedbackByThreadMock = vi.mocked(getFeedbackByThread);

function setup(token: string | null = 'token') {
  const getAccessToken = vi.fn(async () => token);
  const utils = renderHook(() => useFeedback({ getAccessToken }));
  return { ...utils, getAccessToken };
}

async function rateSuccessfully(
  result: ReturnType<typeof setup>['result'],
  serverId = 'fb-1',
) {
  submitFeedbackMock.mockResolvedValueOnce({ id: serverId });
  await act(async () => {
    await result.current.handleRate('t1', 'm1', 'up');
  });
}

describe('useFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('handleRate', () => {
    it('applies an optimistic entry immediately, then reconciles the server id', async () => {
      const { result } = setup();
      submitFeedbackMock.mockResolvedValueOnce({ id: 'fb-1' });

      let pending!: Promise<void>;
      act(() => {
        pending = result.current.handleRate('t1', 'm1', 'up');
      });
      // Optimistic: visible before the request settles, keyed by message id.
      expect(result.current.feedbackMap['m1']).toEqual({ id: 'm1', rating: 'up', comment: null });

      await act(async () => {
        await pending;
      });
      expect(result.current.feedbackMap['m1']).toEqual({ id: 'fb-1', rating: 'up', comment: null });
      expect(submitFeedbackMock).toHaveBeenCalledWith(
        { messageId: 'm1', threadId: 't1', rating: 'up' },
        expect.any(String),
        'token',
      );
    });

    it('removes a brand-new optimistic entry when the request fails', async () => {
      const { result } = setup();
      submitFeedbackMock.mockRejectedValueOnce(new Error('boom'));

      await act(async () => {
        await result.current.handleRate('t1', 'm1', 'down');
      });

      expect(result.current.feedbackMap['m1']).toBeUndefined();
    });

    it('restores the previous entry when re-rating fails', async () => {
      const { result } = setup();
      await rateSuccessfully(result);

      submitFeedbackMock.mockRejectedValueOnce(new Error('boom'));
      await act(async () => {
        await result.current.handleRate('t1', 'm1', 'down');
      });

      expect(result.current.feedbackMap['m1']).toEqual({ id: 'fb-1', rating: 'up', comment: null });
    });

    it('reverts without calling the API when there is no access token', async () => {
      const { result } = setup(null);

      await act(async () => {
        await result.current.handleRate('t1', 'm1', 'up');
      });

      expect(submitFeedbackMock).not.toHaveBeenCalled();
      expect(result.current.feedbackMap['m1']).toBeUndefined();
    });
  });

  describe('handleClearRating', () => {
    it('removes the entry optimistically and keeps it removed on success', async () => {
      const { result } = setup();
      await rateSuccessfully(result);
      deleteFeedbackMock.mockResolvedValueOnce(undefined);

      let pending!: Promise<void>;
      act(() => {
        pending = result.current.handleClearRating('m1');
      });
      expect(result.current.feedbackMap['m1']).toBeUndefined();

      await act(async () => {
        await pending;
      });
      expect(result.current.feedbackMap['m1']).toBeUndefined();
      expect(deleteFeedbackMock).toHaveBeenCalledWith('fb-1', expect.any(String), 'token');
    });

    it('restores the entry when the delete fails', async () => {
      const { result } = setup();
      await rateSuccessfully(result);
      deleteFeedbackMock.mockRejectedValueOnce(new Error('boom'));

      await act(async () => {
        await result.current.handleClearRating('m1');
      });

      expect(result.current.feedbackMap['m1']).toEqual({ id: 'fb-1', rating: 'up', comment: null });
    });

    it('is a no-op when the message has no feedback', async () => {
      const { result } = setup();

      await act(async () => {
        await result.current.handleClearRating('m1');
      });

      expect(deleteFeedbackMock).not.toHaveBeenCalled();
    });
  });

  describe('handleComment', () => {
    it('applies the comment optimistically and reconciles the server id', async () => {
      const { result } = setup();
      await rateSuccessfully(result);
      submitFeedbackMock.mockResolvedValueOnce({ id: 'fb-2' });

      let pending!: Promise<void>;
      act(() => {
        pending = result.current.handleComment('t1', 'm1', 'too vague');
      });
      expect(result.current.feedbackMap['m1']).toEqual({ id: 'fb-1', rating: 'up', comment: 'too vague' });

      await act(async () => {
        await pending;
      });
      expect(result.current.feedbackMap['m1']).toEqual({ id: 'fb-2', rating: 'up', comment: 'too vague' });
      expect(submitFeedbackMock).toHaveBeenLastCalledWith(
        { messageId: 'm1', threadId: 't1', rating: 'up', comment: 'too vague' },
        expect.any(String),
        'token',
      );
    });

    it('reverts the comment when the request fails (including no token)', async () => {
      const { result, getAccessToken } = setup();
      await rateSuccessfully(result);

      getAccessToken.mockResolvedValueOnce(null);
      await act(async () => {
        await result.current.handleComment('t1', 'm1', 'too vague');
      });

      expect(result.current.feedbackMap['m1']).toEqual({ id: 'fb-1', rating: 'up', comment: null });
    });

    it('keeps the server message when a comment is refused for a client identifier, until the next attempt', async () => {
      const { result } = setup();
      await rateSuccessfully(result);
      const message = 'Remove client-identifying information before sending this comment.';
      submitFeedbackMock.mockRejectedValueOnce(new Error(
        `Feedback submit failed: 422 ${JSON.stringify({ error: { code: 'client_identifier_detected', message } })}`,
      ));
      await act(async () => {
        await result.current.handleComment('t1', 'm1', 'call 919-555-0142');
      });
      expect(result.current.feedbackMap['m1']).toEqual({ id: 'fb-1', rating: 'up', comment: null, commentError: message });

      // Any other failure reverts without a message, and clears the old one.
      submitFeedbackMock.mockRejectedValueOnce(new Error('Feedback submit failed: 500'));
      await act(async () => {
        await result.current.handleComment('t1', 'm1', 'too vague');
      });
      expect(result.current.feedbackMap['m1']).toStrictEqual({ id: 'fb-1', rating: 'up', comment: null, commentError: undefined });
    });

    it('is a no-op without an existing rating', async () => {
      const { result } = setup();

      await act(async () => {
        await result.current.handleComment('t1', 'm1', 'orphan comment');
      });

      expect(submitFeedbackMock).not.toHaveBeenCalled();
      expect(result.current.feedbackMap['m1']).toBeUndefined();
    });
  });

  describe('loadFeedback', () => {
    const entries = [
      {
        id: 'fb-9',
        messageId: 'm9',
        threadId: 't9',
        resourceId: 'u1',
        rating: 'down' as const,
        comment: 'wrong policy',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    it('populates the map keyed by message id while the thread is still active', async () => {
      const { result } = setup();
      getFeedbackByThreadMock.mockResolvedValueOnce(entries);

      await act(async () => {
        await result.current.loadFeedback('t9', () => true);
      });

      expect(result.current.feedbackMap).toEqual({
        m9: { id: 'fb-9', rating: 'down', comment: 'wrong policy' },
      });
    });

    it('drops a stale response when the thread is no longer active', async () => {
      const { result } = setup();
      getFeedbackByThreadMock.mockResolvedValueOnce(entries);

      await act(async () => {
        await result.current.loadFeedback('t9', () => false);
      });

      expect(result.current.feedbackMap).toEqual({});
    });

    it('skips the fetch entirely without a token', async () => {
      const { result } = setup(null);

      await act(async () => {
        await result.current.loadFeedback('t9', () => true);
      });

      expect(getFeedbackByThreadMock).not.toHaveBeenCalled();
    });

    it('never throws on fetch failure', async () => {
      const { result } = setup();
      getFeedbackByThreadMock.mockRejectedValueOnce(new Error('boom'));

      await expect(
        act(async () => {
          await result.current.loadFeedback('t9', () => true);
        }),
      ).resolves.not.toThrow();
      expect(result.current.feedbackMap).toEqual({});
    });
  });

  it('resetFeedback clears the map (thread switch)', async () => {
    const { result } = setup();
    await rateSuccessfully(result);
    expect(result.current.feedbackMap['m1']).toBeDefined();

    act(() => {
      result.current.resetFeedback();
    });

    expect(result.current.feedbackMap).toEqual({});
  });
});
