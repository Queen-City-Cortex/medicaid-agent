import type { DocumentWithSectionsView, LookupPolicyInput, SessionExecutor } from '../types.js';
import { documentMetadataReturn, mapDocumentMetadataRecord } from '../document-metadata.js';
import { mapDocumentSections } from '../internal/shared.js';

const LOOKUP_DOCUMENT_LIMIT = 25;

/**
 * Expands a user/model-supplied policy number into the forms stored in the
 * graph. Federal documents are stored hyphenated ("42-CFR-440",
 * "SSA-Title-19"), but citations are naturally written "42 CFR 440",
 * "42 C.F.R. § 440.230", or "SSA Title 19" — without this, federal lookups
 * can never match.
 */
export function candidatePolicyNumbers(raw: string): string[] {
  const pn = raw.trim();
  if (!pn) return [];
  const candidates = new Set<string>([pn]);

  const cfr = pn.match(/^(\d+)\s*C\.?\s*F\.?\s*R\.?\s*(?:§+\s*)?(?:part\s+)?(\d+)/i);
  if (cfr) candidates.add(`${cfr[1]}-CFR-${cfr[2]}`);

  const ssa = pn.match(/^SSA[\s-]*Title[\s-]*(\d+)/i);
  if (ssa) candidates.add(`SSA-Title-${ssa[1]}`);

  return [...candidates];
}

export function createPolicyLookupPrimitiveService({ withSession }: { withSession: SessionExecutor }) {
  const lookupPolicy = async ({ policyNumber }: LookupPolicyInput): Promise<DocumentWithSectionsView[]> => {
    const candidates = candidatePolicyNumbers(policyNumber);
    if (candidates.length === 0) return [];

    return withSession(async (session) => {
      const result = await session.run(
        `MATCH (d:Document)
         WHERE any(pn IN $pns WHERE
           d.policy_number = pn
           OR toLower(d.policy_number) = toLower(pn)
           OR d.policy_number STARTS WITH pn)
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
           d.id ASC
         LIMIT ${LOOKUP_DOCUMENT_LIMIT}`,
        { pns: candidates },
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
