import { describe, it, expect, beforeEach } from 'vitest';
import { FeedbackRepository } from '../../src/feedback/repository.js';

describe('FeedbackRepository', () => {
  let repo: FeedbackRepository;

  beforeEach(async () => {
    repo = new FeedbackRepository(':memory:');
  });

  describe('upsert', () => {
    it('inserts a new feedback row', async () => {
      const result = await repo.upsert({
        id: 'fb-1',
        threadId: 'thread-1',
        messageId: 'msg-1',
        resourceId: 'user-1',
        rating: 'up',
        comment: null,
      });

      expect(result).toEqual({ id: 'fb-1', isNew: true });
    });

    it('replaces rating on duplicate (message_id, resource_id) keeping the original id', async () => {
      await repo.upsert({
        id: 'fb-1',
        threadId: 'thread-1',
        messageId: 'msg-1',
        resourceId: 'user-1',
        rating: 'up',
        comment: null,
      });

      const result = await repo.upsert({
        id: 'fb-2',
        threadId: 'thread-1',
        messageId: 'msg-1',
        resourceId: 'user-1',
        rating: 'down',
        comment: 'Wrong policy',
      });

      // The id is stable across re-ratings so clients can keep using it
      // (e.g. to DELETE after a comment).
      expect(result).toEqual({ id: 'fb-1', isNew: false });

      const rows = await repo.getByThread('thread-1', 'user-1');
      expect(rows).toHaveLength(1);
      expect(rows[0].rating).toBe('down');
      expect(rows[0].comment).toBe('Wrong policy');
      expect(rows[0].id).toBe('fb-1');
    });

    it('preserves created_at when re-rating', async () => {
      await repo.upsert({ id: 'fb-1', threadId: 't1', messageId: 'm1', resourceId: 'u1', rating: 'up', comment: null });
      const before = (await repo.getByThread('t1', 'u1'))[0].createdAt;

      await new Promise(resolve => setTimeout(resolve, 5));
      await repo.upsert({ id: 'fb-9', threadId: 't1', messageId: 'm1', resourceId: 'u1', rating: 'down', comment: 'x' });

      const after = (await repo.getByThread('t1', 'u1'))[0].createdAt;
      expect(after).toBe(before);
    });

    it('clears comment when switching from down to up', async () => {
      await repo.upsert({
        id: 'fb-1',
        threadId: 'thread-1',
        messageId: 'msg-1',
        resourceId: 'user-1',
        rating: 'down',
        comment: 'Bad answer',
      });

      await repo.upsert({
        id: 'fb-2',
        threadId: 'thread-1',
        messageId: 'msg-1',
        resourceId: 'user-1',
        rating: 'up',
        comment: null,
      });

      const rows = await repo.getByThread('thread-1', 'user-1');
      expect(rows[0].comment).toBeNull();
    });
  });

  describe('getByThread', () => {
    it('returns only feedback for the given thread and user', async () => {
      await repo.upsert({ id: 'fb-1', threadId: 't1', messageId: 'm1', resourceId: 'u1', rating: 'up', comment: null });
      await repo.upsert({ id: 'fb-2', threadId: 't1', messageId: 'm2', resourceId: 'u1', rating: 'down', comment: 'Bad' });
      await repo.upsert({ id: 'fb-3', threadId: 't2', messageId: 'm3', resourceId: 'u1', rating: 'up', comment: null });
      await repo.upsert({ id: 'fb-4', threadId: 't1', messageId: 'm1', resourceId: 'u2', rating: 'down', comment: null });

      const rows = await repo.getByThread('t1', 'u1');
      expect(rows).toHaveLength(2);
      expect(rows.map(r => r.messageId).sort()).toEqual(['m1', 'm2']);
    });

    it('returns empty array for unknown thread', async () => {
      const rows = await repo.getByThread('nonexistent', 'u1');
      expect(rows).toEqual([]);
    });
  });

  describe('delete', () => {
    it('deletes a feedback row and returns true', async () => {
      await repo.upsert({ id: 'fb-1', threadId: 't1', messageId: 'm1', resourceId: 'u1', rating: 'up', comment: null });

      const deleted = await repo.delete('fb-1', 'u1');
      expect(deleted).toBe(true);

      const rows = await repo.getByThread('t1', 'u1');
      expect(rows).toEqual([]);
    });

    it('returns false when id does not exist', async () => {
      const deleted = await repo.delete('nonexistent', 'u1');
      expect(deleted).toBe(false);
    });

    it('returns false when resource_id does not match (ownership check)', async () => {
      await repo.upsert({ id: 'fb-1', threadId: 't1', messageId: 'm1', resourceId: 'u1', rating: 'up', comment: null });

      const deleted = await repo.delete('fb-1', 'u2');
      expect(deleted).toBe(false);

      const rows = await repo.getByThread('t1', 'u1');
      expect(rows).toHaveLength(1);
    });
  });
});
