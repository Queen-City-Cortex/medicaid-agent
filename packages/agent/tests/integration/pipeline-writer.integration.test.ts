/**
 * What the pipeline writes, read back through the agent's retrieval tools.
 *
 * Opt-in: set `RUN_NEO4J_INTEGRATION=1`.
 *
 * The other real-Neo4j suites seed with hand-written CREATE statements, so a
 * property renamed on one side passes both. Here the graph is seeded by
 * `packages/pipeline/tests/support/seed_reader_contract.py`, which runs the
 * committed Docling fixture through the pipeline's own `load_document` under a
 * test-only document id, policy number and source URL, and removes it again.
 * It needs the pipeline virtualenv (`npm run setup -w @nc-medicaid/pipeline`,
 * which CI runs before any test step).
 *
 * Covered: reads by id, by policy number, by structure, and the full-text leg
 * of search. Not covered: the vector legs, chunk retrieval and
 * resolveAnswerFrame, which need section embeddings the seed does not create.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@mastra/core/tools', () => ({
  createTool: (config: any) => config,
}));

import { closeDriver } from '../../src/neo4j.js';
import { lookupPolicy } from '../../src/tools/lookup.js';
import { getDocument, getSection, getSectionContext } from '../../src/tools/read.js';
import { searchSections } from '../../src/tools/search.js';
import { runTool } from '../helpers/run-tool.js';

const ENABLED = process.env.RUN_NEO4J_INTEGRATION === '1';
// Written to stderr directly: Vitest drops console output from a file in which
// no test runs, and a silent skip here would look like coverage.
if (!ENABLED) {
  process.stderr.write(
    'SKIPPED pipeline-writer.integration.test.ts: set RUN_NEO4J_INTEGRATION=1 (with a disposable Neo4j and the ' +
    'pipeline virtualenv) to load a document through the pipeline and read it back through the agent tools.\n',
  );
}
const integration = ENABLED ? describe : describe.skip;

const PIPELINE_ROOT = fileURLToPath(new URL('../../../pipeline/', import.meta.url));
const PYTHON = `${PIPELINE_ROOT}.venv/bin/python`;
const SEED_SCRIPT = 'tests/support/seed_reader_contract.py';
// The identity the seed script refuses to run without.
const ID_PREFIX = 'test:reader-contract:';

interface Seeded {
  document_id: string;
  section_count: number;
  document_type: string;
  policy_number: string;
  title: string;
  source_url: string;
  authority_tier: string;
  answer_role: string;
}

/** Runs the seed script and returns the JSON line it prints. */
function runSeedScript(args: string[]): Promise<Record<string, unknown>> {
  if (!existsSync(PYTHON)) {
    return Promise.reject(new Error(`${PYTHON} is missing: run \`npm run setup -w @nc-medicaid/pipeline\` first`));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [SEED_SCRIPT, ...args], {
      cwd: PIPELINE_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('close', (code) => {
      const line = stdout.split('\n').reverse().find(candidate => candidate.trim().startsWith('{'));
      if (code !== 0 || !line) {
        reject(new Error(`${SEED_SCRIPT} ${args.join(' ')} exited ${code}:\n${stdout}\n${stderr}`));
        return;
      }
      resolve(JSON.parse(line));
    });
  });
}

integration('a document loaded by the pipeline, read through the agent tools', () => {
  let seeded: Seeded;
  let seedError: unknown = null;
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    // Kept, not thrown, so afterAll still removes whatever a failed load wrote.
    try {
      seeded = await runSeedScript([]) as unknown as Seeded;
    } catch (error) {
      seedError = error;
    }
  }, 180_000);

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    try {
      await runSeedScript(['--cleanup']);
    } finally {
      await closeDriver();
    }
  }, 180_000);

  /** The seeded document through getDocument; fails with the seed's own error. */
  async function readDocument() {
    if (seedError) throw seedError;
    const { document } = await runTool(getDocument, { documentId: seeded.document_id });
    if (!document) throw new Error(`getDocument found no ${seeded.document_id}`);
    return document;
  }

  it('reads the document with its type, source link and section list', async () => {
    const document = await readDocument();

    expect(seeded.document_id.startsWith(ID_PREFIX)).toBe(true);
    expect(document).toMatchObject({
      id: seeded.document_id,
      title: seeded.title,
      documentType: 'clinical_policy',
      policyNumber: seeded.policy_number,
      url: seeded.source_url,
      citationLink: `[${seeded.title}](${seeded.source_url})`,
      status: 'current',
      authorityTier: seeded.authority_tier,
      answerRole: seeded.answer_role,
      sourceFormat: 'pdf',
      answerReady: true,
      retrievalReady: true,
    });
    expect(seeded.document_type).toBe('clinical_policy');
    // The list holds only sections with text; the loader also writes bare headings.
    expect(document.sections.length).toBeGreaterThan(0);
    expect(document.sections.length).toBeLessThanOrEqual(seeded.section_count);
    expect(document.sectionCount).toBe(document.sections.length);
    for (const section of document.sections) {
      expect(section.id.startsWith(`sec:${seeded.document_id}:`)).toBe(true);
      expect(section.chars).toBeGreaterThan(0);
    }
  });

  it('reads a section body with the owning document\'s citation metadata', async () => {
    const document = await readDocument();
    const listed = document.sections.find(section => section.number === '1.0');
    expect(listed, 'the fixture has a numbered section 1.0 with text').toBeDefined();

    const { section } = await runTool(getSection, { sectionId: listed!.id });

    expect(section).toMatchObject({
      id: listed!.id,
      sectionNumber: '1.0',
      documentId: seeded.document_id,
      documentTitle: seeded.title,
      documentType: 'clinical_policy',
      policyNumber: seeded.policy_number,
      url: seeded.source_url,
      citationLink: `[${seeded.title}](${seeded.source_url})`,
      status: 'current',
      authorityTier: seeded.authority_tier,
      answerRole: seeded.answer_role,
      answerReady: true,
      contentOffset: 0,
    });
    expect(section?.title).toMatch(/^1\.0 Description/);
    expect(section?.content?.trim().length).toBeGreaterThan(0);
    expect(section?.content?.toLowerCase()).toContain('ambiguous genitalia');
    expect(section?.totalChars).toBeGreaterThanOrEqual(listed!.chars!);
  });

  it('finds the document by its policy number', async () => {
    await readDocument();

    const lookup = await runTool(lookupPolicy, { policyNumber: seeded.policy_number });

    expect(lookup.documents.map(document => document.id)).toEqual([seeded.document_id]);
    expect(lookup.documents[0]).toMatchObject({ documentType: 'clinical_policy', url: seeded.source_url });
    expect(lookup.documents[0].sections.length).toBeGreaterThan(0);
  });

  it('reads the section hierarchy the loader wrote', async () => {
    const document = await readDocument();
    const nested = document.sections.find(section => section.number === '2.1.1');
    expect(nested, 'the fixture has a numbered section 2.1.1 with text').toBeDefined();

    const context = await runTool(getSectionContext, { sectionId: nested!.id });

    expect(context.ancestors.map(ancestor => ancestor.sectionNumber)).toContain('2.1');
    expect(context.ancestors.every(ancestor => ancestor.id.startsWith(`sec:${seeded.document_id}:`))).toBe(true);
  });

  it('finds the sections by keyword when no query embedding is available', async () => {
    await readDocument();
    // The embedding provider refuses, so search runs its full-text and other
    // non-vector legs only; nothing is sent to a provider.
    globalThis.fetch = vi.fn(async () =>
      ({ ok: false, status: 401, text: async () => 'no embedding in this test' }) as Response,
    );

    const result = await runTool(searchSections, { query: 'ambiguous genitalia', documentTypes: ['clinical_policy'] });

    expect(result.retrievalMode).toBe('lexical-degraded');
    const hit = result.sections.find(section => section.sectionId.startsWith(`sec:${seeded.document_id}:`));
    expect(hit, 'a seeded section is among the keyword hits').toBeDefined();
    expect(hit).toMatchObject({ policyNumber: seeded.policy_number, documentType: 'clinical_policy' });
    expect(hit!.contentSnippet?.trim().length).toBeGreaterThan(0);
  });
});
