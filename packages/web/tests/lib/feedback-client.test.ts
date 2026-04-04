import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitFeedback, deleteFeedback, getFeedbackByThread } from '../../src/lib/feedback-client';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('submitFeedback', () => {
  it('POSTs to /feedback and returns id', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'fb-1' }),
    });

    const result = await submitFeedback(
      { messageId: 'msg-1', threadId: 't-1', rating: 'up' },
      'http://localhost:4111',
      'token-abc',
    );

    expect(result).toEqual({ id: 'fb-1' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:4111/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-abc',
      },
      credentials: 'include',
      body: JSON.stringify({ messageId: 'msg-1', threadId: 't-1', rating: 'up' }),
    });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400 });
    await expect(
      submitFeedback({ messageId: 'm', threadId: 't', rating: 'up' }, 'http://localhost:4111', 'tok'),
    ).rejects.toThrow('Feedback submit failed: 400');
  });
});

describe('deleteFeedback', () => {
  it('sends DELETE to /feedback/:id', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await deleteFeedback('fb-1', 'http://localhost:4111', 'token-abc');

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:4111/feedback/fb-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token-abc' },
      credentials: 'include',
    });
  });
});

describe('getFeedbackByThread', () => {
  it('fetches feedback for a thread', async () => {
    const feedback = [{ id: 'fb-1', messageId: 'msg-1', rating: 'up', comment: null }];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ feedback }),
    });

    const result = await getFeedbackByThread('t-1', 'http://localhost:4111', 'token-abc');
    expect(result).toEqual(feedback);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4111/feedback?threadId=t-1',
      { headers: { Authorization: 'Bearer token-abc' }, credentials: 'include' },
    );
  });
});
