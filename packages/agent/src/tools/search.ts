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
  execute: async ({ context: inputData }) => {
    const { query, documentTypes } = inputData;
    const topK = Math.round(inputData.topK ?? DEFAULT_TOP_K);

    const embedding = await embedQuery(query);

    const sections = await withSession(async (session) => {
      // Query the section_embeddings vector index
      const vectorQuery = `
        CALL db.index.vector.queryNodes('section_embeddings', $k, $embedding)
        YIELD node AS s, score
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

      const result = await session.run(vectorQuery, {
        embedding,
        k: neo4j.int(topK),
        docTypes: documentTypes || [],
      });

      const sectionMap = new Map<
        string,
        {
          sectionId: string;
          title: string | null;
          policyNumber: string | null;
          documentType: string | null;
          contentSnippet: string | null;
          score: number;
        }
      >();

      for (const record of result.records) {
        const sectionId = record.get('sectionId') as string;
        if (!sectionMap.has(sectionId)) {
          const content = record.get('content') as string | null;
          sectionMap.set(sectionId, {
            sectionId,
            title: record.get('title') as string | null,
            policyNumber: record.get('policyNumber') as string | null,
            documentType: record.get('documentType') as string | null,
            contentSnippet: content ? content.slice(0, 500) : null,
            score: record.get('score') as number,
          });
        }
      }

      // Also try chunk_embeddings index if it exists, deduplicate by section
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

        for (const record of chunkResult.records) {
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
              contentSnippet: content ? content.slice(0, 500) : null,
              score,
            });
          }
        }
      } catch {
        // chunk_embeddings index may not exist; that's fine
      }

      return Array.from(sectionMap.values()).sort((a, b) => b.score - a.score).slice(0, topK);
    });

    return { sections };
  },
});
