import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import neo4j from 'neo4j-driver';
import { withSession } from '../neo4j.js';
import { VOYAGE_API_KEY, VOYAGE_MODEL, VOYAGE_API_URL, DEFAULT_TOP_K } from '../config.js';

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
    'Semantic search over NC Medicaid policy sections using vector embeddings. ' +
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
      type SectionResult = {
        sectionId: string;
        title: string | null;
        policyNumber: string | null;
        documentType: string | null;
        contentSnippet: string | null;
        score: number;
      };

      const sectionMap = new Map<string, SectionResult>();

      const addRecords = (records: any[]) => {
        for (const record of records) {
          const sectionId = record.get('sectionId') as string;
          const score = record.get('score') as number;
          const existing = sectionMap.get(sectionId);
          if (!existing || score > existing.score) {
            const content = record.get('content') as string | null;
            sectionMap.set(sectionId, {
              sectionId,
              title: record.get('title') as string | null,
              policyNumber: record.get('policyNumber') as string | null,
              documentType: record.get('documentType') as string | null,
              contentSnippet: content ? content.slice(0, 300) : null,
              score,
            });
          }
        }
      };

      // When no type filter, search each major type separately to ensure
      // clinical policies aren't drowned out by the 7:1 DHHS policy ratio.
      // When a type filter is specified, search once with the filter.
      const typeGroups = (documentTypes && documentTypes.length > 0)
        ? [documentTypes]
        : [['clinical_policy'], ['dhhs_policy'], ['federal_regulation', 'federal_statute', 'bulletin', 'state_plan_amendment', 'waiver', 'provider_manual']];

      const perGroupK = (documentTypes && documentTypes.length > 0)
        ? topK
        : Math.max(topK, 10); // fetch more per group, then merge and trim

      for (const docTypes of typeGroups) {
        const vectorQuery = `
          CALL db.index.vector.queryNodes('section_embeddings', $k, $embedding)
          YIELD node AS s, score
          MATCH (d:Document)-[:HAS_SECTION]->(s)
          WHERE d.document_type IN $docTypes
          RETURN
            s.id AS sectionId,
            s.title AS title,
            d.policy_number AS policyNumber,
            d.document_type AS documentType,
            s.content AS content,
            score
          ORDER BY score DESC
          LIMIT $k
        `;

        const result = await session.run(vectorQuery, {
          embedding,
          k: neo4j.int(perGroupK),
          docTypes,
        });
        addRecords(result.records);
      }

      // Concept-augmented retrieval: if the query matches a known PolicyConcept
      // name or alias, include concept-linked sections that vector search may miss.
      // This uses the concept graph (COVERS/DEFINES/RESTRICTS edges) we built
      // during ingestion. Concept matches get a synthetic score of 0.75 so they
      // appear in results but don't outrank strong vector matches.
      try {
        const conceptQuery = `
          MATCH (c:PolicyConcept)
          WHERE toLower($query) CONTAINS toLower(c.name)
             OR ANY(alias IN c.aliases WHERE toLower($query) CONTAINS toLower(alias))
          WITH c LIMIT 2
          MATCH (s:Section)-[:COVERS|DEFINES|RESTRICTS]->(c)
          MATCH (d:Document)-[:HAS_SECTION]->(s)
          WHERE s.content_length > 200
          ${documentTypes && documentTypes.length > 0 ? 'AND d.document_type IN $docTypes' : ''}
          RETURN
            s.id AS sectionId,
            s.title AS title,
            d.policy_number AS policyNumber,
            d.document_type AS documentType,
            s.content AS content,
            0.75 AS score
          ORDER BY s.content_length DESC
          LIMIT $k
        `;

        const conceptResult = await session.run(conceptQuery, {
          query,
          k: neo4j.int(Math.min(topK, 5)),
          docTypes: documentTypes || [],
        });
        addRecords(conceptResult.records);
      } catch {
        // Concept matching is best-effort
      }

      // Also try chunk_embeddings index
      try {
        const chunkQuery = `
          CALL db.index.vector.queryNodes('chunk_embeddings', $k, $embedding)
          YIELD node AS c, score
          MATCH (s:Section)-[:HAS_CHUNK]->(c)
          MATCH (d:Document)-[:HAS_SECTION]->(s)
          ${documentTypes && documentTypes.length > 0 ? 'WHERE d.document_type IN $docTypes' : ''}
          RETURN
            s.id AS sectionId,
            s.title AS title,
            d.policy_number AS policyNumber,
            d.document_type AS documentType,
            s.content AS content,
            score
          ORDER BY score DESC
          LIMIT $k
        `;

        const chunkResult = await session.run(chunkQuery, {
          embedding,
          k: neo4j.int(topK),
          docTypes: documentTypes || [],
        });
        addRecords(chunkResult.records);
      } catch {
        // chunk_embeddings index may not exist; that's fine
      }

      return Array.from(sectionMap.values()).sort((a, b) => b.score - a.score).slice(0, topK);
    });

    return { sections };
  },
});
