import type { DocumentSupersessionView, DocumentWithSectionsView, LookupPolicyInput, SessionExecutor } from '../types.js';
import { documentMetadataReturn, mapDocumentMetadataRecord } from '../document-metadata.js';
import { mapDocumentSections, preferTypedFormDocuments } from '../internal/shared.js';

const LOOKUP_DOCUMENT_LIMIT = 25;

/** Cypher twin of `policyNumberKey` for a string expression. */
function policyNumberKeyCypher(expression: string): string {
  return `replace(replace(toUpper(${expression}), '-', ''), ' ', '')`;
}

/**
 * Expands a user/model-supplied policy number into the forms stored in the
 * graph. Federal documents are stored hyphenated ("42-CFR-440",
 * "SSA-Title-19"), but citations are naturally written "42 CFR 440",
 * "42 C.F.R. § 440.230", or "SSA Title 19" — without this, federal lookups
 * can never match. A leading "Policy", "CCP" or "Clinical Coverage Policy
 * No." is dropped, and a manual or form number is reduced to the stored
 * PREFIX-digits ("DHB-5125B" is filed under DHB-5125). Hyphen, space and
 * case differences ("1-H", "MA 2180") need no candidate: the query compares
 * policy-number keys.
 */
export function candidatePolicyNumbers(raw: string): string[] {
  const typed = raw.trim();
  if (!typed) return [];
  const candidates = new Set<string>([typed]);

  const pn = typed.replace(/^(?:clinical\s+coverage\s+)?(?:policy|ccp)\b\s*(?:no\.?|number)?\s*[:#]?\s*/i, '').trim();
  if (pn) candidates.add(pn);

  const manual = pn.match(/^(MA|DMA|DHB|DSS)[- ]?(\d{3,5})(?!\d)/i);
  if (manual) candidates.add(`${manual[1].toUpperCase()}-${manual[2]}`);

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
      // Exact number only, compared as policyNumberKey does. A prefix match
      // returned sibling policies ("1A-2" also matched 1A-20 to 1A-28) and
      // the newest sibling sorted first. A policy's revision-table entries
      // share its number but are :PolicyRevision nodes, which this does not
      // match; getAmendments returns them. Transitional: a graph loaded
      // before the relabel holds them as :Document rows of type
      // 'change_notice', which the type filter excludes. Delete the filter
      // once the serving graph is loaded with :PolicyRevision.
      // The 0..1 supersession match runs BEFORE the section collect so it
      // can't multiply section rows.
      const result = await session.run(
        `MATCH (d:Document)
         WHERE coalesce(d.document_type, '') <> 'change_notice'
           AND any(pn IN $pns WHERE
             ${policyNumberKeyCypher('d.policy_number')} = ${policyNumberKeyCypher('pn')})
         OPTIONAL MATCH (d)-[sup:SUPERSEDED_BY]->(cur:Document)
         OPTIONAL MATCH (d)-[:HAS_SECTION]->(s:Section)
         RETURN
           ${documentMetadataReturn('d')},
           collect({id: s.id, number: s.section_number, title: s.title}) AS sections,
           coalesce(d.archived, false) AS archived,
           coalesce(d.change_year, 0) AS changeYear,
           coalesce(d.change_sequence, 0) AS changeSequence,
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
           changeYear DESC,
           changeSequence DESC,
           size(coalesce(d.title, '')) ASC,
           d.id ASC
         LIMIT ${LOOKUP_DOCUMENT_LIMIT}`,
        { pns: candidates },
      );

      const documents = result.records.map((record) => ({
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
      return preferTypedFormDocuments(policyNumber, documents);
    });
  };

  return {
    lookupPolicy,
  };
}
