/**
 * Multi-tool retrieval chains against a real Neo4j graph.
 *
 * Opt-in: set `RUN_NEO4J_INTEGRATION=1`.
 *
 * Covers compositions the agent actually executes on stable-miss questions:
 *   A. searchSections → getSection → getAmendments (amendment surfacing)
 *   C. searchSections → followReferences (cross-ref coverage on a 5-target section)
 *
 * Plus error paths:
 *   - getAmendments on a doc with zero AMENDS edges → clean empty result
 *   - followReferences on a nonexistent section → clean empty result
 */
import neo4j, { Driver } from 'neo4j-driver';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mastra/core/tools', () => ({
  createTool: (config: any) => config,
}));

import { closeDriver } from '../../src/neo4j.js';
import { searchSections } from '../../src/tools/search.js';
import { followReferences, getAmendments } from '../../src/tools/navigate.js';
import { getSection } from '../../src/tools/read.js';

const integration = process.env.RUN_NEO4J_INTEGRATION === '1' ? describe : describe.skip;

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'medicaid-dev';
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';
const FIXTURE_PREFIX = 'test:retrieval-chains:';
// Distinct signature from the other integration test file's `[1, 0, …]` vector
// so concurrent runs don't have two fixtures with cosine similarity 1.0 to the
// same mocked query embedding — that produced non-deterministic "first hit"
// assertions across files. This second-slot basis vector keeps matching within
// this file while being cosine-orthogonal to the neighbor file's fixtures.
const EMBEDDING = [0, 1, ...Array.from({ length: 1022 }, () => 0)];

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
    `MATCH (n) WHERE n.id STARTS WITH $prefix DETACH DELETE n`,
    { prefix: FIXTURE_PREFIX },
  );
}

async function ensureIntegrationIndexes() {
  await run(`
    CREATE VECTOR INDEX section_embeddings IF NOT EXISTS
    FOR (s:Section) ON (s.embedding)
    OPTIONS {
      indexConfig: {
        \`vector.dimensions\`: 1024,
        \`vector.similarity_function\`: 'cosine'
      }
    }
  `);
  await run(`
    CREATE VECTOR INDEX chunk_embeddings IF NOT EXISTS
    FOR (ch:Chunk) ON (ch.embedding)
    OPTIONS {
      indexConfig: {
        \`vector.dimensions\`: 1024,
        \`vector.similarity_function\`: 'cosine'
      }
    }
  `);
  await run('CALL db.awaitIndexes()');
}

function mockEmbeddingFetch() {
  globalThis.fetch = vi.fn(async () =>
    ({
      ok: true,
      json: async () => ({ data: [{ embedding: EMBEDDING }] }),
    }) as Response,
  );
}

integration('retrieval chains against a real Neo4j graph', () => {
  beforeAll(async () => {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    await driver.verifyConnectivity();
    await ensureIntegrationIndexes();
  });

  beforeEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await closeDriver();
    await driver.close();
  });

  it('Chain A: searchSections → getSection → getAmendments surfaces amendment change_description end-to-end', async () => {
    mockEmbeddingFetch();

    const docId = `${FIXTURE_PREFIX}doc:8C`;
    const sectionId = `${FIXTURE_PREFIX}sec:8C:4.1`;
    const amendId = `${FIXTURE_PREFIX}doc:8C:cn:01`;

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
        title: 'Coverage',
        content_text: 'Behavioral-health coverage criteria live here.',
        content_length: 46,
        embedding: $embedding
      })
      CREATE (cn:Document {
        id: $amendId,
        title: 'Policy 8C Revision 2025-03-10',
        document_type: 'change_notice',
        policy_number: '8C-CN-01',
        effective_date: '2025-03-10',
        source_url: 'https://example.com/8C-cn-01',
        status: 'amendment'
      })
      CREATE (d)-[:HAS_SECTION]->(s)
      CREATE (cn)-[rel:AMENDS]->(d)
      SET rel.change_description = $changeDesc
      `,
      {
        docId,
        sectionId,
        amendId,
        embedding: EMBEDDING,
        changeDesc: 'Section 4.1: Added clarity on medical-necessity documentation.',
      },
    );

    // Step 1: search surfaces the seeded section.
    const searchResult = await searchSections.execute({ query: 'coverage criteria' }, {});
    const hit = searchResult.sections.find((s) => s.sectionId === sectionId);
    expect(hit).toBeDefined();
    expect(hit?.contentSnippet).toContain('Behavioral-health coverage');

    // Step 2: getSection returns the parent document metadata the agent cites.
    const section = await getSection.execute({ sectionId }, {});
    expect(section.section?.documentId).toBe(docId);
    expect(section.section?.citationLink).toBe('[Policy 8C](https://example.com/8C)');

    // Step 3: getAmendments on that document surfaces the change notice + description.
    const amendments = await getAmendments.execute({ documentId: docId }, {});
    expect(amendments.amendments).toHaveLength(1);
    expect(amendments.amendments[0].id).toBe(amendId);
    expect(amendments.amendments[0].changeSummary).toBe(
      'Section 4.1: Added clarity on medical-necessity documentation.',
    );
    // Authoritative document should track to the change notice (it's the most recent).
    expect(amendments.authoritativeDocument?.id).toBe(amendId);
  });

  it('Chain C: followReferences returns all 5 cross-refs with mixed Section and Document targets', async () => {
    const sourceDocId = `${FIXTURE_PREFIX}doc:source`;
    const sourceSecId = `${FIXTURE_PREFIX}sec:source`;
    const targets = [
      { id: `${FIXTURE_PREFIX}sec:target-a`, kind: 'Section' as const, title: 'Target A', policy: '8C' },
      { id: `${FIXTURE_PREFIX}sec:target-b`, kind: 'Section' as const, title: 'Target B', policy: '8C' },
      { id: `${FIXTURE_PREFIX}sec:target-c`, kind: 'Section' as const, title: 'Target C', policy: '8C' },
      { id: `${FIXTURE_PREFIX}doc:target-d`, kind: 'Document' as const, title: '42 CFR 440', policy: '42 CFR 440' },
      { id: `${FIXTURE_PREFIX}doc:target-e`, kind: 'Document' as const, title: '42 CFR 441', policy: '42 CFR 441' },
    ];

    // Seed the source section + targets. Sections get a parent doc so policy_number resolves.
    await run(
      `
      CREATE (d:Document {
        id: $sourceDocId,
        title: 'Policy 8C',
        document_type: 'dhhs_policy',
        policy_number: '8C',
        source_url: 'https://example.com/8C',
        status: 'current'
      })
      CREATE (s:Section {
        id: $sourceSecId,
        document_id: $sourceDocId,
        section_number: '1',
        title: 'Source',
        content_text: 'Source text',
        content_length: 11
      })
      CREATE (d)-[:HAS_SECTION]->(s)
      `,
      { sourceDocId, sourceSecId },
    );

    for (const t of targets) {
      if (t.kind === 'Section') {
        await run(
          `
          CREATE (target:Section {
            id: $id,
            document_id: $sourceDocId,
            section_number: $section,
            title: $title,
            content_text: 'Target text',
            content_length: 11
          })
          WITH target
          MATCH (d:Document {id: $sourceDocId})
          CREATE (d)-[:HAS_SECTION]->(target)
          WITH target
          MATCH (s:Section {id: $sourceSecId})
          CREATE (s)-[:REFERENCES {reference_text: $refText}]->(target)
          `,
          {
            id: t.id,
            sourceDocId,
            sourceSecId,
            section: t.title,
            title: t.title,
            refText: `see ${t.policy} § ${t.title}`,
          },
        );
      } else {
        await run(
          `
          CREATE (target:Document {
            id: $id,
            title: $title,
            document_type: 'federal_regulation',
            policy_number: $policy,
            source_url: 'https://example.com/federal',
            status: 'current'
          })
          WITH target
          MATCH (s:Section {id: $sourceSecId})
          CREATE (s)-[:REFERENCES_DOCUMENT {reference_text: $refText}]->(target)
          `,
          {
            id: t.id,
            sourceSecId,
            title: t.title,
            policy: t.policy,
            refText: `pursuant to ${t.policy}`,
          },
        );
      }
    }

    const result = await followReferences.execute({ sectionId: sourceSecId }, {});
    expect(result.references).toHaveLength(5);

    // Assert the full set of target ids is present (order-insensitive).
    const ids = new Set(result.references.map((r) => r.targetId));
    for (const t of targets) {
      expect(ids.has(t.id)).toBe(true);
    }

    // Relationship type is distinguishable: Section targets → REFERENCES, Document targets → REFERENCES_DOCUMENT.
    const rels = result.references.reduce<Record<string, Set<string>>>((acc, r) => {
      (acc[r.targetType] ??= new Set()).add(r.relationshipType);
      return acc;
    }, {});
    expect(rels.Section).toContain('REFERENCES');
    expect(rels.Document).toContain('REFERENCES_DOCUMENT');

    // reference_text round-trips without truncation.
    const targetA = result.references.find((r) => r.targetId === targets[0].id);
    expect(targetA?.referenceText).toBe('see 8C § Target A');
  });

  it('getAmendments on a document with zero AMENDS edges returns an empty chain without throwing', async () => {
    const docId = `${FIXTURE_PREFIX}doc:lonely`;
    await run(
      `
      CREATE (d:Document {
        id: $docId,
        title: 'Lonely Policy',
        document_type: 'dhhs_policy',
        policy_number: 'LONE',
        effective_date: '2025-01-01',
        source_url: 'https://example.com/lonely',
        status: 'current'
      })
      `,
      { docId },
    );

    const result = await getAmendments.execute({ documentId: docId }, {});
    expect(result.amendments).toEqual([]);
    // Authoritative document falls back to the queried doc itself when no amendments exist.
    expect(result.authoritativeDocument?.id).toBe(docId);
  });

  it('followReferences on a section id that does not exist returns an empty array (no crash)', async () => {
    const missingId = `${FIXTURE_PREFIX}sec:does-not-exist`;
    const result = await followReferences.execute({ sectionId: missingId }, {});
    expect(result.references).toEqual([]);
  });
});
