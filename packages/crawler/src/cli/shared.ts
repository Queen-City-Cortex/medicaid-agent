// Shared helpers for the crawler CLI commands. The CLI is split by command
// across this directory; each command module registers itself onto the shared
// `Command` program in `../index.ts`. Helpers that more than one command needs
// (DB bootstrap, source-type parsing, fetcher construction) live here.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { MANIFEST_SOURCE_TYPES } from '../corpus-manifest.js';
import { initializeSchema } from '../db/schema.js';
import { createRegistry } from '../db/registry.js';
import { createFetcher } from '../crawl/fetcher.js';
import type { SourceType } from '../sources/types.js';

export const VALID_SOURCE_TYPES: SourceType[] = [...MANIFEST_SOURCE_TYPES];

export type Registry = ReturnType<typeof createRegistry> & { close: () => void };

/** Open the registry DB (creating its directory and schema if needed). */
export function initDb(): Registry {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const db = new Database(config.dbPath);
  initializeSchema(db);
  const registry = createRegistry(db);
  return { ...registry, close: () => db.close() };
}

/**
 * Parse a comma-separated `--source` option into validated source types,
 * defaulting to every known type. Exits the process on an invalid type.
 */
export function parseSourceTypes(source?: string): SourceType[] {
  if (!source) return VALID_SOURCE_TYPES;
  const types = source.split(',').map((s) => s.trim()) as SourceType[];
  for (const t of types) {
    if (!VALID_SOURCE_TYPES.includes(t)) {
      console.error(`Invalid source type: ${t}`);
      console.error(`Valid types: ${VALID_SOURCE_TYPES.join(', ')}`);
      process.exit(1);
    }
  }
  return types;
}

/** Build a rate-limited fetcher from the shared crawler config. */
export function buildFetcher(): ReturnType<typeof createFetcher> {
  return createFetcher({
    userAgent: config.userAgent,
    defaultDelayMs: config.defaultDelayMs,
    requestTimeoutMs: config.requestTimeoutMs,
    maxRetries: config.maxRetries,
    backoffBaseMs: config.backoffBaseMs,
    backoffMaxMs: config.backoffMaxMs,
    maxRedirects: config.maxRedirects,
  });
}
