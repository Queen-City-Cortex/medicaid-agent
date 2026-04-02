import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { withSession } from '../neo4j.js';
import {
  DocumentMetadataSchema,
  documentMetadataReturn,
  mapDocumentMetadataRecord,
} from './document-metadata.js';

// ─── getSection ────────────────────────────────────────────────────────────────

export const getSection = createTool({
  id: 'get-section',
  description:
    'Retrieve the full content and metadata of a specific policy section by its ID. ' +
    'Use this when you need to read the complete text of a section found via searchSections.',
  inputSchema: z.object({
    sectionId: z.string().describe('The unique section ID (e.g. "doc-123:sec-4.1")'),
  }),
  outputSchema: z.object({
    section: z
      .object({
        id: z.string(),
        title: z.string().nullable(),
        sectionNumber: z.string().nullable(),
        content: z.string().nullable(),
        effectiveDate: z.string().nullable(),
        documentId: z.string().nullable(),
        documentType: z.string().nullable(),
        policyNumber: z.string().nullable(),
      })
      .nullable(),
  }),
  execute: async (inputData) => {
    const { sectionId } = inputData;

    const section = await withSession(async (session) => {
      const result = await session.run(
        `MATCH (s:Section {id: $id})
         OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
         RETURN
           s.id AS id,
           s.title AS title,
           s.section_number AS sectionNumber,
           s.content_text AS content,
           s.content_length AS contentLength,
           d.id AS documentId,
           d.document_type AS documentType,
           d.policy_number AS policyNumber`,
        { id: sectionId },
      );

      if (result.records.length === 0) return null;

      const rec = result.records[0];
      const content = rec.get('content') as string | null;
      const contentLength = rec.get('contentLength') as number | null;

      // If section is an empty container heading, auto-return children's content
      if (!content || !content.trim()) {
        const childResult = await session.run(
          `MATCH (s:Section {id: $id})-[:PARENT_OF]->(child:Section)
           WHERE child.content_length > 0
           OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
           RETURN
             s.title AS parentTitle,
             collect({
               id: child.id,
               title: child.title,
               sectionNumber: child.section_number,
               content: child.content_text
             }) AS children,
             d.id AS documentId,
             d.document_type AS documentType,
             d.policy_number AS policyNumber`,
          { id: sectionId },
        );

        if (childResult.records.length > 0 && (childResult.records[0].get('children') as any[]).length > 0) {
          const cRec = childResult.records[0];
          const children = cRec.get('children') as Array<{
            id: string; title: string | null; sectionNumber: string | null; content: string | null;
          }>;
          // Combine children content under the parent heading, capped at 6K chars
          const MAX_COMBINED_CHARS = 6000;
          let combined = '';
          for (const c of children) {
            const entry = `### ${c.title || c.sectionNumber || '(untitled)'}\n${c.content || ''}\n\n`;
            if (combined.length + entry.length > MAX_COMBINED_CHARS) {
              combined += `\n[Truncated — ${children.length - combined.split('###').length + 1} more child sections. Use getSectionContext to explore.]`;
              break;
            }
            combined += entry;
          }

          return {
            id: rec.get('id') as string,
            title: rec.get('title') as string | null,
            sectionNumber: rec.get('sectionNumber') as string | null,
            content: `[Container heading with ${children.length} child sections:]\n\n${combined}`,
            effectiveDate: null,
            documentId: cRec.get('documentId') as string | null,
            documentType: cRec.get('documentType') as string | null,
            policyNumber: cRec.get('policyNumber') as string | null,
          };
        }
      }

      const MAX_CONTENT_CHARS = 6000;
      const truncatedContent = content && content.length > MAX_CONTENT_CHARS
        ? content.slice(0, MAX_CONTENT_CHARS) + '\n\n[Content truncated at 6,000 chars. Use getSectionContext to explore sub-sections.]'
        : content;

      return {
        id: rec.get('id') as string,
        title: rec.get('title') as string | null,
        sectionNumber: rec.get('sectionNumber') as string | null,
        content: truncatedContent,
        effectiveDate: null,
        documentId: rec.get('documentId') as string | null,
        documentType: rec.get('documentType') as string | null,
        policyNumber: rec.get('policyNumber') as string | null,
      };
    });

    return { section };
  },
});

// ─── getDocument ────────────────────────────────────────────────────────────────

export const getDocument = createTool({
  id: 'get-document',
  description:
    'Retrieve metadata and section list for a policy document by its ID. ' +
    'Returns the document title, type, policy number, and a list of its sections.',
  inputSchema: z.object({
    documentId: z.string().describe('The unique document ID'),
  }),
  outputSchema: z.object({
    document: z
      .object({
        ...DocumentMetadataSchema.shape,
        sections: z.array(
          z.object({
            id: z.string(),
            number: z.string().nullable(),
            title: z.string().nullable(),
            chars: z.number().nullable(),
          }),
        ),
      })
      .nullable(),
  }),
  execute: async (inputData) => {
    const { documentId } = inputData;

    const document = await withSession(async (session) => {
      const result = await session.run(
        `MATCH (d:Document {id: $id})
         OPTIONAL MATCH (d)-[:HAS_SECTION]->(s:Section)
         WHERE s.content_length > 0
         RETURN
           ${documentMetadataReturn('d')},
           collect({id: s.id, number: s.section_number, title: s.title, chars: s.content_length}) AS sections`,
        { id: documentId },
      );

      if (result.records.length === 0) return null;

      const rec = result.records[0];
      const rawSections = rec.get('sections') as Array<{
        id: string;
        number: string | null;
        title: string | null;
        chars: number | null;
      }>;

      // Filter out null entries from empty OPTIONAL MATCH and convert Neo4j Integers
      const sections = rawSections
        .filter((s) => s.id != null)
        .map((s) => ({
          ...s,
          chars: s.chars != null && typeof s.chars === 'object' && 'toNumber' in s.chars
            ? (s.chars as any).toNumber()
            : s.chars,
        }));

      return {
        ...mapDocumentMetadataRecord(rec),
        sections,
      };
    });

    return { document };
  },
});

// ─── getSectionContext ──────────────────────────────────────────────────────────

export const getSectionContext = createTool({
  id: 'get-section-context',
  description:
    'Retrieve the structural context of a section: its ancestors (parent sections), ' +
    'sibling sections, and direct children. Useful for understanding where a section ' +
    'fits within the document hierarchy.',
  inputSchema: z.object({
    sectionId: z.string().describe('The unique section ID'),
  }),
  outputSchema: z.object({
    ancestors: z.array(
      z.object({ id: z.string(), title: z.string().nullable(), sectionNumber: z.string().nullable() }),
    ),
    siblings: z.array(
      z.object({ id: z.string(), title: z.string().nullable(), sectionNumber: z.string().nullable() }),
    ),
    children: z.array(
      z.object({ id: z.string(), title: z.string().nullable(), sectionNumber: z.string().nullable() }),
    ),
  }),
  execute: async (inputData) => {
    const { sectionId } = inputData;

    return await withSession(async (session) => {
      // Ancestors: walk PARENT_OF in reverse
      const ancestorResult = await session.run(
        `MATCH (s:Section {id: $id})
         MATCH path = (ancestor:Section)-[:PARENT_OF*1..10]->(s)
         RETURN ancestor.id AS id, ancestor.title AS title, ancestor.section_number AS sectionNumber
         ORDER BY length(path) DESC`,
        { id: sectionId },
      );

      const ancestors = ancestorResult.records.map((r) => ({
        id: r.get('id') as string,
        title: r.get('title') as string | null,
        sectionNumber: r.get('sectionNumber') as string | null,
      }));

      // Children: direct PARENT_OF targets
      const childResult = await session.run(
        `MATCH (s:Section {id: $id})-[:PARENT_OF]->(child:Section)
         RETURN child.id AS id, child.title AS title, child.section_number AS sectionNumber
         ORDER BY child.section_number`,
        { id: sectionId },
      );

      const children = childResult.records.map((r) => ({
        id: r.get('id') as string,
        title: r.get('title') as string | null,
        sectionNumber: r.get('sectionNumber') as string | null,
      }));

      // Siblings: all same-parent sections, ordered by NEXT_SIBLING when a chain exists
      const siblingResult = await session.run(
        `MATCH (s:Section {id: $id})
         OPTIONAL MATCH (parent:Section)-[:PARENT_OF]->(s)
         OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
         CALL {
           WITH s, parent, d
           OPTIONAL MATCH (parent)-[:PARENT_OF]->(parentSibling:Section)
           WITH s, parent, d, [node IN collect(parentSibling) WHERE node IS NOT NULL] AS parentFamily
           OPTIONAL MATCH (d)-[:HAS_SECTION]->(docSibling:Section)
           WHERE parent IS NULL
             AND NOT EXISTS { MATCH (:Section)-[:PARENT_OF]->(docSibling) }
           WITH s, parent, parentFamily, [node IN collect(docSibling) WHERE node IS NOT NULL] AS docFamily
           WITH s, CASE WHEN parent IS NOT NULL THEN parentFamily ELSE docFamily END AS family
           UNWIND family AS sibling
           WITH s, sibling, family
           OPTIONAL MATCH path = (head:Section)-[:NEXT_SIBLING*0..]->(sibling)
           WHERE head IN family
             AND NOT EXISTS {
               MATCH (prev:Section)-[:NEXT_SIBLING]->(head)
               WHERE prev IN family
             }
           WITH s, sibling, min(length(path)) AS nextSiblingOrder
           WHERE sibling.id <> s.id
           RETURN
             sibling.id AS id,
             sibling.title AS title,
             sibling.section_number AS sectionNumber,
             nextSiblingOrder
           ORDER BY
             CASE WHEN nextSiblingOrder IS NULL THEN 1 ELSE 0 END,
             nextSiblingOrder,
             sibling.section_number,
             sibling.id
         }
         RETURN id, title, sectionNumber`,
        { id: sectionId },
      );

      const siblings = siblingResult.records.map((r) => ({
        id: r.get('id') as string,
        title: r.get('title') as string | null,
        sectionNumber: r.get('sectionNumber') as string | null,
      }));

      return { ancestors, siblings, children };
    });
  },
});
