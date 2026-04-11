import type { DocumentWithSectionsView, LookupPolicyInput, SessionExecutor } from '../types.js';
import { documentMetadataReturn, mapDocumentMetadataRecord } from '../document-metadata.js';
import { mapDocumentSections } from '../internal/shared.js';

export function createPolicyLookupPrimitiveService({ withSession }: { withSession: SessionExecutor }) {
  const lookupPolicy = async ({ policyNumber }: LookupPolicyInput): Promise<DocumentWithSectionsView[]> => {
    return withSession(async (session) => {
      const result = await session.run(
        `MATCH (d:Document)
         WHERE d.policy_number = $pn
            OR toLower(d.policy_number) = toLower($pn)
            OR d.policy_number STARTS WITH $pn
         OPTIONAL MATCH (d)-[:HAS_SECTION]->(s:Section)
         RETURN
           ${documentMetadataReturn('d')},
           collect({id: s.id, number: s.section_number, title: s.title}) AS sections
         ORDER BY
           CASE WHEN toUpper(coalesce(d.title, '')) CONTAINS 'CHANGE NOTICE' THEN 1 ELSE 0 END,
           CASE WHEN coalesce(d.status, '') = 'amendment' THEN 1 ELSE 0 END,
           CASE WHEN d.effective_date IS NULL THEN 1 ELSE 0 END,
           d.effective_date DESC,
           size(coalesce(d.title, '')) ASC,
           d.id ASC`,
        { pn: policyNumber },
      );

      return result.records.map((record) => ({
        ...mapDocumentMetadataRecord(record),
        sections: mapDocumentSections(
          (record.get('sections') as Array<{
            id: string | null;
            number: string | null;
            title: string | null;
          }>) ?? [],
        ),
      })) satisfies DocumentWithSectionsView[];
    });
  };

  return {
    lookupPolicy,
  };
}
