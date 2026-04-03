import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import neo4j from 'neo4j-driver';
import { withSession } from '../neo4j.js';
import { VOYAGE_API_KEY, VOYAGE_MODEL, VOYAGE_API_URL, DEFAULT_TOP_K } from '../config.js';

export const SEARCH_SNIPPET_CHARS = 300;
const CONCEPT_MATCH_SCORE = 0.7;
const FULLTEXT_BOOST = 0.05;
const LUCENE_SPECIAL = /[+\-&|!(){}[\]^"~*?:\\/]/g;

function escapeLucene(query: string): string {
  return query.replace(LUCENE_SPECIAL, '\\$&');
}

const DEFAULT_TYPE_GROUPS = [
  ['clinical_policy'],
  ['dhhs_policy'],
  ['federal_regulation', 'federal_statute', 'bulletin', 'state_plan_amendment', 'waiver', 'provider_manual'],
];

async function embedQuery(query: string): Promise<number[]> {
  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: [query],
      input_type: 'query',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Voyage API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

type SectionHit = {
  sectionId: string;
  title: string | null;
  policyNumber: string | null;
  documentType: string | null;
  contentSnippet: string | null;
  score: number;
};

function recordToHit(record: any): SectionHit {
  const content = record.get('content') as string | null;
  return {
    sectionId: record.get('sectionId') as string,
    title: record.get('title') as string | null,
    policyNumber: record.get('policyNumber') as string | null,
    documentType: record.get('documentType') as string | null,
    contentSnippet: content ? content.slice(0, SEARCH_SNIPPET_CHARS) : null,
    score: record.get('score') as number,
  };
}

const SectionResult = z.object({
  sectionId: z.string(),
  title: z.string().nullable(),
  policyNumber: z.string().nullable(),
  documentType: z.string().nullable(),
  contentSnippet: z.string().nullable(),
  score: z.number(),
});

export const searchSections = createTool({
  id: 'search-sections',
  description:
    'Hybrid search (semantic + keyword) over NC Medicaid policy sections. ' +
    'Use this to find relevant policy sections for a topic or question. ' +
    'Optionally filter by documentType (e.g. "dhhs_policy", "clinical_policy", "federal_regulation", "change_notice").',
  inputSchema: z.object({
    query: z.string().describe('Natural language search query'),
    documentTypes: z
      .array(z.string())
      .optional()
      .describe('Filter results to specific document types'),
    topK: z.number().optional().describe('Number of results to return (default 10)'),
  }),
  outputSchema: z.object({
    sections: z.array(SectionResult),
  }),
  execute: async (inputData) => {
    const { query, documentTypes } = inputData;
    const topK = Math.round(inputData.topK ?? DEFAULT_TOP_K);

    const embedding = await embedQuery(query);

    const sections = await withSession(async (session) => {
      const typeGroups = (documentTypes && documentTypes.length > 0)
        ? [documentTypes]
        : DEFAULT_TYPE_GROUPS;

      const perGroupK = (documentTypes && documentTypes.length > 0)
        ? topK
        : Math.max(topK, 10);

      // 1. Section vector search — per type group
      const vectorHits: SectionHit[] = [];
      for (const docTypes of typeGroups) {
        const result = await session.run(`
          CALL db.index.vector.queryNodes('section_embeddings', $k, $embedding)
          YIELD node AS s, score
          MATCH (d:Document)-[:HAS_SECTION]->(s)
          WHERE d.document_type IN $docTypes
          RETURN
            s.id AS sectionId, s.title AS title,
            d.policy_number AS policyNumber, d.document_type AS documentType,
            s.content_text AS content, score
          ORDER BY score DESC
          LIMIT $k
        `, { embedding, k: neo4j.int(perGroupK), docTypes });
        vectorHits.push(...result.records.map(recordToHit));
      }

      // 2. Chunk vector search — per type group
      const chunkHits: SectionHit[] = [];
      for (const docTypes of typeGroups) {
        try {
          const result = await session.run(`
            CALL db.index.vector.queryNodes('chunk_embeddings', $k, $embedding)
            YIELD node AS c, score
            MATCH (s:Section)-[:HAS_CHUNK]->(c)
            MATCH (d:Document)-[:HAS_SECTION]->(s)
            WHERE d.document_type IN $docTypes
            RETURN
              s.id AS sectionId, s.title AS title,
              d.policy_number AS policyNumber, d.document_type AS documentType,
              s.content_text AS content, score
            ORDER BY score DESC
            LIMIT $k
          `, { embedding, k: neo4j.int(perGroupK), docTypes });
          chunkHits.push(...result.records.map(recordToHit));
        } catch {
          // chunk_embeddings index may not exist
        }
      }

      // 3. Concept graph matching
      const conceptHits: SectionHit[] = [];
      try {
        const result = await session.run(`
          MATCH (c:PolicyConcept)
          WHERE toLower($query) CONTAINS toLower(c.name)
             OR ANY(alias IN c.aliases WHERE toLower($query) CONTAINS toLower(alias))
          WITH c LIMIT 2
          MATCH (s:Section)-[:COVERS|DEFINES|RESTRICTS]->(c)
          MATCH (d:Document)-[:HAS_SECTION]->(s)
          WHERE s.content_length > 200
            AND s.section_number IS NOT NULL
          ${documentTypes && documentTypes.length > 0 ? 'AND d.document_type IN $docTypes' : ''}
          RETURN
            s.id AS sectionId, s.title AS title,
            d.policy_number AS policyNumber, d.document_type AS documentType,
            s.content_text AS content,
            ${CONCEPT_MATCH_SCORE} AS score
          ORDER BY s.content_length DESC
          LIMIT $k
        `, { query, k: neo4j.int(Math.min(topK, 5)), docTypes: documentTypes || [] });
        conceptHits.push(...result.records.map(recordToHit));
      } catch {
        // Concept matching is best-effort
      }

      // Merge vector + chunk + concept using best-score dedup (preserves cosine scores)
      const sectionMap = new Map<string, SectionHit>();
      for (const hit of [...vectorHits, ...chunkHits, ...conceptHits]) {
        const existing = sectionMap.get(hit.sectionId);
        if (!existing || hit.score > existing.score) {
          sectionMap.set(hit.sectionId, hit);
        }
      }

      // 4. Fulltext augmentation: boost overlapping results, fill with keyword-only hits
      const escapedQuery = escapeLucene(query);
      if (escapedQuery.trim()) {
        try {
          const fulltextHits: SectionHit[] = [];
          for (const docTypes of typeGroups) {
            const result = await session.run(`
              CALL db.index.fulltext.queryNodes('section_fulltext', $query)
              YIELD node AS s, score
              MATCH (d:Document)-[:HAS_SECTION]->(s)
              WHERE s.content_length > 0
                AND d.document_type IN $docTypes
              RETURN
                s.id AS sectionId, s.title AS title,
                d.policy_number AS policyNumber, d.document_type AS documentType,
                s.content_text AS content, score
              ORDER BY score DESC
              LIMIT $k
            `, { query: escapedQuery, k: neo4j.int(perGroupK), docTypes });
            fulltextHits.push(...result.records.map(recordToHit));
          }

          const ftIds = new Set(fulltextHits.map(h => h.sectionId));

          // Boost: vector results confirmed by fulltext
          for (const [sid, hit] of sectionMap) {
            if (ftIds.has(sid)) {
              hit.score += FULLTEXT_BOOST;
            }
          }

          // Fill: fulltext-only results get synthetic score below vector floor
          const scores = Array.from(sectionMap.values()).map(h => h.score);
          const minScore = scores.length > 0 ? Math.min(...scores) : 0.5;
          for (let i = 0; i < fulltextHits.length; i++) {
            const hit = fulltextHits[i];
            if (!sectionMap.has(hit.sectionId)) {
              hit.score = Math.max(minScore - 0.01 * (i + 1), 0.01);
              sectionMap.set(hit.sectionId, hit);
            }
          }
        } catch {
          // Fulltext index may not exist yet
        }
      }

      return Array.from(sectionMap.values()).sort((a, b) => b.score - a.score).slice(0, topK);
    });

    return { sections };
  },
});
