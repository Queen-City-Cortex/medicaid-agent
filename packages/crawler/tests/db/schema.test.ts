import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/db/schema.js';

describe('State Plan Amendment number migration', () => {
  let tempDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-schema-'));
    db = new Database(path.join(tempDir, 'crawler.db'));
    initializeSchema(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const insert = (
    sourceUrl: string,
    sourceType: string,
    policyNumber: string | null,
  ): number =>
    Number(
      db
        .prepare(`
          INSERT INTO documents (
            source_url, discovered_from, source_type, title, policy_number,
            status, local_path
          ) VALUES (?, 'https://example.com/index', ?, 'Title', ?, 'unchanged', ?)
        `)
        .run(
          sourceUrl,
          sourceType,
          policyNumber,
          `${sourceType}/${path.basename(sourceUrl)}`,
        ).lastInsertRowid,
    );

  const rows = () =>
    db
      .prepare(
        'SELECT id, source_url, policy_number, local_path FROM documents ORDER BY id',
      )
      .all();

  it('rewrites bare amendment numbers to the SPA shape without moving rows', () => {
    const bare = insert('https://example.com/a.pdf', 'state_plan_amendment', '24-0028');
    const prefixed = insert('https://example.com/b.pdf', 'state_plan_amendment', 'NC-24-0031');
    const canonical = insert('https://example.com/c.pdf', 'state_plan_amendment', 'SPA 24-0028');
    const unnumbered = insert('https://example.com/d.pdf', 'state_plan_amendment', null);
    const otherFamily = insert('https://example.com/e.pdf', 'dhhs_policy', '24-0028');

    initializeSchema(db);
    const migrated = rows();
    initializeSchema(db);

    expect(rows()).toEqual(migrated);
    expect(migrated).toEqual([
      { id: bare, source_url: 'https://example.com/a.pdf', policy_number: 'SPA 24-0028', local_path: 'state_plan_amendment/a.pdf' },
      { id: prefixed, source_url: 'https://example.com/b.pdf', policy_number: 'SPA 24-0031', local_path: 'state_plan_amendment/b.pdf' },
      { id: canonical, source_url: 'https://example.com/c.pdf', policy_number: 'SPA 24-0028', local_path: 'state_plan_amendment/c.pdf' },
      { id: unnumbered, source_url: 'https://example.com/d.pdf', policy_number: null, local_path: 'state_plan_amendment/d.pdf' },
      { id: otherFamily, source_url: 'https://example.com/e.pdf', policy_number: '24-0028', local_path: 'dhhs_policy/e.pdf' },
    ]);
    expect(
      db
        .prepare(`
          SELECT COUNT(*) AS count FROM documents
          WHERE source_type = 'state_plan_amendment'
            AND policy_number GLOB '[0-9][0-9]-[0-9][0-9][0-9][0-9]'
        `)
        .get(),
    ).toEqual({ count: 0 });
  });
});

describe('failure column migration', () => {
  it('adds the failure columns to a registry created before them, without rebuilding rows', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-schema-'));
    const db = new Database(path.join(tempDir, 'crawler.db'));
    try {
      initializeSchema(db);
      db.exec('ALTER TABLE documents DROP COLUMN last_failure_at');
      db.exec('ALTER TABLE documents DROP COLUMN last_failure_kind');
      db.prepare(`
        INSERT INTO documents (source_url, discovered_from, source_type, status, local_path, file_hash)
        VALUES ('https://example.com/a.pdf', 'https://example.com/index', 'clinical_policy', 'unchanged', 'clinical_policy/a.pdf', 'abc')
      `).run();

      initializeSchema(db);

      expect(db.prepare('SELECT * FROM documents').all()).toEqual([
        expect.objectContaining({
          source_url: 'https://example.com/a.pdf', status: 'unchanged', file_hash: 'abc',
          last_failure_at: null, last_failure_kind: null,
        }),
      ]);
    } finally {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
