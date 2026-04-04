export interface FeedbackEntry {
  id: string;
  messageId: string;
  threadId: string;
  resourceId: string;
  rating: 'up' | 'down';
  comment: string | null;
  createdAt: string;
}

export async function submitFeedback(
  params: { messageId: string; threadId: string; rating: 'up' | 'down'; comment?: string },
  baseUrl: string,
  accessToken: string,
): Promise<{ id: string }> {
  const res = await fetch(`${baseUrl}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: 'include',
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Feedback submit failed: ${res.status}`);
  return res.json();
}

export async function deleteFeedback(
  id: string,
  baseUrl: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${baseUrl}/feedback/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Feedback delete failed: ${res.status}`);
}

export async function getFeedbackByThread(
  threadId: string,
  baseUrl: string,
  accessToken: string,
): Promise<FeedbackEntry[]> {
  const res = await fetch(`${baseUrl}/feedback?threadId=${encodeURIComponent(threadId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Feedback fetch failed: ${res.status}`);
  const data = await res.json();
  return data.feedback;
}
