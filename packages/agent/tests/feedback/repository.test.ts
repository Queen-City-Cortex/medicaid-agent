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


  describe('pruneOrphans', () => {
    const clientOf = (r: FeedbackRepository) =>
      (r as unknown as { client: { execute: (q: string | { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> } }).client;

    it('deletes feedback whose thread no longer exists in mastra_threads', async () => {
      const client = clientOf(repo);
      await client.execute('CREATE TABLE mastra_threads (id TEXT NOT NULL PRIMARY KEY)');
      await client.execute({ sql: 'INSERT INTO mastra_threads (id) VALUES (?)', args: ['t-alive'] });

      await repo.upsert({ id: 'fb-1', threadId: 't-alive', messageId: 'm1', resourceId: 'u1', rating: 'up', comment: null });
      await repo.upsert({ id: 'fb-2', threadId: 't-deleted', messageId: 'm2', resourceId: 'u1', rating: 'down', comment: 'sensitive note' });

      // upsert() also fires the prune opportunistically, so the orphan may
      // already be gone by now — assert the end state, not the return count.
      await repo.pruneOrphans();
      expect(await repo.getByThread('t-alive', 'u1')).toHaveLength(1);
      expect(await repo.getByThread('t-deleted', 'u1')).toHaveLength(0);
    });

    it('returns 0 (not throw) when mastra_threads does not exist yet', async () => {
      await repo.upsert({ id: 'fb-1', threadId: 't1', messageId: 'm1', resourceId: 'u1', rating: 'up', comment: null });
      expect(await repo.pruneOrphans()).toBe(0);
      expect(await repo.getByThread('t1', 'u1')).toHaveLength(1);
    });
  });

  describe('probeWritable', () => {
    it('returns true when the store accepts writes', async () => {
      expect(await repo.probeWritable()).toBe(true);
    });

    it('returns false (not throw) when a write fails like a read-only volume', async () => {
      // Reproduce the production failure mode: the connection opens, but the
      // write throws SQLITE_READONLY. probeWritable must swallow it and return
      // false so /healthz reports degraded (503) instead of crashing.
      const writable = new FeedbackRepository(':memory:');
      (writable as unknown as { client: { execute: () => Promise<unknown> } }).client = {
        execute: async () => {
          const err = new Error('attempt to write a readonly database') as Error & { code: string };
          err.code = 'SQLITE_READONLY';
          throw err;
        },
      };
      expect(await writable.probeWritable()).toBe(false);
    });
  });
});
