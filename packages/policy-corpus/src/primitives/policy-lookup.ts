import type { DocumentSupersessionView, DocumentWithSectionsView, LookupPolicyInput, SessionExecutor } from '../types.js';
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

  // State Plan Amendments are stored as "SPA YY-NNNN" whatever form the
  // source link or the asker used ("24-0028", "NC-24-0028", "SPA NC 24-0028").
  const spa = pn.match(/^(?:SPA[\s-]*)?(?:NC[\s-]*)?(\d{2}-\d{4})$/i);
  if (spa) candidates.add(`SPA ${spa[1]}`);

  return [...candidates];
}

function stringField(record: { get(key: string): unknown }, key: string): string | null {
  try {
    const value = record.get(key);
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function mapSupersession(record: { get(key: string): unknown }): DocumentSupersessionView | null {
  const byPolicyNumber = stringField(record, 'supersededByPolicyNumber');
  const byTitle = stringField(record, 'supersededByTitle');
  const reason = stringField(record, 'supersessionReason');
  if (!byPolicyNumber && !byTitle && !reason) return null;
  const url = stringField(record, 'supersededByUrl');
  return {
    byPolicyNumber,
    byTitle,
    citationLink: byTitle && url ? `[${byTitle}](${url})` : null,
    effective: stringField(record, 'supersessionEffective'),
    reason,
  };
}

export function createPolicyLookupPrimitiveService({ withSession }: { withSession: SessionExecutor }) {
  const lookupPolicy = async ({ policyNumber }: LookupPolicyInput): Promise<DocumentWithSectionsView[]> => {
    const candidates = candidatePolicyNumbers(policyNumber);
    if (candidates.length === 0) return [];

    return withSession(async (session) => {
      // The 0..1 supersession match runs BEFORE the section collect so it
      // can't multiply section rows.
      const result = await session.run(
        `MATCH (d:Document)
         WHERE any(pn IN $pns WHERE
           d.policy_number = pn
           OR toLower(d.policy_number) = toLower(pn)
           OR d.policy_number STARTS WITH pn)
         OPTIONAL MATCH (d)-[sup:SUPERSEDED_BY]->(cur:Document)
         OPTIONAL MATCH (d)-[:HAS_SECTION]->(s:Section)
         RETURN
           ${documentMetadataReturn('d')},
           collect({id: s.id, number: s.section_number, title: s.title}) AS sections,
           coalesce(d.archived, false) AS archived,
           sup.effective AS supersessionEffective,
           sup.reason AS supersessionReason,
           cur.policy_number AS supersededByPolicyNumber,
           cur.title AS supersededByTitle,
           cur.source_url AS supersededByUrl
         ORDER BY
           CASE WHEN archived THEN 1 ELSE 0 END,
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
        supersession: mapSupersession(record),
      })) satisfies DocumentWithSectionsView[];
    });
  };

  return {
    lookupPolicy,
  };
}
