import type {
  DocumentWithSectionsView,
  SectionContextEntry,
  SectionContextView,
  SectionView,
  SessionExecutor,
  SessionRecordLike,
} from '../types.js';
import { documentMetadataReturn, mapDocumentMetadataRecord } from '../document-metadata.js';
import {
  MAX_COMBINED_CHARS,
  buildSectionView,
  mapDocumentSections,
  mapSectionContextEntry,
  toCount,
  truncateContent,
} from '../internal/shared.js';

// getSectionContext returns a window, not the family: a flat federal part or
// a wide container has hundreds to thousands of siblings and children.
export const CONTEXT_SIBLING_WINDOW = 10;
// How far the sibling walk may travel to find that window. Federal loaders
// chain a whole document in reading order, so a statute section's subsections
// sit between it and the next section and must not use up the window.
export const CONTEXT_SIBLING_WALK_HOPS = 500;
export const CONTEXT_CHILD_LIMIT = 50;

/** Maps a `{entries, total}` window row; no row means the section is unknown. */
function mapContextWindow(record: SessionRecordLike | undefined): { entries: SectionContextEntry[]; total: number } {
  if (!record) return { entries: [], total: 0 };
  const rows = (record.get('entries') as Array<{
    id: string;
    title: string | null;
    sectionNumber: string | null;
  }> | null) ?? [];
  return {
    entries: rows.map((row) => ({ id: row.id, title: row.title ?? null, sectionNumber: row.sectionNumber ?? null })),
    total: Math.max(0, toCount(record.get('total'))),
  };
}

export function createSectionPrimitiveService({ withSession }: { withSession: SessionExecutor }) {
  const getSection = async (sectionId: string): Promise<SectionView | null> => {
    return withSession(async (session) => {
      const result = await session.run(
        `MATCH (s:Section {id: $id})
         OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
         OPTIONAL MATCH (release:CorpusRelease {id: 'current'})
         OPTIONAL MATCH (annotation:JevAnnotation {id: 'current'})
         RETURN
           release.release_id AS releaseId,
           release.jev_annotation_digest AS annotationDigest,
           annotation.digest AS liveAnnotationDigest,
           s.id AS id,
           s.title AS title,
           s.section_number AS sectionNumber,
           s.content_text AS content,
           s.jev_section_roles AS sectionRoles,
           s.content_length AS contentLength,
           s.last_revised AS lastRevised,
           s.federal_register_cite AS federalRegisterCite,
           d.id AS documentId,
           d.title AS documentTitle,
           d.document_type AS documentType,
           d.policy_number AS policyNumber,
           d.effective_date AS effectiveDate,
           d.source_modified_date AS sourceModifiedDate,
           d.retrieved_at AS retrievedAt,
           d.source_url AS url,
           d.status AS status,
           d.authority_tier AS authorityTier,
           d.answer_role AS answerRole,
           d.source_format AS sourceFormat,
           d.answer_ready AS answerReady,
           d.corpus_bucket AS corpusBucket,
           d.variant_group AS variantGroup,
           d.variant_date AS variantDate,
           d.retrieval_ready AS retrievalReady`,
        { id: sectionId },
      );

      if (result.records.length === 0) return null;

      const record = result.records[0];
      const content = (record.get('content') as string | null | undefined) ?? null;

      if (!content || !content.trim()) {
        const childResult = await session.run(
          `MATCH (s:Section {id: $id})-[:PARENT_OF]->(child:Section)
           WHERE child.content_length > 0
           OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
           RETURN
             collect({
               id: child.id,
               title: child.title,
               sectionNumber: child.section_number,
               content: child.content_text
             }) AS children,
             d.id AS documentId,
             d.title AS documentTitle,
             d.document_type AS documentType,
             d.policy_number AS policyNumber,
             d.effective_date AS effectiveDate,
             d.source_modified_date AS sourceModifiedDate,
             d.retrieved_at AS retrievedAt,
             d.source_url AS url,
             d.status AS status,
             d.authority_tier AS authorityTier,
             d.answer_role AS answerRole,
             d.source_format AS sourceFormat,
             d.answer_ready AS answerReady,
             d.corpus_bucket AS corpusBucket,
             d.variant_group AS variantGroup,
             d.variant_date AS variantDate,
             d.retrieval_ready AS retrievalReady`,
          { id: sectionId },
        );

        if (childResult.records.length > 0) {
          const childRecord = childResult.records[0];
          const children = (childRecord.get('children') as Array<{
            id: string;
            title: string | null;
            sectionNumber: string | null;
            content: string | null;
          }>) ?? [];

          if (children.length > 0) {
            let combined = '';
            for (const child of children) {
              const entry = `### ${child.title || child.sectionNumber || '(untitled)'}\n${child.content || ''}\n\n`;
              if (combined.length + entry.length > MAX_COMBINED_CHARS) {
                combined += `\n[Truncated — ${children.length - combined.split('###').length + 1} more child sections. Use getSectionContext to explore.]`;
                break;
              }
              combined += entry;
            }

            return buildSectionView(
              {
                get(key: string) {
                  if (['sectionRoles', 'content', 'releaseId', 'annotationDigest', 'liveAnnotationDigest'].includes(key)) return undefined;
                  return key === 'id'
                    ? record.get('id')
                    : key === 'title'
                      ? record.get('title')
                      : key === 'sectionNumber'
                        ? record.get('sectionNumber')
                        : key === 'lastRevised' || key === 'federalRegisterCite'
                          ? record.get(key)
                          : childRecord.get(key);
                },
              },
              `[Container heading with ${children.length} child sections:]\n\n${combined}`,
            );
          }
        }
      }

      return buildSectionView(record, truncateContent(content));
    });
  };

  const getDocument = async (documentId: string): Promise<DocumentWithSectionsView | null> => {
    return withSession(async (session) => {
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

      const record = result.records[0];
      return {
        ...mapDocumentMetadataRecord(record),
        sections: mapDocumentSections(
          (record.get('sections') as Array<{
            id: string | null;
            number: string | null;
            title: string | null;
            chars?: number | { toNumber(): number } | null;
          }>) ?? [],
        ),
      };
    });
  };

  const getSectionContext = async (sectionId: string): Promise<SectionContextView> => {
    return withSession(async (session) => {
      const ancestorResult = await session.run(
        `MATCH (s:Section {id: $id})
         MATCH path = (ancestor:Section)-[:PARENT_OF*1..10]->(s)
         RETURN ancestor.id AS id, ancestor.title AS title, ancestor.section_number AS sectionNumber
         ORDER BY length(path) DESC`,
        { id: sectionId },
      );

      const childResult = await session.run(
        `MATCH (s:Section {id: $id})
         OPTIONAL MATCH (s)-[:PARENT_OF]->(child:Section)
         WITH child
         ORDER BY child.section_number
         WITH [node IN collect(child) | {id: node.id, title: node.title, sectionNumber: node.section_number}] AS rows
         RETURN size(rows) AS total, rows[0..${CONTEXT_CHILD_LIMIT}] AS entries`,
        { id: sectionId },
      );

      // NEXT_SIBLING is a strict chain, so the nearest siblings are a bounded
      // walk from the section in each direction, linear in the hops taken.
      // Expanding the whole family from its head was quadratic (4.5 s under a
      // 2,364-child parent). The chain can leave the family (see
      // CONTEXT_SIBLING_WALK_HOPS), so each endpoint is checked against the
      // section's own family (the same parent, or for a root section the
      // parent-less sections of the same document) and the window is the
      // nearest family members, not the nearest hops.
      const siblingResult = await session.run(
        `MATCH (s:Section {id: $id})
         OPTIONAL MATCH (parent:Section)-[:PARENT_OF]->(s)
         OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
         WITH s, parent, d
         LIMIT 1
         CALL {
           WITH s, parent, d
           OPTIONAL MATCH path = (before:Section)-[:NEXT_SIBLING*1..${CONTEXT_SIBLING_WALK_HOPS}]->(s)
           WHERE (parent IS NOT NULL AND EXISTS { MATCH (parent)-[:PARENT_OF]->(before) })
              OR (parent IS NULL
                  AND EXISTS { MATCH (d)-[:HAS_SECTION]->(before) }
                  AND NOT EXISTS { MATCH (:Section)-[:PARENT_OF]->(before) })
           WITH before, length(path) AS hops
           ORDER BY hops
           LIMIT ${CONTEXT_SIBLING_WINDOW}
           RETURN before AS sibling, -hops AS offset
           UNION
           WITH s, parent, d
           OPTIONAL MATCH path = (s)-[:NEXT_SIBLING*1..${CONTEXT_SIBLING_WALK_HOPS}]->(after:Section)
           WHERE (parent IS NOT NULL AND EXISTS { MATCH (parent)-[:PARENT_OF]->(after) })
              OR (parent IS NULL
                  AND EXISTS { MATCH (d)-[:HAS_SECTION]->(after) }
                  AND NOT EXISTS { MATCH (:Section)-[:PARENT_OF]->(after) })
           WITH after, length(path) AS hops
           ORDER BY hops
           LIMIT ${CONTEXT_SIBLING_WINDOW}
           RETURN after AS sibling, hops AS offset
         }
         WITH parent, d, sibling, offset
         ORDER BY offset
         WITH parent, d,
              [node IN collect(sibling) | {id: node.id, title: node.title, sectionNumber: node.section_number}] AS entries
         RETURN
           entries,
           CASE
             WHEN parent IS NOT NULL THEN COUNT { MATCH (parent)-[:PARENT_OF]->(:Section) }
             ELSE COUNT {
               MATCH (d)-[:HAS_SECTION]->(root:Section)
               WHERE NOT EXISTS { MATCH (:Section)-[:PARENT_OF]->(root) }
             }
           END - 1 AS total`,
        { id: sectionId },
      );

      const children = mapContextWindow(childResult.records[0]);
      const siblings = mapContextWindow(siblingResult.records[0]);

      return {
        ancestors: ancestorResult.records.map(mapSectionContextEntry),
        siblings: siblings.entries,
        siblingCount: siblings.total,
        siblingsTruncated: siblings.total > siblings.entries.length,
        children: children.entries,
        childCount: children.total,
        childrenTruncated: children.total > children.entries.length,
      } satisfies SectionContextView;
    });
  };

  return {
    getSection,
    getDocument,
    getSectionContext,
  };
}
