import neo4j, { Driver } from 'neo4j-driver';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mastra/core/tools', () => ({
  createTool: (config: any) => config,
}));

import { closeDriver } from '../../src/neo4j.js';
import { searchSections } from '../../src/tools/search.js';
import { followReferences, getAmendments } from '../../src/tools/navigate.js';
import { lookupPolicy } from '../../src/tools/lookup.js';
import { resolveAnswerFrame } from '../../src/tools/answer-frame.js';
import { ANSWER_SCOPE_POLICY, coverageEvidenceIssue } from '@nc-medicaid/policy-corpus';
import { getSection, getSectionContext } from '../../src/tools/read.js';
import { runTool } from '../helpers/run-tool.js';
import { ensureIntegrationIndexes } from '../helpers/integration-indexes.js';

const integration = process.env.RUN_NEO4J_INTEGRATION === '1' ? describe : describe.skip;

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'medicaid-dev';
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';
const FIXTURE_PREFIX = 'test:agent-tools:';
const EMBEDDING = [1, ...Array.from({ length: 1023 }, () => 0)];

let driver: Driver;

async function run(query: string, params: Record<string, unknown> = {}) {
  const session = driver.session({ database: NEO4J_DATABASE });
  try {
    return await session.run(query, params);
  } finally {
    await session.close();
  }
}

async function cleanupFixtures() {
  await run(
    `MATCH (n)
     WHERE n.id STARTS WITH $prefix
     DETACH DELETE n`,
    { prefix: FIXTURE_PREFIX },
  );
}

integration('agent tools against a real Neo4j graph', () => {
  beforeAll(async () => {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    await driver.verifyConnectivity();
    await ensureIntegrationIndexes(run);
  });

  beforeEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await closeDriver();
    await driver.close();
  });

  it('hydrates the exact dated coverage source and full sections through the agent tool', async () => {
    const url = ANSWER_SCOPE_POLICY.magi_tables[1].source_url;
    const existing = await run('MATCH (d:Document {source_url: $url}) RETURN count(d) AS count', { url });
    if (existing.records[0].get('count').toNumber() !== 0) throw new Error('Coverage fixture requires a dedicated empty test graph');
    const docId = `${FIXTURE_PREFIX}doc:magi-2026`;
    const sectionId = `${FIXTURE_PREFIX}sec:magi-2026:table`;
    await run(`CREATE (d:Document {id: $docId, title: '2026 MAGI table', document_type: 'dhhs_policy', source_url: $url, answer_ready: true, status: 'current'})
      CREATE (s:Section {id: $sectionId, document_id: $docId, title: 'Income table', content_text: $content, content_length: size($content), answer_ready: true})
      CREATE (d)-[:HAS_SECTION]->(s)`, { docId, sectionId, url, content: 'Effective: APRIL 1, 2026\n133% monthly amount 1769' });
    const { frame } = await runTool(resolveAnswerFrame, { query: 'What MAGI income table applies in October 2026?' });
    expect(frame.coverageScope?.notice).toBeNull();
    expect(frame.authoritativeDocuments.map((document: { id: string }) => document.id)).toEqual([docId]);
    expect(frame.primarySections[0].id).toBe(sectionId);
    expect(coverageEvidenceIssue(frame.coverageScope ?? null, frame.primarySections.map(section => ({ toolName: 'resolveAnswerFrame:section', text: section.content ?? '', link: section.url })))).toBeNull();
  });

  it('returns search snippets from Section.content_text', async () => {
    globalThis.fetch = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({ data: [{ embedding: EMBEDDING }] }),
      }) as Response,
    );

    await run(
      `
      CREATE (d:Document {
        id: $docId,
        title: 'Policy 8C',
        document_type: 'dhhs_policy',
        policy_number: '8C',
        source_url: 'https://example.com/8C',
        status: 'current'
      })
      CREATE (s:Section {
        id: $sectionId,
        document_id: $docId,
        section_number: '4.1',
        title: 'Coverage',
        content_text: $content,
        content_length: size($content),
        embedding: $embedding
      })
      CREATE (d)-[:HAS_SECTION]->(s)
      `,
      {
        docId: `${FIXTURE_PREFIX}doc:8C`,
        sectionId: `${FIXTURE_PREFIX}sec:8C:4.1`,
        content: 'Seeded search content from content_text, not a legacy content field.',
        embedding: EMBEDDING,
      },
    );

    const result = await runTool(searchSections, { query: 'coverage' });

    expect(result.sections[0]?.sectionId).toBe(`${FIXTURE_PREFIX}sec:8C:4.1`);
    expect(result.sections[0]?.contentSnippet).toContain('Seeded search content');
  });

  it('returns reference_text and mapped source_url/status fields', async () => {
    // Use fixture-unique policy numbers so lookupPolicy's policy_number match
    // can't collide with real 8C / 42 CFR 440 docs in the live graph.
    const fixturePolicy = 'TEST-REF-8C';
    const fixtureFedPolicy = 'TEST-REF-FED-440';

    await run(
      `
      CREATE (sourceDoc:Document {
        id: $sourceDocId,
        title: 'Fixture Policy TEST-REF-8C',
        document_type: 'dhhs_policy',
        policy_number: $fixturePolicy,
        source_url: 'https://example.com/test-ref-8C',
        status: 'current'
      })
      CREATE (targetDoc:Document {
        id: $targetDocId,
        title: 'Fixture Policy 42 CFR 440',
        document_type: 'federal_regulation',
        policy_number: $fixtureFedPolicy,
        source_url: 'https://example.com/test-ref-42-cfr-440',
        status: 'current'
      })
      CREATE (source:Section {
        id: $sourceSectionId,
        document_id: $sourceDocId,
        section_number: '1',
        title: 'Source',
        content_text: 'Source text',
        content_length: 11
      })
      CREATE (target:Section {
        id: $targetSectionId,
        document_id: $targetDocId,
        section_number: '440.70',
        title: 'Target',
        content_text: 'Target text',
        content_length: 11
      })
      CREATE (sourceDoc)-[:HAS_SECTION]->(source)
      CREATE (targetDoc)-[:HAS_SECTION]->(target)
      CREATE (source)-[:REFERENCES {reference_text: 'see 42 CFR 440.70'}]->(target)
      `,
      {
        sourceDocId: `${FIXTURE_PREFIX}doc:source`,
        targetDocId: `${FIXTURE_PREFIX}doc:target`,
        sourceSectionId: `${FIXTURE_PREFIX}sec:source`,
        targetSectionId: `${FIXTURE_PREFIX}sec:target`,
        fixturePolicy,
        fixtureFedPolicy,
      },
    );

    const references = await runTool(followReferences, { sectionId: `${FIXTURE_PREFIX}sec:source` });
    expect(references.references[0]?.referenceText).toBe('see 42 CFR 440.70');

    const lookup = await runTool(lookupPolicy, { policyNumber: fixturePolicy });
    expect(lookup.documents[0]?.url).toBe('https://example.com/test-ref-8C');
    expect(lookup.documents[0]?.status).toBe('current');
  });

  it('returns section-level citation metadata from the owning document', async () => {
    const docId = `${FIXTURE_PREFIX}doc:get-section`;
    const sectionId = `${FIXTURE_PREFIX}sec:get-section`;

    await run(
      `
      CREATE (d:Document {
        id: $docId,
        title: 'Policy 8C',
        document_type: 'dhhs_policy',
        policy_number: '8C',
        effective_date: '2025-01-01',
        source_url: 'https://example.com/8C',
        status: 'current'
      })
      CREATE (s:Section {
        id: $sectionId,
        document_id: $docId,
        section_number: '4.1',
        title: 'Eligibility',
        content_text: 'Full section content here.',
        content_length: 26
      })
      CREATE (d)-[:HAS_SECTION]->(s)
      `,
      { docId, sectionId },
    );

    const result = await runTool(getSection, { sectionId });

    expect(result.section?.effectiveDate).toBe('2025-01-01');
    expect(result.section?.documentTitle).toBe('Policy 8C');
    expect(result.section?.citationLink).toBe('[Policy 8C](https://example.com/8C)');
    expect(result.section?.status).toBe('current');
  });

  it('returns a full amendment chain and authoritative document', async () => {
    const baseDocId = `${FIXTURE_PREFIX}doc:base`;
    const currentDocId = `${FIXTURE_PREFIX}doc:current`;
    const amendEarlyId = `${FIXTURE_PREFIX}doc:amend-early`;
    const amendLateId = `${FIXTURE_PREFIX}doc:amend-late`;

    await run(
      `
      CREATE (base:Document {
        id: $baseDocId,
        title: 'Policy 8C (2024)',
        document_type: 'dhhs_policy',
        policy_number: '8C',
        effective_date: '2024-01-01',
        source_url: 'https://example.com/base',
        status: 'current'
      })
      CREATE (current:Document {
        id: $currentDocId,
        title: 'Policy 8C (2025)',
        document_type: 'dhhs_policy',
        policy_number: '8C',
        effective_date: '2025-01-01',
        source_url: 'https://example.com/current',
        status: 'current'
      })
      CREATE (early:Document {
        id: $amendEarlyId,
        title: 'Change Notice 2025-02',
        document_type: 'change_notice',
        policy_number: '8C-CN-02',
        effective_date: '2025-02-01',
        source_url: 'https://example.com/early',
        status: 'amendment'
      })
      CREATE (late:Document {
        id: $amendLateId,
        title: 'Change Notice 2025-06',
        document_type: 'change_notice',
        policy_number: '8C-CN-06',
        effective_date: '2025-06-01',
        source_url: 'https://example.com/late',
        status: 'amendment'
      })
      CREATE (current)-[:AMENDS]->(base)
      CREATE (early)-[re:AMENDS]->(current)
      CREATE (late)-[rl:AMENDS]->(current)
      SET re.change_description = $earlyDesc
      SET rl.change_description = $lateDesc
      `,
      {
        baseDocId,
        currentDocId,
        amendEarlyId,
        amendLateId,
        earlyDesc: 'Updated eligibility criteria in section IV.A.',
        lateDesc: 'Revised premium chart in section IV.I.',
      },
    );

    const result = await runTool(getAmendments, { documentId: currentDocId });

    expect(result.baseDocument?.id).toBe(baseDocId);
    expect(result.amendments.map((doc) => doc.id)).toEqual([amendLateId, amendEarlyId]);
    expect(result.authoritativeDocument?.id).toBe(amendLateId);
    expect(result.authoritativeDocument?.url).toBe('https://example.com/late');
    expect(result.amendments[0].changeSummary).toBe('Revised premium chart in section IV.I.');
    expect(result.amendments[1].changeSummary).toBe('Updated eligibility criteria in section IV.A.');
  });

  it('returns all siblings for a section, not only adjacent NEXT_SIBLING nodes', async () => {
    const docId = `${FIXTURE_PREFIX}doc:context`;
    const parentId = `${FIXTURE_PREFIX}sec:parent`;
    const firstId = `${FIXTURE_PREFIX}sec:first`;
    const middleId = `${FIXTURE_PREFIX}sec:middle`;
    const lastId = `${FIXTURE_PREFIX}sec:last`;

    await run(
      `
      CREATE (d:Document {
        id: $docId,
        title: 'Policy Context',
        document_type: 'dhhs_policy',
        policy_number: 'CTX',
        source_url: 'https://example.com/context',
        status: 'current'
      })
      CREATE (parent:Section {
        id: $parentId,
        document_id: $docId,
        section_number: '1',
        title: 'Parent',
        content_text: 'Parent section',
        content_length: 14
      })
      CREATE (first:Section {
        id: $firstId,
        document_id: $docId,
        section_number: '1.1',
        title: 'First',
        content_text: 'First section',
        content_length: 13
      })
      CREATE (middle:Section {
        id: $middleId,
        document_id: $docId,
        section_number: '1.2',
        title: 'Middle',
        content_text: 'Middle section',
        content_length: 14
      })
      CREATE (last:Section {
        id: $lastId,
        document_id: $docId,
        section_number: '1.3',
        title: 'Last',
        content_text: 'Last section',
        content_length: 12
      })
      CREATE (d)-[:HAS_SECTION]->(parent)
      CREATE (d)-[:HAS_SECTION]->(first)
      CREATE (d)-[:HAS_SECTION]->(middle)
      CREATE (d)-[:HAS_SECTION]->(last)
      CREATE (parent)-[:PARENT_OF]->(first)
      CREATE (parent)-[:PARENT_OF]->(middle)
      CREATE (parent)-[:PARENT_OF]->(last)
      CREATE (first)-[:NEXT_SIBLING]->(middle)
      CREATE (middle)-[:NEXT_SIBLING]->(last)
      `,
      { docId, parentId, firstId, middleId, lastId },
    );

    const context = await runTool(getSectionContext, { sectionId: middleId });

    expect(context.siblings).toEqual([
      { id: firstId, title: 'First', sectionNumber: '1.1' },
      { id: lastId, title: 'Last', sectionNumber: '1.3' },
    ]);
  });
});
