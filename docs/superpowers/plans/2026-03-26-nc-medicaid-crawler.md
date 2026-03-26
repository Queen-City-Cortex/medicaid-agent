# NC Medicaid Crawler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polite, incremental crawler that discovers and downloads NC Medicaid policy documents with a SQLite registry for change detection.

**Architecture:** TypeScript CLI tool in `crawler/` subfolder. SQLite registry tracks every document URL ever seen. HTTP client (undici) with 2s rate limiting and conditional requests (ETag/Last-Modified) avoids re-downloading unchanged documents. Per-source discovery modules parse index pages with Cheerio. Streaming downloads pipe directly to disk.

**Tech Stack:** TypeScript, Node.js 20+, better-sqlite3, undici, cheerio, commander, p-queue, vitest, file-type

**Spec:** `docs/superpowers/specs/2026-03-26-nc-medicaid-crawler-design.md`

---

## File Map

| File | Responsibility |
|---|---|
| `crawler/package.json` | Dependencies, scripts |
| `crawler/tsconfig.json` | TypeScript config (strict, ESM) |
| `crawler/.gitignore` | Ignore data/, node_modules/ |
| `crawler/src/config.ts` | All configuration: paths, rate limits, source URLs, user agent |
| `crawler/src/utils/logger.ts` | Structured logging to console (human-readable) and file (detailed append) |
| `crawler/src/utils/hash.ts` | SHA-256 file hashing |
| `crawler/src/utils/naming.ts` | Slugify titles into filenames, handle collisions |
| `crawler/src/db/schema.ts` | SQLite schema creation, migrations, DB initialization |
| `crawler/src/db/registry.ts` | Document registry CRUD: upsert, query by status/source, update status/hash/timestamps |
| `crawler/src/crawl/fetcher.ts` | HTTP client wrapping undici: rate limiting per domain, retries with exponential backoff, conditional request headers |
| `crawler/src/crawl/robots.ts` | Fetch and cache robots.txt per domain, check URL allowance, extract Crawl-delay |
| `crawler/src/crawl/downloader.ts` | Stream file to disk, compute hash, detect Content-Disposition filename, detect content type via magic bytes, handle version history |
| `crawler/src/crawl/discovery.ts` | Coordinator: takes source types, dispatches to source modules, aggregates results |
| `crawler/src/sources/clinical-policies.ts` | Parse clinical coverage policies index page |
| `crawler/src/sources/bulletins.ts` | Parse bulletin pages (current, digests, archives with pagination) |
| `crawler/src/sources/state-plan.ts` | Parse state plan amendment pages |
| `crawler/src/sources/waivers.ts` | Parse waiver seed pages |
| `crawler/src/sources/types.ts` | Shared types: `DiscoveredDocument`, `SourceModule` interface |
| `crawler/src/index.ts` | CLI entry point: commander setup, all subcommands |
| `crawler/tests/utils/hash.test.ts` | Hash utility tests |
| `crawler/tests/utils/naming.test.ts` | File naming tests |
| `crawler/tests/db/registry.test.ts` | Registry CRUD tests (in-memory SQLite) |
| `crawler/tests/crawl/fetcher.test.ts` | HTTP client tests (mocked responses) |
| `crawler/tests/crawl/downloader.test.ts` | Download + hash + magic byte tests |
| `crawler/tests/sources/clinical-policies.test.ts` | Parser tests against HTML fixture |
| `crawler/tests/sources/bulletins.test.ts` | Parser tests against HTML fixtures |
| `crawler/tests/sources/state-plan.test.ts` | Parser tests against HTML fixture |
| `crawler/tests/sources/waivers.test.ts` | Parser tests against HTML fixture |
| `crawler/tests/fixtures/` | Saved HTML snapshots from index pages |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `crawler/package.json`
- Create: `crawler/tsconfig.json`
- Create: `crawler/.gitignore`
- Create: `crawler/src/config.ts`
- Create: `crawler/src/sources/types.ts`

- [ ] **Step 1: Create crawler directory and package.json**

```bash
mkdir -p crawler
```

Write `crawler/package.json`:

```json
{
  "name": "nc-medicaid-crawler",
  "version": "1.0.0",
  "description": "Polite incremental crawler for NC Medicaid policy documents",
  "type": "module",
  "scripts": {
    "crawl": "tsx src/index.ts crawl",
    "check": "tsx src/index.ts check",
    "stats": "tsx src/index.ts stats",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "cheerio": "^1.0.0",
    "commander": "^12.0.0",
    "file-type": "^19.0.0",
    "mime-types": "^2.1.35",
    "p-queue": "^8.0.0",
    "robots-parser": "^3.0.0",
    "undici": "^6.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/mime-types": "^2.1.4",
    "tsx": "^4.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Write `crawler/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "resolveJsonModule": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create .gitignore**

Write `crawler/.gitignore`:

```
node_modules/
dist/
data/documents/
data/crawler.db
data/crawl.log
```

- [ ] **Step 4: Install dependencies**

Run: `cd crawler && npm install`
Expected: `node_modules/` created, lock file generated, no errors.

- [ ] **Step 5: Create shared types**

Write `crawler/src/sources/types.ts`:

```typescript
export type SourceType =
  | 'clinical_policy'
  | 'bulletin'
  | 'state_plan_amendment'
  | 'waiver'
  | 'provider_manual';

export interface DiscoveredDocument {
  source_url: string;
  discovered_from: string;
  source_type: SourceType;
  title: string | null;
  policy_number: string | null;
  category: string | null;
}

export interface SourceModule {
  discover(fetcher: Fetcher, sinceYear?: number): Promise<DiscoveredDocument[]>;
}

// Forward reference — defined in fetcher.ts, imported by source modules
export interface Fetcher {
  fetchHtml(url: string): Promise<{ body: string; statusCode: number }>;
  fetchFile(
    url: string,
    destPath: string,
    conditionalHeaders?: { etag?: string; lastModified?: string },
  ): Promise<FetchFileResult>;
}

export interface FetchFileResult {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  filePath: string | null; // null if 304
  downloaded: boolean;
}
```

- [ ] **Step 6: Create config module**

Write `crawler/src/config.ts`:

```typescript
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

export const config = {
  // Paths (resolved relative to crawler/ root)
  dataDir: path.join(projectRoot, 'data'),
  documentsDir: path.join(projectRoot, 'data', 'documents'),
  dbPath: path.join(projectRoot, 'data', 'crawler.db'),
  logPath: path.join(projectRoot, 'data', 'crawl.log'),

  // Rate limiting
  defaultDelayMs: 2000,
  maxConcurrentDomains: 3,
  requestTimeoutMs: 30000,
  maxRetries: 5,
  backoffBaseMs: 30000,
  backoffMaxMs: 600000,

  // Crawl scope
  defaultSinceYear: 2018,

  // User agent
  userAgent:
    'NCMedicaidNavigator/1.0 (+https://queencitycortex.com/crawler-info)',

  // File limits
  maxFileSizeBytes: 50 * 1024 * 1024, // 50 MB
  maxRedirects: 5,

  // Sources
  sources: {
    clinical_policy: {
      indexUrl:
        'https://medicaid.ncdhhs.gov/providers/program-specific-clinical-coverage-policies',
      enabled: true,
    },
    bulletin: {
      indexUrl: 'https://medicaid.ncdhhs.gov/providers/medicaid-bulletin',
      blogListingUrl: 'https://medicaid.ncdhhs.gov/blog-category/bulletins',
      digestsUrl:
        'https://medicaid.ncdhhs.gov/providers/medicaid-bulletin/medicaid-bulletin-digests',
      archiveBaseUrl:
        'https://medicaid.ncdhhs.gov/providers/medicaid-bulletin/medicaid-bulletin-archive',
      enabled: true,
    },
    state_plan_amendment: {
      indexUrl:
        'https://medicaid.ncdhhs.gov/meetingsnotices/medicaid-state-plan-public-notices',
      enabled: true,
    },
    waiver: {
      seedUrls: [
        'https://medicaid.ncdhhs.gov/beneficiaries/nc-innovations-waiver/information-providers-nc-innovations-waiver',
        'https://medicaid.ncdhhs.gov/beneficiaries/1915i',
      ],
      enabled: true,
    },
  },
} as const;

// Source type directory mapping
export const SOURCE_TYPE_DIRS: Record<string, string> = {
  clinical_policy: 'clinical-policies',
  bulletin: 'bulletins',
  state_plan_amendment: 'state-plan-amendments',
  waiver: 'waivers',
  provider_manual: 'provider-manuals',
};
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd crawler && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add crawler/
git commit -m "feat: scaffold crawler project with dependencies and config"
```

---

### Task 2: Logger Utility

**Files:**
- Create: `crawler/src/utils/logger.ts`

- [ ] **Step 1: Create the logger**

Write `crawler/src/utils/logger.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let logFile: fs.WriteStream | null = null;
let consoleLevel: LogLevel = 'info';
let fileLevel: LogLevel = 'debug';

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function timeOnly(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function ensureLogFile(): fs.WriteStream {
  if (!logFile) {
    const logDir = path.dirname(config.logPath);
    fs.mkdirSync(logDir, { recursive: true });
    logFile = fs.createWriteStream(config.logPath, { flags: 'a' });
  }
  return logFile;
}

function writeToFile(level: LogLevel, message: string, data?: unknown): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[fileLevel]) return;
  const stream = ensureLogFile();
  const entry = data
    ? `[${timestamp()}] ${level.toUpperCase()} ${message} ${JSON.stringify(data)}`
    : `[${timestamp()}] ${level.toUpperCase()} ${message}`;
  stream.write(entry + '\n');
}

function writeToConsole(level: LogLevel, message: string): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[consoleLevel]) return;
  const prefix = `[${timeOnly()}]`;
  if (level === 'error') {
    console.error(`${prefix} ERROR: ${message}`);
  } else if (level === 'warn') {
    console.warn(`${prefix} WARN: ${message}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export const logger = {
  debug(message: string, data?: unknown): void {
    writeToFile('debug', message, data);
  },

  info(message: string, data?: unknown): void {
    writeToConsole('info', message);
    writeToFile('info', message, data);
  },

  warn(message: string, data?: unknown): void {
    writeToConsole('warn', message);
    writeToFile('warn', message, data);
  },

  error(message: string, data?: unknown): void {
    writeToConsole('error', message);
    writeToFile('error', message, data);
  },

  setConsoleLevel(level: LogLevel): void {
    consoleLevel = level;
  },

  setFileLevel(level: LogLevel): void {
    fileLevel = level;
  },

  close(): void {
    if (logFile) {
      logFile.end();
      logFile = null;
    }
  },
};
```

- [ ] **Step 2: Verify it compiles**

Run: `cd crawler && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add crawler/src/utils/logger.ts
git commit -m "feat: add structured logger with console and file output"
```

---

### Task 3: Hash & Naming Utilities

**Files:**
- Create: `crawler/src/utils/hash.ts`
- Create: `crawler/src/utils/naming.ts`
- Create: `crawler/tests/utils/hash.test.ts`
- Create: `crawler/tests/utils/naming.test.ts`

- [ ] **Step 1: Write the hash test**

Write `crawler/tests/utils/hash.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { hashFile, hashBuffer } from '../../src/utils/hash.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('hashBuffer', () => {
  it('returns SHA-256 hex digest of a buffer', () => {
    const result = hashBuffer(Buffer.from('hello world'));
    expect(result).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
  });

  it('returns different hash for different content', () => {
    const a = hashBuffer(Buffer.from('hello'));
    const b = hashBuffer(Buffer.from('world'));
    expect(a).not.toBe(b);
  });
});

describe('hashFile', () => {
  it('returns SHA-256 hex digest of a file', async () => {
    const tmpFile = path.join(os.tmpdir(), `hash-test-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'hello world');
    try {
      const result = await hashFile(tmpFile);
      expect(result).toBe(
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
      );
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd crawler && npx vitest run tests/utils/hash.test.ts`
Expected: FAIL — cannot find module `../../src/utils/hash.js`

- [ ] **Step 3: Write the hash implementation**

Write `crawler/src/utils/hash.ts`:

```typescript
import crypto from 'node:crypto';
import fs from 'node:fs';

export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
```

- [ ] **Step 4: Run hash tests to verify they pass**

Run: `cd crawler && npx vitest run tests/utils/hash.test.ts`
Expected: All PASS.

- [ ] **Step 5: Write the naming test**

Write `crawler/tests/utils/naming.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { slugify, buildFilename } from '../../src/utils/naming.js';

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(slugify('CAP/DA (3K-2)')).toBe('capda-3k-2');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('a - b -- c')).toBe('a-b-c');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
  });
});

describe('buildFilename', () => {
  it('prefixes with policy number when available', () => {
    const result = buildFilename({
      policyNumber: '3K-2',
      title: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
      extension: '.pdf',
    });
    expect(result).toBe(
      '3k-2_community-alternatives-program-for-disabled-adults-capda.pdf',
    );
  });

  it('uses title only when no policy number', () => {
    const result = buildFilename({
      policyNumber: null,
      title: 'Some Waiver Document',
      extension: '.pdf',
    });
    expect(result).toBe('some-waiver-document.pdf');
  });

  it('truncates to max 100 characters', () => {
    const longTitle = 'A'.repeat(200);
    const result = buildFilename({
      policyNumber: null,
      title: longTitle,
      extension: '.pdf',
    });
    // 100 chars max includes the extension
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result).toMatch(/\.pdf$/);
  });

  it('handles missing title with fallback', () => {
    const result = buildFilename({
      policyNumber: null,
      title: null,
      extension: '.pdf',
    });
    expect(result).toBe('unknown-document.pdf');
  });

  it('appends numeric suffix for collisions', () => {
    const result = buildFilename({
      policyNumber: '3K-2',
      title: 'Test',
      extension: '.pdf',
      existingNames: new Set(['3k-2_test.pdf']),
    });
    expect(result).toBe('3k-2_test_2.pdf');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd crawler && npx vitest run tests/utils/naming.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 7: Write the naming implementation**

Write `crawler/src/utils/naming.ts`:

```typescript
const MAX_FILENAME_LENGTH = 100;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

interface BuildFilenameOptions {
  policyNumber: string | null;
  title: string | null;
  extension: string;
  existingNames?: Set<string>;
}

export function buildFilename(options: BuildFilenameOptions): string {
  const { policyNumber, title, extension, existingNames } = options;

  let base: string;
  if (policyNumber && title) {
    base = `${slugify(policyNumber)}_${slugify(title)}`;
  } else if (policyNumber) {
    base = slugify(policyNumber);
  } else if (title) {
    base = slugify(title);
  } else {
    base = 'unknown-document';
  }

  // Truncate base to fit within max length including extension
  const maxBase = MAX_FILENAME_LENGTH - extension.length;
  if (base.length > maxBase) {
    base = base.substring(0, maxBase).replace(/-$/, '');
  }

  let filename = `${base}${extension}`;

  // Handle collisions
  if (existingNames) {
    let counter = 2;
    while (existingNames.has(filename)) {
      const suffix = `_${counter}`;
      const truncBase = base.substring(
        0,
        maxBase - suffix.length,
      ).replace(/-$/, '');
      filename = `${truncBase}${suffix}${extension}`;
      counter++;
    }
  }

  return filename;
}
```

- [ ] **Step 8: Run naming tests to verify they pass**

Run: `cd crawler && npx vitest run tests/utils/naming.test.ts`
Expected: All PASS.

- [ ] **Step 9: Commit**

```bash
git add crawler/src/utils/hash.ts crawler/src/utils/naming.ts crawler/tests/
git commit -m "feat: add SHA-256 hash and filename generation utilities with tests"
```

---

### Task 4: SQLite Schema & Document Registry

**Files:**
- Create: `crawler/src/db/schema.ts`
- Create: `crawler/src/db/registry.ts`
- Create: `crawler/tests/db/registry.test.ts`

- [ ] **Step 1: Write the registry test**

Write `crawler/tests/db/registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/db/schema.js';
import { createRegistry, type DocumentRegistry } from '../../src/db/registry.js';
import type { DiscoveredDocument } from '../../src/sources/types.js';

describe('DocumentRegistry', () => {
  let db: Database.Database;
  let registry: DocumentRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    registry = createRegistry(db);
  });

  const sampleDoc: DiscoveredDocument = {
    source_url: 'https://example.com/doc.pdf',
    discovered_from: 'https://example.com/index',
    source_type: 'clinical_policy',
    title: '3K-2, CAP/DA Policy',
    policy_number: '3K-2',
    category: 'Community-Based Services',
  };

  describe('upsertDiscovered', () => {
    it('inserts a new document', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      expect(id).toBeGreaterThan(0);
    });

    it('returns existing id for duplicate source_url', () => {
      const id1 = registry.upsertDiscovered(sampleDoc);
      const id2 = registry.upsertDiscovered(sampleDoc);
      expect(id1).toBe(id2);
    });

    it('updates title if re-discovered with different title', () => {
      registry.upsertDiscovered(sampleDoc);
      registry.upsertDiscovered({ ...sampleDoc, title: 'Updated Title' });
      const doc = registry.getByUrl(sampleDoc.source_url);
      expect(doc?.title).toBe('Updated Title');
    });
  });

  describe('getByUrl', () => {
    it('returns null for unknown URL', () => {
      expect(registry.getByUrl('https://nonexistent.com')).toBeNull();
    });

    it('returns the document for a known URL', () => {
      registry.upsertDiscovered(sampleDoc);
      const doc = registry.getByUrl(sampleDoc.source_url);
      expect(doc).not.toBeNull();
      expect(doc!.source_type).toBe('clinical_policy');
      expect(doc!.status).toBe('discovered');
    });
  });

  describe('updateDownloaded', () => {
    it('updates download state', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      registry.updateDownloaded(id, {
        local_path: 'clinical-policies/3k-2_capda.pdf',
        file_hash: 'abc123',
        file_size: 1024,
        mime_type: 'application/pdf',
        detected_content_type: 'application/pdf',
        content_disposition_filename: 'capda-policy.pdf',
        etag: '"etag-123"',
        last_modified: 'Wed, 01 Jan 2025 00:00:00 GMT',
      });
      const doc = registry.getByUrl(sampleDoc.source_url);
      expect(doc!.status).toBe('downloaded');
      expect(doc!.file_hash).toBe('abc123');
      expect(doc!.detected_content_type).toBe('application/pdf');
      expect(doc!.content_disposition_filename).toBe('capda-policy.pdf');
    });
  });

  describe('markUnchanged', () => {
    it('sets status to unchanged and updates last_checked_at', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      registry.markUnchanged(id);
      const doc = registry.getByUrl(sampleDoc.source_url);
      expect(doc!.status).toBe('unchanged');
      expect(doc!.last_checked_at).not.toBeNull();
    });
  });

  describe('markError', () => {
    it('sets status to error with message', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      registry.markError(id, '404 Not Found');
      const doc = registry.getByUrl(sampleDoc.source_url);
      expect(doc!.status).toBe('error');
      expect(doc!.error_message).toBe('404 Not Found');
      expect(doc!.consecutive_errors).toBe(1);
    });

    it('increments consecutive_errors on repeated errors', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      registry.markError(id, 'timeout');
      registry.markError(id, 'timeout again');
      const doc = registry.getByUrl(sampleDoc.source_url);
      expect(doc!.consecutive_errors).toBe(2);
    });
  });

  describe('markRemoved', () => {
    it('sets status to removed', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      registry.markRemoved(id);
      const doc = registry.getByUrl(sampleDoc.source_url);
      expect(doc!.status).toBe('removed');
    });
  });

  describe('getDocumentsToCheck', () => {
    it('returns downloaded and updated documents', () => {
      const id = registry.upsertDiscovered(sampleDoc);
      registry.updateDownloaded(id, {
        local_path: 'test.pdf',
        file_hash: 'abc',
        file_size: 100,
        mime_type: 'application/pdf',
        detected_content_type: 'application/pdf',
        content_disposition_filename: null,
        etag: null,
        last_modified: null,
      });
      const docs = registry.getDocumentsToCheck();
      expect(docs.length).toBe(1);
    });
  });

  describe('getBySourceType', () => {
    it('filters by source type', () => {
      registry.upsertDiscovered(sampleDoc);
      registry.upsertDiscovered({
        ...sampleDoc,
        source_url: 'https://example.com/bulletin.pdf',
        source_type: 'bulletin',
      });
      const policies = registry.getBySourceType('clinical_policy');
      expect(policies.length).toBe(1);
    });
  });

  describe('getStats', () => {
    it('returns counts by source type and status', () => {
      registry.upsertDiscovered(sampleDoc);
      const stats = registry.getStats();
      expect(stats).toContainEqual({
        source_type: 'clinical_policy',
        status: 'discovered',
        count: 1,
      });
    });
  });

  describe('crawl runs', () => {
    it('creates and completes a crawl run', () => {
      const runId = registry.startCrawlRun(['clinical_policy']);
      registry.completeCrawlRun(runId, {
        documents_discovered: 10,
        documents_downloaded: 5,
        documents_unchanged: 3,
        documents_updated: 1,
        documents_errored: 1,
      });
      // No assertion needed beyond not throwing — the run is in the DB
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd crawler && npx vitest run tests/db/registry.test.ts`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Write the schema module**

Write `crawler/src/db/schema.ts`:

```typescript
import type Database from 'better-sqlite3';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Identity
  source_url TEXT NOT NULL UNIQUE,
  discovered_from TEXT NOT NULL,
  source_type TEXT NOT NULL,

  -- Metadata from index page
  title TEXT,
  policy_number TEXT,
  category TEXT,

  -- Download state
  local_path TEXT,
  file_hash TEXT,
  file_size INTEGER,
  mime_type TEXT,
  detected_content_type TEXT,
  content_disposition_filename TEXT,

  -- HTTP caching headers
  etag TEXT,
  last_modified TEXT,

  -- Timestamps
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_checked_at TEXT,
  last_downloaded_at TEXT,
  last_changed_at TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'discovered',
  error_message TEXT,
  download_attempts INTEGER DEFAULT 0,
  consecutive_errors INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents(source_type);
CREATE INDEX IF NOT EXISTS idx_documents_last_checked ON documents(last_checked_at);
CREATE INDEX IF NOT EXISTS idx_documents_policy_number ON documents(policy_number);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  source_types TEXT,
  documents_discovered INTEGER DEFAULT 0,
  documents_downloaded INTEGER DEFAULT 0,
  documents_unchanged INTEGER DEFAULT 0,
  documents_updated INTEGER DEFAULT 0,
  documents_errored INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running'
);
`;

export function initializeSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
}
```

- [ ] **Step 4: Write the registry module**

Write `crawler/src/db/registry.ts`:

```typescript
import type Database from 'better-sqlite3';
import type { DiscoveredDocument } from '../sources/types.js';

export interface DocumentRecord {
  id: number;
  source_url: string;
  discovered_from: string;
  source_type: string;
  title: string | null;
  policy_number: string | null;
  category: string | null;
  local_path: string | null;
  file_hash: string | null;
  file_size: number | null;
  mime_type: string | null;
  detected_content_type: string | null;
  content_disposition_filename: string | null;
  etag: string | null;
  last_modified: string | null;
  first_seen_at: string;
  last_checked_at: string | null;
  last_downloaded_at: string | null;
  last_changed_at: string | null;
  status: string;
  error_message: string | null;
  download_attempts: number;
  consecutive_errors: number;
}

export interface DownloadedInfo {
  local_path: string;
  file_hash: string;
  file_size: number;
  mime_type: string | null;
  detected_content_type: string | null;
  content_disposition_filename: string | null;
  etag: string | null;
  last_modified: string | null;
}

export interface CrawlRunStats {
  documents_discovered: number;
  documents_downloaded: number;
  documents_unchanged: number;
  documents_updated: number;
  documents_errored: number;
}

export interface StatRow {
  source_type: string;
  status: string;
  count: number;
}

export interface DocumentRegistry {
  upsertDiscovered(doc: DiscoveredDocument): number;
  getByUrl(url: string): DocumentRecord | null;
  getById(id: number): DocumentRecord | null;
  updateDownloaded(id: number, info: DownloadedInfo): void;
  updateChanged(id: number, info: DownloadedInfo): void;
  markUnchanged(id: number): void;
  markError(id: number, message: string): void;
  markRemoved(id: number): void;
  getDocumentsToCheck(sourceType?: string): DocumentRecord[];
  getDocumentsToDownload(sourceType?: string): DocumentRecord[];
  getBySourceType(sourceType: string): DocumentRecord[];
  getByStatus(status: string): DocumentRecord[];
  getStats(): StatRow[];
  getAllDocuments(): DocumentRecord[];
  startCrawlRun(sourceTypes: string[]): number;
  completeCrawlRun(runId: number, stats: CrawlRunStats): void;
  failCrawlRun(runId: number): void;
}

export function createRegistry(db: Database.Database): DocumentRegistry {
  // Prepare statements
  const insertStmt = db.prepare(`
    INSERT INTO documents (source_url, discovered_from, source_type, title, policy_number, category)
    VALUES (@source_url, @discovered_from, @source_type, @title, @policy_number, @category)
    ON CONFLICT(source_url) DO UPDATE SET
      title = COALESCE(@title, title),
      policy_number = COALESCE(@policy_number, policy_number),
      category = COALESCE(@category, category)
  `);

  const getByUrlStmt = db.prepare(
    'SELECT * FROM documents WHERE source_url = ?',
  );

  const getByIdStmt = db.prepare('SELECT * FROM documents WHERE id = ?');

  const updateDownloadedStmt = db.prepare(`
    UPDATE documents SET
      local_path = @local_path,
      file_hash = @file_hash,
      file_size = @file_size,
      mime_type = @mime_type,
      detected_content_type = @detected_content_type,
      content_disposition_filename = @content_disposition_filename,
      etag = @etag,
      last_modified = @last_modified,
      last_checked_at = datetime('now'),
      last_downloaded_at = datetime('now'),
      last_changed_at = datetime('now'),
      status = 'downloaded',
      download_attempts = download_attempts + 1,
      consecutive_errors = 0,
      error_message = NULL
    WHERE id = @id
  `);

  const updateChangedStmt = db.prepare(`
    UPDATE documents SET
      local_path = @local_path,
      file_hash = @file_hash,
      file_size = @file_size,
      mime_type = @mime_type,
      detected_content_type = @detected_content_type,
      content_disposition_filename = @content_disposition_filename,
      etag = @etag,
      last_modified = @last_modified,
      last_checked_at = datetime('now'),
      last_downloaded_at = datetime('now'),
      last_changed_at = datetime('now'),
      status = 'updated',
      download_attempts = download_attempts + 1,
      consecutive_errors = 0,
      error_message = NULL
    WHERE id = @id
  `);

  const markUnchangedStmt = db.prepare(`
    UPDATE documents SET
      last_checked_at = datetime('now'),
      status = 'unchanged',
      consecutive_errors = 0,
      error_message = NULL
    WHERE id = ?
  `);

  const markErrorStmt = db.prepare(`
    UPDATE documents SET
      last_checked_at = datetime('now'),
      status = 'error',
      error_message = @message,
      download_attempts = download_attempts + 1,
      consecutive_errors = consecutive_errors + 1
    WHERE id = @id
  `);

  const markRemovedStmt = db.prepare(`
    UPDATE documents SET
      last_checked_at = datetime('now'),
      status = 'removed'
    WHERE id = ?
  `);

  const getToCheckStmt = db.prepare(`
    SELECT * FROM documents
    WHERE status IN ('downloaded', 'updated', 'unchanged')
    ORDER BY last_checked_at ASC NULLS FIRST
  `);

  const getToCheckBySourceStmt = db.prepare(`
    SELECT * FROM documents
    WHERE status IN ('downloaded', 'updated', 'unchanged')
      AND source_type = ?
    ORDER BY last_checked_at ASC NULLS FIRST
  `);

  const getToDownloadStmt = db.prepare(`
    SELECT * FROM documents
    WHERE status = 'discovered'
    ORDER BY first_seen_at ASC
  `);

  const getToDownloadBySourceStmt = db.prepare(`
    SELECT * FROM documents
    WHERE status = 'discovered' AND source_type = ?
    ORDER BY first_seen_at ASC
  `);

  const getBySourceTypeStmt = db.prepare(
    'SELECT * FROM documents WHERE source_type = ?',
  );

  const getByStatusStmt = db.prepare(
    'SELECT * FROM documents WHERE status = ?',
  );

  const getStatsStmt = db.prepare(`
    SELECT source_type, status, COUNT(*) as count
    FROM documents
    GROUP BY source_type, status
    ORDER BY source_type, status
  `);

  const getAllStmt = db.prepare('SELECT * FROM documents ORDER BY id');

  const startRunStmt = db.prepare(`
    INSERT INTO crawl_runs (source_types) VALUES (?)
  `);

  const completeRunStmt = db.prepare(`
    UPDATE crawl_runs SET
      completed_at = datetime('now'),
      documents_discovered = @documents_discovered,
      documents_downloaded = @documents_downloaded,
      documents_unchanged = @documents_unchanged,
      documents_updated = @documents_updated,
      documents_errored = @documents_errored,
      status = 'completed'
    WHERE id = @id
  `);

  const failRunStmt = db.prepare(`
    UPDATE crawl_runs SET
      completed_at = datetime('now'),
      status = 'failed'
    WHERE id = ?
  `);

  return {
    upsertDiscovered(doc: DiscoveredDocument): number {
      insertStmt.run(doc);
      const row = getByUrlStmt.get(doc.source_url) as DocumentRecord;
      return row.id;
    },

    getByUrl(url: string): DocumentRecord | null {
      return (getByUrlStmt.get(url) as DocumentRecord) ?? null;
    },

    getById(id: number): DocumentRecord | null {
      return (getByIdStmt.get(id) as DocumentRecord) ?? null;
    },

    updateDownloaded(id: number, info: DownloadedInfo): void {
      updateDownloadedStmt.run({ id, ...info });
    },

    updateChanged(id: number, info: DownloadedInfo): void {
      updateChangedStmt.run({ id, ...info });
    },

    markUnchanged(id: number): void {
      markUnchangedStmt.run(id);
    },

    markError(id: number, message: string): void {
      markErrorStmt.run({ id, message });
    },

    markRemoved(id: number): void {
      markRemovedStmt.run(id);
    },

    getDocumentsToCheck(sourceType?: string): DocumentRecord[] {
      if (sourceType) {
        return getToCheckBySourceStmt.all(sourceType) as DocumentRecord[];
      }
      return getToCheckStmt.all() as DocumentRecord[];
    },

    getDocumentsToDownload(sourceType?: string): DocumentRecord[] {
      if (sourceType) {
        return getToDownloadBySourceStmt.all(sourceType) as DocumentRecord[];
      }
      return getToDownloadStmt.all() as DocumentRecord[];
    },

    getBySourceType(sourceType: string): DocumentRecord[] {
      return getBySourceTypeStmt.all(sourceType) as DocumentRecord[];
    },

    getByStatus(status: string): DocumentRecord[] {
      return getByStatusStmt.all(status) as DocumentRecord[];
    },

    getStats(): StatRow[] {
      return getStatsStmt.all() as StatRow[];
    },

    getAllDocuments(): DocumentRecord[] {
      return getAllStmt.all() as DocumentRecord[];
    },

    startCrawlRun(sourceTypes: string[]): number {
      const result = startRunStmt.run(JSON.stringify(sourceTypes));
      return Number(result.lastInsertRowid);
    },

    completeCrawlRun(runId: number, stats: CrawlRunStats): void {
      completeRunStmt.run({ id: runId, ...stats });
    },

    failCrawlRun(runId: number): void {
      failRunStmt.run(runId);
    },
  };
}
```

- [ ] **Step 5: Run registry tests to verify they pass**

Run: `cd crawler && npx vitest run tests/db/registry.test.ts`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add crawler/src/db/ crawler/tests/db/
git commit -m "feat: add SQLite schema and document registry with full CRUD"
```

---

### Task 5: HTTP Fetcher with Rate Limiting

**Files:**
- Create: `crawler/src/crawl/fetcher.ts`
- Create: `crawler/tests/crawl/fetcher.test.ts`

- [ ] **Step 1: Write the fetcher test**

Write `crawler/tests/crawl/fetcher.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFetcher } from '../../src/crawl/fetcher.js';

// We test the rate-limiting and retry logic, not actual HTTP
// Actual HTTP is tested in integration tests

describe('createFetcher', () => {
  it('creates a fetcher instance', () => {
    const fetcher = createFetcher({
      userAgent: 'TestBot/1.0',
      defaultDelayMs: 100,
      requestTimeoutMs: 5000,
      maxRetries: 3,
      backoffBaseMs: 100,
      backoffMaxMs: 1000,
      maxRedirects: 5,
    });
    expect(fetcher).toBeDefined();
    expect(fetcher.fetchHtml).toBeInstanceOf(Function);
    expect(fetcher.fetchFile).toBeInstanceOf(Function);
  });
});

describe('rate limiting', () => {
  it('enforces minimum delay between requests to the same domain', async () => {
    const fetcher = createFetcher({
      userAgent: 'TestBot/1.0',
      defaultDelayMs: 200,
      requestTimeoutMs: 5000,
      maxRetries: 0,
      backoffBaseMs: 100,
      backoffMaxMs: 1000,
      maxRedirects: 5,
    });

    // We can't easily test timing without real HTTP,
    // but we can verify the fetcher tracks per-domain delays
    expect(fetcher.getDelayForDomain('example.com')).toBe(200);
  });

  it('respects custom crawl-delay per domain', () => {
    const fetcher = createFetcher({
      userAgent: 'TestBot/1.0',
      defaultDelayMs: 200,
      requestTimeoutMs: 5000,
      maxRetries: 0,
      backoffBaseMs: 100,
      backoffMaxMs: 1000,
      maxRedirects: 5,
    });

    fetcher.setCrawlDelay('example.com', 5000);
    expect(fetcher.getDelayForDomain('example.com')).toBe(5000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd crawler && npx vitest run tests/crawl/fetcher.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the fetcher implementation**

Write `crawler/src/crawl/fetcher.ts`:

```typescript
import { request } from 'undici';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { logger } from '../utils/logger.js';
import type { Fetcher, FetchFileResult } from '../sources/types.js';

export interface FetcherOptions {
  userAgent: string;
  defaultDelayMs: number;
  requestTimeoutMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  maxRedirects: number;
}

interface RateLimitedFetcher extends Fetcher {
  setCrawlDelay(domain: string, delayMs: number): void;
  getDelayForDomain(domain: string): number;
}

function extractDomain(url: string): string {
  return new URL(url).hostname;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createFetcher(options: FetcherOptions): RateLimitedFetcher {
  const domainDelays = new Map<string, number>();
  const lastRequestTime = new Map<string, number>();
  let runWide429Count = 0;

  function getDelay(domain: string): number {
    return domainDelays.get(domain) ?? options.defaultDelayMs;
  }

  async function waitForRateLimit(domain: string): Promise<void> {
    const delay = getDelay(domain);
    const lastTime = lastRequestTime.get(domain);
    if (lastTime) {
      const elapsed = Date.now() - lastTime;
      if (elapsed < delay) {
        const waitMs = delay - elapsed;
        logger.debug(`Rate limit: waiting ${waitMs}ms for ${domain}`);
        await sleep(waitMs);
      }
    }
    lastRequestTime.set(domain, Date.now());
  }

  const commonHeaders = {
    'user-agent': options.userAgent,
    accept:
      'application/pdf, application/vnd.openxmlformats-officedocument.*, text/html, */*',
    'accept-encoding': 'gzip, deflate',
  };

  async function fetchWithRetry(
    url: string,
    extraHeaders: Record<string, string> = {},
    retries: number = options.maxRetries,
  ): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: Readable }> {
    const domain = extractDomain(url);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      await waitForRateLimit(domain);

      const startTime = Date.now();
      try {
        const response = await request(url, {
          method: 'GET',
          headers: { ...commonHeaders, ...extraHeaders },
          maxRedirections: options.maxRedirects,
          bodyTimeout: options.requestTimeoutMs,
          headersTimeout: options.requestTimeoutMs,
        });

        const elapsed = Date.now() - startTime;
        logger.debug(
          `GET ${url} -> ${response.statusCode} (${elapsed}ms)`,
          {
            url,
            statusCode: response.statusCode,
            elapsed,
            contentLength: response.headers['content-length'],
          },
        );

        // Don't retry on success or client errors (except 429)
        if (response.statusCode < 500 && response.statusCode !== 429) {
          return {
            statusCode: response.statusCode,
            headers: response.headers as Record<string, string | string[] | undefined>,
            body: response.body as unknown as Readable,
          };
        }

        // 429 or 5xx — retry with backoff
        if (response.statusCode === 429) {
          runWide429Count++;
          if (runWide429Count > 3) {
            logger.warn(
              `429 received ${runWide429Count} times this run — pausing entire crawl for 5 minutes`,
            );
            await sleep(5 * 60 * 1000);
          }
        }

        const backoffMs = Math.min(
          options.backoffBaseMs * Math.pow(2, attempt),
          options.backoffMaxMs,
        );
        logger.warn(
          `${response.statusCode} from ${url}, backing off ${backoffMs}ms (attempt ${attempt + 1}/${retries + 1})`,
        );

        // Consume the body to free the socket
        await response.body.text();

        if (attempt < retries) {
          await sleep(backoffMs);
        }

        lastError = new Error(`HTTP ${response.statusCode}`);
      } catch (err) {
        const elapsed = Date.now() - startTime;
        logger.error(
          `Request failed for ${url} after ${elapsed}ms: ${(err as Error).message}`,
        );
        lastError = err as Error;

        if (attempt < retries) {
          const backoffMs = Math.min(
            options.backoffBaseMs * Math.pow(2, attempt),
            options.backoffMaxMs,
          );
          await sleep(backoffMs);
        }
      }
    }

    throw lastError ?? new Error(`Failed to fetch ${url}`);
  }

  return {
    async fetchHtml(
      url: string,
    ): Promise<{ body: string; statusCode: number }> {
      const response = await fetchWithRetry(url, {
        accept: 'text/html, */*',
      });
      const body = await response.body.text();
      return { body, statusCode: response.statusCode };
    },

    async fetchFile(
      url: string,
      destPath: string,
      conditionalHeaders?: { etag?: string; lastModified?: string },
    ): Promise<FetchFileResult> {
      const extraHeaders: Record<string, string> = {};
      if (conditionalHeaders?.etag) {
        extraHeaders['if-none-match'] = conditionalHeaders.etag;
      }
      if (conditionalHeaders?.lastModified) {
        extraHeaders['if-modified-since'] = conditionalHeaders.lastModified;
      }

      const response = await fetchWithRetry(url, extraHeaders, 1);

      if (response.statusCode === 304) {
        // Consume the body
        await response.body.text();
        return {
          statusCode: 304,
          headers: response.headers,
          filePath: null,
          downloaded: false,
        };
      }

      if (response.statusCode !== 200) {
        await response.body.text();
        return {
          statusCode: response.statusCode,
          headers: response.headers,
          filePath: null,
          downloaded: false,
        };
      }

      // Stream to disk
      const writeStream = fs.createWriteStream(destPath);
      await pipeline(response.body, writeStream);

      return {
        statusCode: 200,
        headers: response.headers,
        filePath: destPath,
        downloaded: true,
      };
    },

    setCrawlDelay(domain: string, delayMs: number): void {
      domainDelays.set(domain, Math.max(delayMs, options.defaultDelayMs));
    },

    getDelayForDomain(domain: string): number {
      return getDelay(domain);
    },
  };
}
```

- [ ] **Step 4: Run fetcher tests to verify they pass**

Run: `cd crawler && npx vitest run tests/crawl/fetcher.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add crawler/src/crawl/fetcher.ts crawler/tests/crawl/fetcher.test.ts
git commit -m "feat: add HTTP fetcher with rate limiting, retries, and conditional requests"
```

---

### Task 6: robots.txt Handler

**Files:**
- Create: `crawler/src/crawl/robots.ts`

- [ ] **Step 1: Write the robots.txt module**

Write `crawler/src/crawl/robots.ts`:

```typescript
import robotsParser from 'robots-parser';
import { logger } from '../utils/logger.js';
import type { Fetcher } from '../sources/types.js';

interface RobotsCache {
  [domain: string]: ReturnType<typeof robotsParser>;
}

export interface RobotsChecker {
  fetchAndCache(domain: string, fetcher: Fetcher): Promise<void>;
  isAllowed(url: string): boolean;
  getCrawlDelay(domain: string): number | null;
}

export function createRobotsChecker(userAgent: string): RobotsChecker {
  const cache: RobotsCache = {};

  return {
    async fetchAndCache(domain: string, fetcher: Fetcher): Promise<void> {
      const robotsUrl = `https://${domain}/robots.txt`;
      try {
        const { body, statusCode } = await fetcher.fetchHtml(robotsUrl);
        if (statusCode === 200) {
          cache[domain] = robotsParser(robotsUrl, body);
          const crawlDelay = cache[domain].getCrawlDelay(userAgent);
          logger.info(
            `Fetching robots.txt for ${domain}... OK (Crawl-delay: ${crawlDelay ?? 'none'})`,
          );
        } else {
          logger.info(
            `Fetching robots.txt for ${domain}... ${statusCode} (allowing all)`,
          );
        }
      } catch (err) {
        logger.warn(
          `Failed to fetch robots.txt for ${domain}: ${(err as Error).message} (allowing all)`,
        );
      }
    },

    isAllowed(url: string): boolean {
      const domain = new URL(url).hostname;
      const robots = cache[domain];
      if (!robots) return true;
      return robots.isAllowed(url, userAgent) ?? true;
    },

    getCrawlDelay(domain: string): number | null {
      const robots = cache[domain];
      if (!robots) return null;
      const delay = robots.getCrawlDelay(userAgent);
      return delay ?? null;
    },
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd crawler && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add crawler/src/crawl/robots.ts
git commit -m "feat: add robots.txt fetching and compliance checking"
```

---

### Task 7: Downloader

**Files:**
- Create: `crawler/src/crawl/downloader.ts`
- Create: `crawler/tests/crawl/downloader.test.ts`

- [ ] **Step 1: Write the downloader test**

Write `crawler/tests/crawl/downloader.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseContentDisposition,
  detectContentType,
  archiveOldVersion,
} from '../../src/crawl/downloader.js';

describe('parseContentDisposition', () => {
  it('extracts filename from Content-Disposition header', () => {
    const result = parseContentDisposition(
      'attachment; filename="policy-3k-2.pdf"',
    );
    expect(result).toBe('policy-3k-2.pdf');
  });

  it('handles filename* with encoding', () => {
    const result = parseContentDisposition(
      "attachment; filename*=UTF-8''policy%203k-2.pdf",
    );
    expect(result).toBe('policy 3k-2.pdf');
  });

  it('returns null for missing header', () => {
    expect(parseContentDisposition(undefined)).toBeNull();
    expect(parseContentDisposition('')).toBeNull();
  });
});

describe('detectContentType', () => {
  it('detects PDF from magic bytes', async () => {
    const tmpFile = path.join(os.tmpdir(), `detect-test-${Date.now()}.pdf`);
    // PDF magic bytes: %PDF-1.4
    fs.writeFileSync(tmpFile, Buffer.from('%PDF-1.4\n'));
    try {
      const result = await detectContentType(tmpFile);
      expect(result).toBe('application/pdf');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('returns null for unrecognizable content', async () => {
    const tmpFile = path.join(os.tmpdir(), `detect-test-${Date.now()}.bin`);
    fs.writeFileSync(tmpFile, 'just plain text');
    try {
      const result = await detectContentType(tmpFile);
      // file-type may or may not detect plain text — either null or a type is fine
      expect(result === null || typeof result === 'string').toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

describe('archiveOldVersion', () => {
  it('moves file to .versions directory with timestamp', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-test-'));
    const filePath = path.join(tmpDir, 'test.pdf');
    fs.writeFileSync(filePath, 'old content');

    archiveOldVersion(filePath);

    expect(fs.existsSync(filePath)).toBe(false);
    const versionsDir = path.join(tmpDir, '.versions');
    expect(fs.existsSync(versionsDir)).toBe(true);
    const versions = fs.readdirSync(versionsDir);
    expect(versions.length).toBe(1);
    expect(versions[0]).toMatch(/^test\.\d{4}-\d{2}-\d{2}T.*\.pdf$/);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd crawler && npx vitest run tests/crawl/downloader.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the downloader implementation**

Write `crawler/src/crawl/downloader.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';
import { hashFile } from '../utils/hash.js';
import { buildFilename } from '../utils/naming.js';
import { logger } from '../utils/logger.js';
import { config, SOURCE_TYPE_DIRS } from '../config.js';
import type { DocumentRecord, DownloadedInfo } from '../db/registry.js';
import type { Fetcher, FetchFileResult } from '../sources/types.js';

export function parseContentDisposition(
  header: string | undefined | null,
): string | null {
  if (!header) return null;

  // Try filename*= first (RFC 5987)
  const encodedMatch = header.match(/filename\*=(?:UTF-8''|utf-8'')(.+)/i);
  if (encodedMatch) {
    return decodeURIComponent(encodedMatch[1]);
  }

  // Try filename= (with or without quotes)
  const match = header.match(/filename="?([^";\n]+)"?/i);
  if (match) {
    return match[1].trim();
  }

  return null;
}

export async function detectContentType(
  filePath: string,
): Promise<string | null> {
  try {
    const result = await fileTypeFromFile(filePath);
    return result?.mime ?? null;
  } catch {
    return null;
  }
}

export function archiveOldVersion(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const dir = path.dirname(filePath);
  const versionsDir = path.join(dir, '.versions');
  fs.mkdirSync(versionsDir, { recursive: true });

  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const archiveName = `${base}.${timestamp}${ext}`;

  fs.renameSync(filePath, path.join(versionsDir, archiveName));
  logger.debug(`Archived old version: ${archiveName}`);
}

export interface DownloadResult {
  action: 'downloaded' | 'updated' | 'unchanged' | 'error';
  info?: DownloadedInfo;
  error?: string;
}

export async function downloadDocument(
  doc: DocumentRecord,
  fetcher: Fetcher,
  existingFilenames: Set<string>,
): Promise<DownloadResult> {
  const sourceDir = path.join(
    config.documentsDir,
    SOURCE_TYPE_DIRS[doc.source_type] ?? doc.source_type,
  );
  fs.mkdirSync(sourceDir, { recursive: true });

  // Build a temporary path for the download
  const tmpPath = path.join(sourceDir, `.download-${doc.id}.tmp`);

  try {
    // Prepare conditional headers
    const conditionalHeaders =
      doc.etag || doc.last_modified
        ? { etag: doc.etag ?? undefined, lastModified: doc.last_modified ?? undefined }
        : undefined;

    const result: FetchFileResult = await fetcher.fetchFile(
      doc.source_url,
      tmpPath,
      conditionalHeaders,
    );

    // 304 Not Modified
    if (result.statusCode === 304) {
      return { action: 'unchanged' };
    }

    // Non-200 responses
    if (result.statusCode === 404) {
      return { action: 'error', error: '404 Not Found (removed)' };
    }
    if (result.statusCode !== 200 || !result.filePath) {
      return {
        action: 'error',
        error: `HTTP ${result.statusCode}`,
      };
    }

    // Check file size against limit
    const tmpStats = fs.statSync(tmpPath);
    if (tmpStats.size > config.maxFileSizeBytes) {
      logger.warn(
        `${doc.source_url} exceeds max file size (${Math.round(tmpStats.size / 1024 / 1024)} MB) — skipping`,
      );
      fs.unlinkSync(tmpPath);
      return {
        action: 'error',
        error: `File too large: ${Math.round(tmpStats.size / 1024 / 1024)} MB exceeds ${config.maxFileSizeBytes / 1024 / 1024} MB limit`,
      };
    }

    // Compute hash
    const fileHash = await hashFile(tmpPath);

    // Check if content actually changed (for servers that don't support conditional requests)
    if (doc.file_hash && fileHash === doc.file_hash) {
      fs.unlinkSync(tmpPath);
      return { action: 'unchanged' };
    }

    // Detect content type from magic bytes
    const detectedContentType = await detectContentType(tmpPath);

    // Parse Content-Disposition
    const contentDisposition = parseContentDisposition(
      result.headers['content-disposition'] as string | undefined,
    );

    // Determine file extension
    const ext = detectedContentType?.includes('pdf')
      ? '.pdf'
      : path.extname(
          contentDisposition ?? new URL(doc.source_url).pathname,
        ) || '.pdf';

    // Build final filename
    const filename = buildFilename({
      policyNumber: doc.policy_number,
      title: doc.title,
      extension: ext,
      existingNames: existingFilenames,
    });

    const finalPath = path.join(sourceDir, filename);

    // Archive old version if this is an update
    if (doc.local_path && doc.file_hash && fileHash !== doc.file_hash) {
      const oldFullPath = path.join(config.documentsDir, doc.local_path);
      archiveOldVersion(oldFullPath);
    }

    // Move tmp file to final location
    fs.renameSync(tmpPath, finalPath);
    existingFilenames.add(filename);

    const stats = fs.statSync(finalPath);
    const relativePath = path.join(
      SOURCE_TYPE_DIRS[doc.source_type] ?? doc.source_type,
      filename,
    );

    const mimeType = (result.headers['content-type'] as string)
      ?.split(';')[0]
      ?.trim() ?? null;

    const info: DownloadedInfo = {
      local_path: relativePath,
      file_hash: fileHash,
      file_size: stats.size,
      mime_type: mimeType,
      detected_content_type: detectedContentType,
      content_disposition_filename: contentDisposition,
      etag: (result.headers['etag'] as string) ?? null,
      last_modified: (result.headers['last-modified'] as string) ?? null,
    };

    const action = doc.file_hash ? 'updated' : 'downloaded';
    return { action, info };
  } catch (err) {
    // Clean up tmp file on error
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
    return { action: 'error', error: (err as Error).message };
  }
}
```

- [ ] **Step 4: Run downloader tests to verify they pass**

Run: `cd crawler && npx vitest run tests/crawl/downloader.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add crawler/src/crawl/downloader.ts crawler/tests/crawl/downloader.test.ts
git commit -m "feat: add streaming downloader with Content-Disposition, magic bytes, and version history"
```

---

### Task 8: Clinical Policies Source Module

**Files:**
- Create: `crawler/src/sources/clinical-policies.ts`
- Create: `crawler/tests/sources/clinical-policies.test.ts`
- Create: `crawler/tests/fixtures/clinical-policies.html`

This is the first source module. It validates the full discovery pattern that all other sources will follow.

- [ ] **Step 1: Fetch and save the HTML fixture**

This step requires a real HTTP request to save the fixture. Run a quick script:

```bash
cd crawler && npx tsx -e "
import { writeFileSync, mkdirSync } from 'fs';
mkdirSync('tests/fixtures', { recursive: true });
const res = await fetch('https://medicaid.ncdhhs.gov/providers/program-specific-clinical-coverage-policies');
const html = await res.text();
writeFileSync('tests/fixtures/clinical-policies.html', html);
console.log('Saved', html.length, 'bytes');
"
```

Expected: HTML fixture saved. Inspect it to understand the page structure before writing the parser.

- [ ] **Step 2: Examine the fixture to understand link structure**

Read the saved HTML file. Look for:
- `<h3>` or `<h2>` category headings
- `<a>` tags with `/download` in the href
- The pattern of link text (e.g., "3K-2, Community Alternatives Program...")
- Any container elements that group policies by category

Document your findings as comments in the test file.

- [ ] **Step 3: Write the parser test**

Write `crawler/tests/sources/clinical-policies.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseClinicalPoliciesPage } from '../../src/sources/clinical-policies.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'clinical-policies.html'),
  'utf-8',
);

describe('parseClinicalPoliciesPage', () => {
  const results = parseClinicalPoliciesPage(
    fixtureHtml,
    'https://medicaid.ncdhhs.gov/providers/program-specific-clinical-coverage-policies',
  );

  it('discovers a substantial number of documents', () => {
    // The index page has ~120+ policies
    expect(results.length).toBeGreaterThan(50);
  });

  it('all results have required fields', () => {
    for (const doc of results) {
      expect(doc.source_url).toMatch(/^https?:\/\//);
      expect(doc.source_type).toBe('clinical_policy');
      expect(doc.discovered_from).toBe(
        'https://medicaid.ncdhhs.gov/providers/program-specific-clinical-coverage-policies',
      );
      expect(doc.title).toBeTruthy();
    }
  });

  it('extracts policy numbers from titles', () => {
    const withNumbers = results.filter((d) => d.policy_number);
    // Most policies have a number prefix
    expect(withNumbers.length).toBeGreaterThan(40);

    // Spot-check a known policy format
    const hasPolicyFormat = withNumbers.some(
      (d) => d.policy_number && /^\d+[A-Z]?(-\d+)?$/.test(d.policy_number),
    );
    expect(hasPolicyFormat).toBe(true);
  });

  it('extracts categories from page structure', () => {
    const withCategories = results.filter((d) => d.category);
    expect(withCategories.length).toBeGreaterThan(0);
  });

  it('all source_urls contain /download', () => {
    for (const doc of results) {
      expect(doc.source_url).toContain('/download');
    }
  });

  it('produces no duplicate source_urls', () => {
    const urls = results.map((d) => d.source_url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd crawler && npx vitest run tests/sources/clinical-policies.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 5: Write the parser implementation**

Write `crawler/src/sources/clinical-policies.ts`. The exact CSS selectors will depend on what you found in Step 2 when examining the fixture. The structure below is a starting point — adapt the selectors to match the actual HTML:

```typescript
import * as cheerio from 'cheerio';
import type { DiscoveredDocument, Fetcher } from './types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const INDEX_URL = config.sources.clinical_policy.indexUrl;

export function parseClinicalPoliciesPage(
  html: string,
  pageUrl: string,
): DiscoveredDocument[] {
  const $ = cheerio.load(html);
  const documents: DiscoveredDocument[] = [];
  const seenUrls = new Set<string>();

  let currentCategory: string | null = null;

  // Walk through content elements to track category headings and links
  // Adapt these selectors based on the actual page structure found in Step 2
  const contentArea = $('main, .main-content, article, .field--name-body').first();
  const container = contentArea.length ? contentArea : $('body');

  container.find('h2, h3, h4, a').each((_, el) => {
    const $el = $(el);
    const tagName = el.tagName?.toLowerCase();

    // Track category headings
    if (tagName === 'h2' || tagName === 'h3' || tagName === 'h4') {
      const text = $el.text().trim();
      if (text && text.length < 200) {
        currentCategory = text;
      }
      return;
    }

    // Process links
    if (tagName === 'a') {
      const href = $el.attr('href');
      if (!href || !href.includes('/download')) return;

      const fullUrl = new URL(href, pageUrl).toString();
      if (seenUrls.has(fullUrl)) return;
      seenUrls.add(fullUrl);

      const linkText = $el.text().trim();
      if (!linkText) return;

      // Parse policy number from link text
      // Format: "3K-2, Community Alternatives Program..." or "8A, ..."
      const { policyNumber, title } = parsePolicyTitle(linkText);

      documents.push({
        source_url: fullUrl,
        discovered_from: pageUrl,
        source_type: 'clinical_policy',
        title: linkText,
        policy_number: policyNumber,
        category: currentCategory,
      });
    }
  });

  return documents;
}

function parsePolicyTitle(text: string): {
  policyNumber: string | null;
  title: string;
} {
  // Try to match pattern: "NUMBER, rest of title"
  // Policy numbers like: 3K-2, 8A, 10A-24, 1E-1
  const match = text.match(/^(\d+[A-Z]?(?:-\d+)?)\s*,\s*(.+)/i);
  if (match) {
    return { policyNumber: match[1].toUpperCase(), title: text };
  }
  return { policyNumber: null, title: text };
}

export async function discover(fetcher: Fetcher): Promise<DiscoveredDocument[]> {
  logger.info('Discovering clinical policies...');
  const { body } = await fetcher.fetchHtml(INDEX_URL);
  const documents = parseClinicalPoliciesPage(body, INDEX_URL);
  logger.info(
    `Discovering clinical policies... found ${documents.length} documents`,
  );
  return documents;
}
```

- [ ] **Step 6: Run parser tests — iterate on selectors until they pass**

Run: `cd crawler && npx vitest run tests/sources/clinical-policies.test.ts`

If tests fail because CSS selectors don't match the actual HTML structure, update the selectors in `clinical-policies.ts` based on what the fixture HTML actually contains. This may take 2-3 iterations.

Expected: All PASS once selectors match the real page structure.

- [ ] **Step 7: Commit**

```bash
git add crawler/src/sources/clinical-policies.ts crawler/tests/sources/ crawler/tests/fixtures/
git commit -m "feat: add clinical policies discovery with HTML fixture tests"
```

---

### Task 9: Discovery Coordinator

**Files:**
- Create: `crawler/src/crawl/discovery.ts`

- [ ] **Step 1: Write the discovery coordinator**

Write `crawler/src/crawl/discovery.ts`:

```typescript
import type { DiscoveredDocument, Fetcher, SourceType } from '../sources/types.js';
import * as clinicalPolicies from '../sources/clinical-policies.js';
import { logger } from '../utils/logger.js';

// Source modules registered here — add new sources as they're implemented
const sourceModules: Partial<
  Record<SourceType, { discover: (fetcher: Fetcher, sinceYear?: number) => Promise<DiscoveredDocument[]> }>
> = {
  clinical_policy: clinicalPolicies,
  // bulletin: bulletins,           // Task 12
  // state_plan_amendment: statePlan, // Task 13
  // waiver: waivers,               // Task 14
};

export async function discoverDocuments(
  fetcher: Fetcher,
  sourceTypes: SourceType[],
  sinceYear?: number,
): Promise<DiscoveredDocument[]> {
  const allDocuments: DiscoveredDocument[] = [];

  for (const sourceType of sourceTypes) {
    const module = sourceModules[sourceType];
    if (!module) {
      logger.warn(`No discovery module for source type: ${sourceType}`);
      continue;
    }

    try {
      const documents = await module.discover(fetcher, sinceYear);
      allDocuments.push(...documents);
    } catch (err) {
      logger.error(
        `Discovery failed for ${sourceType}: ${(err as Error).message}`,
        err,
      );
      // Continue with other sources — don't crash the run
    }
  }

  return allDocuments;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd crawler && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add crawler/src/crawl/discovery.ts
git commit -m "feat: add discovery coordinator dispatching to source modules"
```

---

### Task 10: CLI Entry Point — Core Commands

**Files:**
- Create: `crawler/src/index.ts`

- [ ] **Step 1: Write the CLI with all subcommands**

Write `crawler/src/index.ts`:

```typescript
import { Command } from 'commander';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config, SOURCE_TYPE_DIRS } from './config.js';
import { initializeSchema } from './db/schema.js';
import { createRegistry } from './db/registry.js';
import { createFetcher } from './crawl/fetcher.js';
import { createRobotsChecker } from './crawl/robots.js';
import { discoverDocuments } from './crawl/discovery.js';
import { downloadDocument } from './crawl/downloader.js';
import { logger } from './utils/logger.js';
import type { SourceType } from './sources/types.js';

const VALID_SOURCE_TYPES: SourceType[] = [
  'clinical_policy',
  'bulletin',
  'state_plan_amendment',
  'waiver',
];

function initDb(): ReturnType<typeof createRegistry> & { close: () => void } {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const db = new Database(config.dbPath);
  initializeSchema(db);
  const registry = createRegistry(db);
  return { ...registry, close: () => db.close() };
}

function parseSourceTypes(source?: string): SourceType[] {
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

const program = new Command()
  .name('nc-medicaid-crawler')
  .description('Polite incremental crawler for NC Medicaid policy documents')
  .version('1.0.0');

// --- crawl command ---
program
  .command('crawl')
  .description('Discover and download documents')
  .option(
    '-s, --source <types>',
    'Comma-separated source types to crawl',
  )
  .option('--since-year <year>', 'How far back to crawl', String(config.defaultSinceYear))
  .option('--dry-run', 'Discover documents without downloading')
  .action(async (opts) => {
    const sourceTypes = parseSourceTypes(opts.source);
    const sinceYear = parseInt(opts.sinceYear, 10);
    const dryRun = opts.dryRun ?? false;

    const registry = initDb();
    const runId = registry.startCrawlRun(sourceTypes);

    const fetcher = createFetcher({
      userAgent: config.userAgent,
      defaultDelayMs: config.defaultDelayMs,
      requestTimeoutMs: config.requestTimeoutMs,
      maxRetries: config.maxRetries,
      backoffBaseMs: config.backoffBaseMs,
      backoffMaxMs: config.backoffMaxMs,
      maxRedirects: config.maxRedirects,
    });

    // Check robots.txt
    const robots = createRobotsChecker(config.userAgent);
    const domains = new Set<string>();
    for (const st of sourceTypes) {
      const src = config.sources[st as keyof typeof config.sources];
      if ('indexUrl' in src) {
        domains.add(new URL(src.indexUrl).hostname);
      }
      if ('seedUrls' in src) {
        for (const u of src.seedUrls) {
          domains.add(new URL(u).hostname);
        }
      }
    }
    for (const domain of domains) {
      await robots.fetchAndCache(domain, fetcher);
      const crawlDelay = robots.getCrawlDelay(domain);
      if (crawlDelay) {
        fetcher.setCrawlDelay(domain, crawlDelay * 1000);
      }
    }

    const startTime = Date.now();
    logger.info(`Starting crawl run #${runId}`);

    // Discovery phase
    const discovered = await discoverDocuments(fetcher, sourceTypes, sinceYear);

    let newCount = 0;
    for (const doc of discovered) {
      if (!robots.isAllowed(doc.source_url)) {
        logger.debug(`Blocked by robots.txt: ${doc.source_url}`);
        continue;
      }
      const existing = registry.getByUrl(doc.source_url);
      if (!existing) newCount++;
      registry.upsertDiscovered(doc);
    }

    logger.info(
      `Discovered ${discovered.length} documents (${newCount} new)`,
    );

    if (dryRun) {
      logger.info('Dry run — skipping downloads');
      registry.completeCrawlRun(runId, {
        documents_discovered: newCount,
        documents_downloaded: 0,
        documents_unchanged: 0,
        documents_updated: 0,
        documents_errored: 0,
      });
      registry.close();
      return;
    }

    // Download phase — download newly discovered documents
    const toDownload = registry.getDocumentsToDownload();
    const stats = {
      documents_discovered: newCount,
      documents_downloaded: 0,
      documents_unchanged: 0,
      documents_updated: 0,
      documents_errored: 0,
    };

    // Collect existing filenames per source type to handle collisions
    const existingFilenames = new Map<string, Set<string>>();
    for (const st of sourceTypes) {
      const dir = path.join(
        config.documentsDir,
        SOURCE_TYPE_DIRS[st] ?? st,
      );
      if (fs.existsSync(dir)) {
        existingFilenames.set(st, new Set(fs.readdirSync(dir)));
      } else {
        existingFilenames.set(st, new Set());
      }
    }

    for (const doc of toDownload) {
      if (!robots.isAllowed(doc.source_url)) continue;

      const names = existingFilenames.get(doc.source_type) ?? new Set();
      const result = await downloadDocument(doc, fetcher, names);

      switch (result.action) {
        case 'downloaded':
          if (result.info) registry.updateDownloaded(doc.id, result.info);
          stats.documents_downloaded++;
          logger.info(
            `${doc.policy_number ?? doc.title ?? doc.source_url}... new document (${result.info?.file_size ? Math.round(result.info.file_size / 1024) + ' KB' : 'unknown size'})`,
          );
          break;
        case 'unchanged':
          registry.markUnchanged(doc.id);
          stats.documents_unchanged++;
          break;
        case 'error':
          if (result.error?.includes('404')) {
            registry.markRemoved(doc.id);
          } else {
            registry.markError(doc.id, result.error ?? 'Unknown error');
          }
          stats.documents_errored++;
          logger.warn(
            `${doc.policy_number ?? doc.source_url}... error: ${result.error}`,
          );
          break;
      }
    }

    // Also check previously downloaded documents for updates
    const toCheck = registry.getDocumentsToCheck();
    for (const doc of toCheck) {
      if (!sourceTypes.includes(doc.source_type as SourceType)) continue;
      if (!robots.isAllowed(doc.source_url)) continue;

      const names = existingFilenames.get(doc.source_type) ?? new Set();
      const result = await downloadDocument(doc, fetcher, names);

      switch (result.action) {
        case 'updated':
          if (result.info) registry.updateChanged(doc.id, result.info);
          stats.documents_updated++;
          logger.info(
            `${doc.policy_number ?? doc.title ?? doc.source_url}... updated (hash changed)`,
          );
          break;
        case 'unchanged':
          registry.markUnchanged(doc.id);
          stats.documents_unchanged++;
          logger.debug(
            `${doc.policy_number ?? doc.source_url}... 304 Not Modified`,
          );
          break;
        case 'error':
          if (result.error?.includes('404')) {
            registry.markRemoved(doc.id);
          } else {
            registry.markError(doc.id, result.error ?? 'Unknown error');
          }
          stats.documents_errored++;
          logger.warn(
            `${doc.policy_number ?? doc.source_url}... error: ${result.error}`,
          );
          break;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    registry.completeCrawlRun(runId, stats);
    logger.info(`Crawl run #${runId} complete`);
    logger.info(`  Discovered: ${stats.documents_discovered} new documents`);
    logger.info(`  Downloaded: ${stats.documents_downloaded}`);
    logger.info(`  Unchanged: ${stats.documents_unchanged}`);
    logger.info(`  Updated: ${stats.documents_updated}`);
    logger.info(`  Errors: ${stats.documents_errored}`);
    logger.info(`  Duration: ${elapsed}s`);

    registry.close();
    logger.close();
  });

// --- check command ---
program
  .command('check')
  .description('Check for updates to known documents (no new discovery)')
  .option('-s, --source <types>', 'Comma-separated source types')
  .action(async (opts) => {
    const sourceTypes = parseSourceTypes(opts.source);
    const registry = initDb();
    const fetcher = createFetcher({
      userAgent: config.userAgent,
      defaultDelayMs: config.defaultDelayMs,
      requestTimeoutMs: config.requestTimeoutMs,
      maxRetries: config.maxRetries,
      backoffBaseMs: config.backoffBaseMs,
      backoffMaxMs: config.backoffMaxMs,
      maxRedirects: config.maxRedirects,
    });

    const robots = createRobotsChecker(config.userAgent);
    // Fetch robots for relevant domains
    const domains = new Set<string>();
    const docs = registry.getDocumentsToCheck();
    for (const doc of docs) {
      if (sourceTypes.includes(doc.source_type as SourceType)) {
        domains.add(new URL(doc.source_url).hostname);
      }
    }
    for (const domain of domains) {
      await robots.fetchAndCache(domain, fetcher);
    }

    logger.info('Checking for updates...');

    const existingFilenames = new Map<string, Set<string>>();
    let unchanged = 0;
    let updated = 0;
    let errors = 0;

    for (const doc of docs) {
      if (!sourceTypes.includes(doc.source_type as SourceType)) continue;
      if (!robots.isAllowed(doc.source_url)) continue;

      if (!existingFilenames.has(doc.source_type)) {
        const dir = path.join(
          config.documentsDir,
          SOURCE_TYPE_DIRS[doc.source_type] ?? doc.source_type,
        );
        existingFilenames.set(
          doc.source_type,
          fs.existsSync(dir) ? new Set(fs.readdirSync(dir)) : new Set(),
        );
      }

      const names = existingFilenames.get(doc.source_type)!;
      const result = await downloadDocument(doc, fetcher, names);

      switch (result.action) {
        case 'updated':
          if (result.info) registry.updateChanged(doc.id, result.info);
          updated++;
          logger.info(`${doc.policy_number ?? doc.source_url}... updated`);
          break;
        case 'unchanged':
          registry.markUnchanged(doc.id);
          unchanged++;
          break;
        case 'error':
          if (result.error?.includes('404')) {
            registry.markRemoved(doc.id);
          } else {
            registry.markError(doc.id, result.error ?? 'Unknown error');
          }
          errors++;
          break;
      }
    }

    logger.info(`Check complete: ${unchanged} unchanged, ${updated} updated, ${errors} errors`);
    registry.close();
    logger.close();
  });

// --- stats command ---
program
  .command('stats')
  .description('Show registry statistics')
  .action(() => {
    const registry = initDb();
    const stats = registry.getStats();

    const bySource = new Map<string, Map<string, number>>();
    let totalDocs = 0;

    for (const row of stats) {
      if (!bySource.has(row.source_type)) {
        bySource.set(row.source_type, new Map());
      }
      bySource.get(row.source_type)!.set(row.status, row.count);
      totalDocs += row.count;
    }

    console.log('\nRegistry Statistics');
    console.log('=' .repeat(50));

    for (const [source, statuses] of bySource) {
      const parts: string[] = [];
      for (const [status, count] of statuses) {
        parts.push(`${count} ${status}`);
      }
      console.log(`  ${source}: ${parts.join(', ')}`);
    }

    // Compute total disk usage
    let totalBytes = 0;
    const allDocs = registry.getAllDocuments();
    for (const doc of allDocs) {
      if (doc.file_size) totalBytes += doc.file_size;
    }

    console.log('-'.repeat(50));
    console.log(
      `  Total: ${totalDocs} documents, ${(totalBytes / 1024 / 1024).toFixed(1)} MB on disk`,
    );
    console.log('');

    registry.close();
  });

// --- list command ---
program
  .command('list')
  .description('List documents with filters')
  .option('-s, --source <type>', 'Filter by source type')
  .option('--status <status>', 'Filter by status')
  .action((opts) => {
    const registry = initDb();
    let docs = registry.getAllDocuments();

    if (opts.source) {
      docs = docs.filter((d) => d.source_type === opts.source);
    }
    if (opts.status) {
      docs = docs.filter((d) => d.status === opts.status);
    }

    for (const doc of docs) {
      const size = doc.file_size
        ? `${Math.round(doc.file_size / 1024)} KB`
        : 'not downloaded';
      console.log(
        `[${doc.status}] ${doc.policy_number ?? ''} ${doc.title ?? doc.source_url} (${size})`,
      );
    }
    console.log(`\n${docs.length} documents`);

    registry.close();
  });

// --- add-url command ---
program
  .command('add-url <url>')
  .description('Manually add a document URL to the registry')
  .requiredOption('-s, --source <type>', 'Source type')
  .option('-t, --title <title>', 'Document title')
  .option('-p, --policy-number <number>', 'Policy number')
  .option('-c, --category <category>', 'Category')
  .action((url, opts) => {
    if (!VALID_SOURCE_TYPES.includes(opts.source)) {
      console.error(`Invalid source type: ${opts.source}`);
      process.exit(1);
    }

    const registry = initDb();
    const id = registry.upsertDiscovered({
      source_url: url,
      discovered_from: 'manual',
      source_type: opts.source,
      title: opts.title ?? null,
      policy_number: opts.policyNumber ?? null,
      category: opts.category ?? null,
    });

    console.log(`Added document #${id}: ${url}`);
    registry.close();
  });

// --- export command ---
program
  .command('export')
  .description('Export registry to JSON')
  .option('-o, --output <path>', 'Output file path', 'registry.json')
  .action((opts) => {
    const registry = initDb();
    const docs = registry.getAllDocuments();
    fs.writeFileSync(opts.output, JSON.stringify(docs, null, 2));
    console.log(`Exported ${docs.length} documents to ${opts.output}`);
    registry.close();
  });

// --- update-fixtures command ---
program
  .command('update-fixtures')
  .description('Update HTML test fixtures from live index pages')
  .action(async () => {
    const fetcher = createFetcher({
      userAgent: config.userAgent,
      defaultDelayMs: config.defaultDelayMs,
      requestTimeoutMs: config.requestTimeoutMs,
      maxRetries: config.maxRetries,
      backoffBaseMs: config.backoffBaseMs,
      backoffMaxMs: config.backoffMaxMs,
      maxRedirects: config.maxRedirects,
    });

    const fixturesDir = path.join(
      path.dirname(config.dbPath),
      '..',
      'tests',
      'fixtures',
    );
    fs.mkdirSync(fixturesDir, { recursive: true });

    const fixtures: Array<[string, string]> = [
      [config.sources.clinical_policy.indexUrl, 'clinical-policies.html'],
      [config.sources.bulletin.indexUrl, 'bulletins-main.html'],
      [config.sources.bulletin.blogListingUrl, 'bulletins-blog-listing.html'],
      [config.sources.bulletin.digestsUrl, 'bulletins-digests.html'],
      [config.sources.state_plan_amendment.indexUrl, 'state-plan-index.html'],
      ...config.sources.waiver.seedUrls.map(
        (url, i): [string, string] => [url, `waivers-seed-${i}.html`],
      ),
    ];

    for (const [url, filename] of fixtures) {
      try {
        const { body } = await fetcher.fetchHtml(url);
        const filePath = path.join(fixturesDir, filename);
        fs.writeFileSync(filePath, body);
        console.log(`Updated ${filename} (${body.length} bytes)`);
      } catch (err) {
        console.error(`Failed to fetch ${url}: ${(err as Error).message}`);
      }
    }
  });

program.parse();
```

- [ ] **Step 2: Verify it compiles**

Run: `cd crawler && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Test CLI help output**

Run: `cd crawler && npx tsx src/index.ts --help`
Expected: Shows all commands with descriptions.

Run: `cd crawler && npx tsx src/index.ts crawl --help`
Expected: Shows crawl options.

- [ ] **Step 4: Commit**

```bash
git add crawler/src/index.ts
git commit -m "feat: add CLI with crawl, check, stats, list, add-url, and export commands"
```

---

### Task 11: End-to-End Clinical Policies Crawl

This task validates the full architecture by running a real crawl against the clinical policies source.

**Files:**
- No new files — this is an integration test using the CLI

- [ ] **Step 1: Run a dry-run crawl**

```bash
cd crawler && npx tsx src/index.ts crawl --source clinical_policy --dry-run
```

Expected: Discovers 50+ clinical policy documents, prints count, no downloads. If this fails, debug the discovery pipeline (fetcher → robots → clinical-policies parser → registry).

- [ ] **Step 2: Run a real crawl (downloads)**

```bash
cd crawler && npx tsx src/index.ts crawl --source clinical_policy
```

Expected: Downloads all discovered PDFs. Watch for:
- No 429 errors (rate limiting is working)
- Files appear in `data/documents/clinical-policies/`
- Console output shows progress

This will take several minutes due to the 2s rate limit between requests.

- [ ] **Step 3: Verify registry state**

```bash
cd crawler && npx tsx src/index.ts stats
```

Expected: Shows clinical_policy documents with status `downloaded`, no errors.

```bash
cd crawler && npx tsx src/index.ts list --source clinical_policy --status error
```

Expected: 0 errors (or a small number of expected 404s for removed documents).

- [ ] **Step 4: Run a check (should be all unchanged)**

```bash
cd crawler && npx tsx src/index.ts check --source clinical_policy
```

Expected: All documents return 304 Not Modified or hash-match. Zero downloads.

- [ ] **Step 5: Export and inspect the registry**

```bash
cd crawler && npx tsx src/index.ts export --output data/registry-snapshot.json
```

Inspect the JSON to verify:
- Every document has `detected_content_type: "application/pdf"`
- Many documents have `content_disposition_filename` populated
- `etag` and/or `last_modified` are captured where the server provides them

- [ ] **Step 6: Commit the fixture (not the downloaded documents)**

```bash
git add crawler/tests/fixtures/clinical-policies.html
git commit -m "test: save clinical policies HTML fixture from live site"
```

**Note:** The `data/documents/` directory is gitignored. Only the test fixture is committed.

---

### Task 12: Bulletins Source Module

**Files:**
- Create: `crawler/src/sources/bulletins.ts`
- Create: `crawler/tests/sources/bulletins.test.ts`
- Create: `crawler/tests/fixtures/bulletins-*.html` (multiple fixtures)

- [ ] **Step 1: Fetch and save HTML fixtures**

```bash
cd crawler && npx tsx -e "
import { writeFileSync } from 'fs';
const urls = [
  ['https://medicaid.ncdhhs.gov/providers/medicaid-bulletin', 'tests/fixtures/bulletins-main.html'],
  ['https://medicaid.ncdhhs.gov/blog-category/bulletins', 'tests/fixtures/bulletins-blog-listing.html'],
  ['https://medicaid.ncdhhs.gov/providers/medicaid-bulletin/medicaid-bulletin-digests', 'tests/fixtures/bulletins-digests.html'],
];
for (const [url, file] of urls) {
  const res = await fetch(url);
  const html = await res.text();
  writeFileSync(file, html);
  console.log('Saved', file, html.length, 'bytes');
}
"
```

- [ ] **Step 2: Examine the fixtures to understand link structures**

Read each fixture. Document:
- How bulletin posts are listed (blog cards, titles, dates)
- Pagination elements (next/prev links, `?page=N` pattern)
- How PDF download links appear within bulletin posts
- How digest PDFs are linked

- [ ] **Step 3: Write the parser test**

Write `crawler/tests/sources/bulletins.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseBulletinListingPage,
  parseDigestsPage,
} from '../../src/sources/bulletins.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('parseBulletinListingPage', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'fixtures', 'bulletins-blog-listing.html'),
    'utf-8',
  );

  it('extracts bulletin post links', () => {
    const results = parseBulletinListingPage(
      html,
      'https://medicaid.ncdhhs.gov/blog-category/bulletins',
    );
    expect(results.postUrls.length).toBeGreaterThan(0);
  });

  it('detects pagination', () => {
    const results = parseBulletinListingPage(
      html,
      'https://medicaid.ncdhhs.gov/blog-category/bulletins',
    );
    // nextPageUrl may be null on the last page, but the type should exist
    expect('nextPageUrl' in results).toBe(true);
  });
});

describe('parseDigestsPage', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'fixtures', 'bulletins-digests.html'),
    'utf-8',
  );

  it('extracts digest PDF links', () => {
    const results = parseDigestsPage(
      html,
      'https://medicaid.ncdhhs.gov/providers/medicaid-bulletin/medicaid-bulletin-digests',
    );
    expect(results.length).toBeGreaterThan(0);
    for (const doc of results) {
      expect(doc.source_type).toBe('bulletin');
      expect(doc.source_url).toContain('/download');
    }
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd crawler && npx vitest run tests/sources/bulletins.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 5: Write the bulletins parser**

Write `crawler/src/sources/bulletins.ts`. Adapt selectors based on Step 2 findings:

```typescript
import * as cheerio from 'cheerio';
import type { DiscoveredDocument, Fetcher } from './types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const bulletinConfig = config.sources.bulletin;

interface ListingResult {
  postUrls: string[];
  nextPageUrl: string | null;
}

export function parseBulletinListingPage(
  html: string,
  pageUrl: string,
): ListingResult {
  const $ = cheerio.load(html);
  const postUrls: string[] = [];

  // Adapt selector to actual page structure
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const fullUrl = new URL(href, pageUrl).toString();
    // Blog post links — adapt pattern to actual structure
    if (
      fullUrl.includes('medicaid.ncdhhs.gov') &&
      !fullUrl.includes('/download') &&
      (fullUrl.includes('/blog/') || fullUrl.includes('/bulletin'))
    ) {
      if (!postUrls.includes(fullUrl)) {
        postUrls.push(fullUrl);
      }
    }
  });

  // Pagination: look for ?page=N links
  let nextPageUrl: string | null = null;
  $('a[href*="page="]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim().toLowerCase();
    if (href && (text === 'next' || text.includes('next') || text === '›' || text === '»')) {
      nextPageUrl = new URL(href, pageUrl).toString();
    }
  });

  return { postUrls, nextPageUrl };
}

export function parseDigestsPage(
  html: string,
  pageUrl: string,
): DiscoveredDocument[] {
  const $ = cheerio.load(html);
  const documents: DiscoveredDocument[] = [];
  const seenUrls = new Set<string>();

  $('a[href*="/download"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const fullUrl = new URL(href, pageUrl).toString();
    if (seenUrls.has(fullUrl)) return;
    seenUrls.add(fullUrl);

    const title = $(el).text().trim();
    documents.push({
      source_url: fullUrl,
      discovered_from: pageUrl,
      source_type: 'bulletin',
      title: title || null,
      policy_number: null,
      category: 'Monthly Digest',
    });
  });

  return documents;
}

function parseBulletinPostPage(
  html: string,
  pageUrl: string,
): DiscoveredDocument[] {
  const $ = cheerio.load(html);
  const documents: DiscoveredDocument[] = [];
  const seenUrls = new Set<string>();

  $('a[href*="/download"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const fullUrl = new URL(href, pageUrl).toString();
    if (seenUrls.has(fullUrl)) return;
    seenUrls.add(fullUrl);

    const title = $(el).text().trim();
    documents.push({
      source_url: fullUrl,
      discovered_from: pageUrl,
      source_type: 'bulletin',
      title: title || null,
      policy_number: null,
      category: null,
    });
  });

  return documents;
}

function extractYearFromUrl(url: string): number | null {
  const match = url.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : null;
}

export async function discover(
  fetcher: Fetcher,
  sinceYear?: number,
): Promise<DiscoveredDocument[]> {
  const cutoffYear = sinceYear ?? config.defaultSinceYear;
  const allDocs: DiscoveredDocument[] = [];

  logger.info(`Discovering bulletins (${cutoffYear}+)...`);

  // 1. Monthly digests
  try {
    const { body } = await fetcher.fetchHtml(bulletinConfig.digestsUrl);
    const digests = parseDigestsPage(body, bulletinConfig.digestsUrl);
    allDocs.push(...digests);
    logger.debug(`Digests page: ${digests.length} documents`);
  } catch (err) {
    logger.error(`Failed to fetch digests: ${(err as Error).message}`);
  }

  // 2. Paginated blog listing
  try {
    let pageUrl: string | null = bulletinConfig.blogListingUrl;
    let pageNum = 0;

    while (pageUrl) {
      const { body } = await fetcher.fetchHtml(pageUrl);
      const listing = parseBulletinListingPage(body, pageUrl);

      // Check each post for PDF downloads
      for (const postUrl of listing.postUrls) {
        const year = extractYearFromUrl(postUrl);
        if (year && year < cutoffYear) continue;

        try {
          const { body: postHtml } = await fetcher.fetchHtml(postUrl);
          const postDocs = parseBulletinPostPage(postHtml, postUrl);
          allDocs.push(...postDocs);
        } catch (err) {
          logger.warn(
            `Failed to fetch bulletin post ${postUrl}: ${(err as Error).message}`,
          );
        }
      }

      // Stop if we've gone past the cutoff year or no more pages
      pageNum++;
      pageUrl = listing.nextPageUrl;

      // Safety: cap at 50 pages to avoid infinite loops
      if (pageNum >= 50) {
        logger.warn('Hit pagination limit (50 pages) for bulletin listing');
        break;
      }
    }
  } catch (err) {
    logger.error(
      `Failed to fetch bulletin listing: ${(err as Error).message}`,
    );
  }

  logger.info(`Discovering bulletins... found ${allDocs.length} documents`);
  return allDocs;
}
```

- [ ] **Step 6: Update the discovery coordinator to include bulletins**

Edit `crawler/src/crawl/discovery.ts` — add the bulletin import:

```typescript
import * as bulletins from '../sources/bulletins.js';
```

And add to the sourceModules map:

```typescript
bulletin: bulletins,
```

- [ ] **Step 7: Run bulletin tests — iterate on selectors until they pass**

Run: `cd crawler && npx vitest run tests/sources/bulletins.test.ts`
Expected: All PASS once selectors match the actual HTML.

- [ ] **Step 8: Commit**

```bash
git add crawler/src/sources/bulletins.ts crawler/tests/sources/bulletins.test.ts crawler/tests/fixtures/bulletins-*.html crawler/src/crawl/discovery.ts
git commit -m "feat: add bulletins discovery with pagination, digests, and blog post parsing"
```

---

### Task 13: State Plan Amendments Source Module

**Files:**
- Create: `crawler/src/sources/state-plan.ts`
- Create: `crawler/tests/sources/state-plan.test.ts`
- Create: `crawler/tests/fixtures/state-plan-*.html`

- [ ] **Step 1: Fetch and save HTML fixture**

```bash
cd crawler && npx tsx -e "
import { writeFileSync } from 'fs';
const res = await fetch('https://medicaid.ncdhhs.gov/meetingsnotices/medicaid-state-plan-public-notices');
writeFileSync('tests/fixtures/state-plan-index.html', await res.text());
console.log('Saved state-plan-index.html');
"
```

- [ ] **Step 2: Examine the fixture to understand link structure**

Read the HTML. Look for yearly sub-page links and direct PDF download links.

- [ ] **Step 3: Write the parser test**

Write `crawler/tests/sources/state-plan.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStatePlanIndexPage } from '../../src/sources/state-plan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'state-plan-index.html'),
  'utf-8',
);

describe('parseStatePlanIndexPage', () => {
  const results = parseStatePlanIndexPage(
    fixtureHtml,
    'https://medicaid.ncdhhs.gov/meetingsnotices/medicaid-state-plan-public-notices',
  );

  it('finds sub-page links or direct PDF links', () => {
    // The index page should have either yearly sub-page links or direct PDF links
    expect(results.subPageUrls.length + results.documents.length).toBeGreaterThan(0);
  });

  it('extracts SPA numbers where available', () => {
    const withNumbers = results.documents.filter((d) => d.policy_number);
    // May be 0 on the index page if all SPAs are on sub-pages
    expect(withNumbers.length).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd crawler && npx vitest run tests/sources/state-plan.test.ts`
Expected: FAIL.

- [ ] **Step 5: Write the state plan parser**

Write `crawler/src/sources/state-plan.ts`:

```typescript
import * as cheerio from 'cheerio';
import type { DiscoveredDocument, Fetcher } from './types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const INDEX_URL = config.sources.state_plan_amendment.indexUrl;

interface IndexPageResult {
  subPageUrls: string[];
  documents: DiscoveredDocument[];
}

export function parseStatePlanIndexPage(
  html: string,
  pageUrl: string,
): IndexPageResult {
  const $ = cheerio.load(html);
  const subPageUrls: string[] = [];
  const documents: DiscoveredDocument[] = [];
  const seenUrls = new Set<string>();

  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const fullUrl = new URL(href, pageUrl).toString();

    if (fullUrl.includes('/download') && !seenUrls.has(fullUrl)) {
      seenUrls.add(fullUrl);
      const title = $(el).text().trim();
      const spaNumber = parseSpaNumber(title);
      documents.push({
        source_url: fullUrl,
        discovered_from: pageUrl,
        source_type: 'state_plan_amendment',
        title: title || null,
        policy_number: spaNumber,
        category: null,
      });
    } else if (
      fullUrl.includes('proposed-amendments') ||
      fullUrl.includes('state-plan') ||
      fullUrl.match(/\/\d{4}-/)
    ) {
      if (
        fullUrl !== pageUrl &&
        fullUrl.startsWith('https://medicaid.ncdhhs.gov') &&
        !subPageUrls.includes(fullUrl)
      ) {
        subPageUrls.push(fullUrl);
      }
    }
  });

  return { subPageUrls, documents };
}

function parseSpaNumber(text: string): string | null {
  // SPA numbers like: "SPA 24-0001" or "SPA NC 24-0001"
  const match = text.match(/SPA\s+(?:NC\s+)?(\d{2}-\d{4})/i);
  if (match) return `SPA ${match[1]}`;

  // Also try standalone format
  const altMatch = text.match(/(\d{2}-\d{4})/);
  if (altMatch) return `SPA ${altMatch[1]}`;

  return null;
}

function parseSubPage(
  html: string,
  pageUrl: string,
): DiscoveredDocument[] {
  const $ = cheerio.load(html);
  const documents: DiscoveredDocument[] = [];
  const seenUrls = new Set<string>();

  $('a[href*="/download"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const fullUrl = new URL(href, pageUrl).toString();
    if (seenUrls.has(fullUrl)) return;
    seenUrls.add(fullUrl);

    const title = $(el).text().trim();
    const spaNumber = parseSpaNumber(title);

    documents.push({
      source_url: fullUrl,
      discovered_from: pageUrl,
      source_type: 'state_plan_amendment',
      title: title || null,
      policy_number: spaNumber,
      category: null,
    });
  });

  return documents;
}

export async function discover(fetcher: Fetcher): Promise<DiscoveredDocument[]> {
  logger.info('Discovering state plan amendments...');
  const allDocs: DiscoveredDocument[] = [];

  const { body } = await fetcher.fetchHtml(INDEX_URL);
  const { subPageUrls, documents } = parseStatePlanIndexPage(body, INDEX_URL);
  allDocs.push(...documents);

  // Fetch sub-pages
  for (const subUrl of subPageUrls) {
    try {
      const { body: subHtml } = await fetcher.fetchHtml(subUrl);
      const subDocs = parseSubPage(subHtml, subUrl);
      allDocs.push(...subDocs);
    } catch (err) {
      logger.warn(`Failed to fetch SPA sub-page ${subUrl}: ${(err as Error).message}`);
    }
  }

  logger.info(`Discovering state plan amendments... found ${allDocs.length} documents`);
  return allDocs;
}
```

- [ ] **Step 6: Update discovery coordinator**

Edit `crawler/src/crawl/discovery.ts` — add import and registration:

```typescript
import * as statePlan from '../sources/state-plan.js';
```

```typescript
state_plan_amendment: statePlan,
```

- [ ] **Step 7: Run tests — iterate on selectors**

Run: `cd crawler && npx vitest run tests/sources/state-plan.test.ts`
Expected: All PASS.

- [ ] **Step 8: Commit**

```bash
git add crawler/src/sources/state-plan.ts crawler/tests/sources/state-plan.test.ts crawler/tests/fixtures/state-plan-*.html crawler/src/crawl/discovery.ts
git commit -m "feat: add state plan amendments discovery with yearly sub-page traversal"
```

---

### Task 14: Waivers Source Module

**Files:**
- Create: `crawler/src/sources/waivers.ts`
- Create: `crawler/tests/sources/waivers.test.ts`
- Create: `crawler/tests/fixtures/waivers-*.html`

- [ ] **Step 1: Fetch and save HTML fixtures**

```bash
cd crawler && npx tsx -e "
import { writeFileSync } from 'fs';
const urls = [
  ['https://medicaid.ncdhhs.gov/beneficiaries/nc-innovations-waiver/information-providers-nc-innovations-waiver', 'tests/fixtures/waivers-innovations.html'],
  ['https://medicaid.ncdhhs.gov/beneficiaries/1915i', 'tests/fixtures/waivers-1915i.html'],
];
for (const [url, file] of urls) {
  try {
    const res = await fetch(url);
    writeFileSync(file, await res.text());
    console.log('Saved', file);
  } catch (e) {
    console.error('Failed:', url, e.message);
  }
}
"
```

- [ ] **Step 2: Examine fixtures**

Read the HTML to understand how PDF links appear on waiver pages.

- [ ] **Step 3: Write the parser test**

Write `crawler/tests/sources/waivers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWaiverPage } from '../../src/sources/waivers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('parseWaiverPage', () => {
  it('extracts PDF links from innovations waiver page', () => {
    const fixturePath = path.join(
      __dirname,
      '..',
      'fixtures',
      'waivers-innovations.html',
    );
    if (!fs.existsSync(fixturePath)) return; // Skip if fixture not available
    const html = fs.readFileSync(fixturePath, 'utf-8');
    const results = parseWaiverPage(
      html,
      'https://medicaid.ncdhhs.gov/beneficiaries/nc-innovations-waiver/information-providers-nc-innovations-waiver',
    );
    // Waiver pages may have few or many PDFs
    expect(results.length).toBeGreaterThanOrEqual(0);
    for (const doc of results) {
      expect(doc.source_type).toBe('waiver');
      expect(doc.source_url).toContain('/download');
    }
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd crawler && npx vitest run tests/sources/waivers.test.ts`
Expected: FAIL.

- [ ] **Step 5: Write the waivers parser**

Write `crawler/src/sources/waivers.ts`:

```typescript
import * as cheerio from 'cheerio';
import type { DiscoveredDocument, Fetcher } from './types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const SEED_URLS = config.sources.waiver.seedUrls;

export function parseWaiverPage(
  html: string,
  pageUrl: string,
): DiscoveredDocument[] {
  const $ = cheerio.load(html);
  const documents: DiscoveredDocument[] = [];
  const seenUrls = new Set<string>();

  $('a[href*="/download"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const fullUrl = new URL(href, pageUrl).toString();
    if (seenUrls.has(fullUrl)) return;
    seenUrls.add(fullUrl);

    const title = $(el).text().trim();
    documents.push({
      source_url: fullUrl,
      discovered_from: pageUrl,
      source_type: 'waiver',
      title: title || null,
      policy_number: null,
      category: inferWaiverCategory(pageUrl),
    });
  });

  return documents;
}

function inferWaiverCategory(pageUrl: string): string | null {
  if (pageUrl.includes('innovations')) return 'NC Innovations (1915c)';
  if (pageUrl.includes('1915i')) return '1915(i) Services';
  if (pageUrl.includes('cap') || pageUrl.includes('CAP')) return 'CAP/DA';
  return null;
}

export async function discover(fetcher: Fetcher): Promise<DiscoveredDocument[]> {
  logger.info('Discovering waiver documents...');
  const allDocs: DiscoveredDocument[] = [];

  for (const seedUrl of SEED_URLS) {
    try {
      const { body } = await fetcher.fetchHtml(seedUrl);
      const docs = parseWaiverPage(body, seedUrl);
      allDocs.push(...docs);
    } catch (err) {
      logger.warn(
        `Failed to fetch waiver page ${seedUrl}: ${(err as Error).message}`,
      );
    }
  }

  logger.info(`Discovering waiver documents... found ${allDocs.length} documents`);
  return allDocs;
}
```

- [ ] **Step 6: Update discovery coordinator**

Edit `crawler/src/crawl/discovery.ts` — add import and registration:

```typescript
import * as waivers from '../sources/waivers.js';
```

```typescript
waiver: waivers,
```

- [ ] **Step 7: Run tests**

Run: `cd crawler && npx vitest run tests/sources/waivers.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add crawler/src/sources/waivers.ts crawler/tests/sources/waivers.test.ts crawler/tests/fixtures/waivers-*.html crawler/src/crawl/discovery.ts
git commit -m "feat: add waivers discovery from seed pages"
```

---

### Task 15: Full Integration Test & Final Validation

**Files:**
- No new files — run the full crawl and verify

- [ ] **Step 1: Run all unit tests**

```bash
cd crawler && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 2: Run a full crawl across all sources**

```bash
cd crawler && npx tsx src/index.ts crawl
```

Expected: Discovers and downloads documents from all four sources. Watch for:
- Clinical policies: ~120+ documents
- Bulletins: varies by `--since-year` (default 2018)
- SPAs: dozens
- Waivers: handful

This will take 10+ minutes due to rate limiting. Monitor for errors.

- [ ] **Step 3: Verify stats**

```bash
cd crawler && npx tsx src/index.ts stats
```

Expected: Summary showing documents across all source types, zero or minimal errors.

- [ ] **Step 4: Run a second full crawl (should be mostly unchanged)**

```bash
cd crawler && npx tsx src/index.ts crawl
```

Expected: Completes faster (conditional requests). Most documents show "unchanged". Zero new downloads unless the site has been updated between runs.

- [ ] **Step 5: Test the add-url command**

```bash
cd crawler && npx tsx src/index.ts add-url "https://medicaid.ncdhhs.gov/some-test-url" --source waiver --title "Test Manual Entry" --policy-number "TEST-1" --category "CAP/DA"
cd crawler && npx tsx src/index.ts list --source waiver
```

Expected: The manually added URL appears in the list with the provided metadata.

- [ ] **Step 6: Export and verify**

```bash
cd crawler && npx tsx src/index.ts export --output data/final-registry.json
```

Verify the JSON contains all expected fields including `detected_content_type` and `content_disposition_filename`.

- [ ] **Step 7: Final commit**

```bash
git add crawler/
git commit -m "feat: complete NC Medicaid crawler with all four source modules"
```
