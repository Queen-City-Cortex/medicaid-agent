import type {
  DocumentWithSectionsView,
  SectionContextView,
  SectionView,
  SessionExecutor,
} from '../types.js';
import { documentMetadataReturn, mapDocumentMetadataRecord } from '../document-metadata.js';
import {
  MAX_COMBINED_CHARS,
  buildSectionView,
  mapDocumentSections,
  mapSectionContextEntry,
  truncateContent,
} from '../internal/shared.js';

export function createSectionPrimitiveService({ withSession }: { withSession: SessionExecutor }) {
  const getSection = async (sectionId: string): Promise<SectionView | null> => {
    return withSession(async (session) => {
      const result = await session.run(
        `MATCH (s:Section {id: $id})
         OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
         RETURN
           s.id AS id,
           s.title AS title,
           s.section_number AS sectionNumber,
           s.content_text AS content,
           s.content_length AS contentLength,
           s.last_revised AS lastRevised,
           s.federal_register_cite AS federalRegisterCite,
           d.id AS documentId,
           d.title AS documentTitle,
           d.document_type AS documentType,
           d.policy_number AS policyNumber,
           d.effective_date AS effectiveDate,
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
                  return key === 'id'
                    ? record.get('id')
                    : key === 'title'
                      ? record.get('title')
                      : key === 'sectionNumber'
                        ? record.get('sectionNumber')
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
        `MATCH (s:Section {id: $id})-[:PARENT_OF]->(child:Section)
         RETURN child.id AS id, child.title AS title, child.section_number AS sectionNumber
         ORDER BY child.section_number`,
        { id: sectionId },
      );

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

      return {
        ancestors: ancestorResult.records.map(mapSectionContextEntry),
        children: childResult.records.map(mapSectionContextEntry),
        siblings: siblingResult.records.map(mapSectionContextEntry),
      } satisfies SectionContextView;
    });
  };

  return {
    getSection,
    getDocument,
    getSectionContext,
  };
}
