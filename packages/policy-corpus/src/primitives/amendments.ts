import type { AmendmentDocumentView, AmendmentsView, SessionExecutor } from '../types.js';
import { documentMetadataReturn, mapDocumentMetadataRecord } from '../document-metadata.js';
import { extractChangeMarkerValue } from '../internal/change-markers.js';
import { amendmentRecencyOrder, toOptionalInteger } from '../internal/record-mapping.js';

// Plenty to answer "most recent" / "any since 2024" questions while keeping
// the agent's tool response bounded. Clinical coverage policies with full
// revision-history tables can otherwise return 200+ amendments and blow
// through the agent's 180s turn budget.
const AMENDMENT_LIMIT = 50;

function amendmentYear(amendment: AmendmentDocumentView): number {
  if (amendment.changeYear !== null) return amendment.changeYear;
  const year = Number.parseInt(amendment.effectiveDate?.slice(0, 4) ?? '', 10);
  return Number.isFinite(year) ? year : 0;
}

/** Newest first: year, then notice sequence, then date, then id. Mirrors `amendmentRecencyOrder`. */
export function compareAmendmentRecency(a: AmendmentDocumentView, b: AmendmentDocumentView): number {
  const aDate = a.effectiveDate ?? '';
  const bDate = b.effectiveDate ?? '';
  return (
    amendmentYear(b) - amendmentYear(a) ||
    (b.changeSequence ?? 0) - (a.changeSequence ?? 0) ||
    (aDate === bDate ? 0 : aDate < bDate ? 1 : -1) ||
    (a.id === b.id ? 0 : a.id < b.id ? -1 : 1)
  );
}

/**
 * Transitional, until the first corpus release after the loader began storing
 * a notice's year and sequence: on a graph built before that, a DHHS change
 * notice carries a fabricated January 1 date and no number, so same-year
 * notices tie. Read the number from the title and drop the fabricated date.
 * Delete once the serving graph stores `change_year`.
 */
function withNoticeNumberFromTitle(amendment: AmendmentDocumentView): AmendmentDocumentView {
  if (amendment.changeYear !== null || amendment.status !== 'amendment') return amendment;
  const marker = extractChangeMarkerValue(amendment.title);
  if (marker === null) return amendment;
  return {
    ...amendment,
    changeYear: Math.floor(marker / 100),
    changeSequence: marker % 100,
    effectiveDate: amendment.effectiveDate?.endsWith('-01-01') ? null : amendment.effectiveDate,
  };
}

export function createAmendmentPrimitiveService({ withSession }: { withSession: SessionExecutor }) {
  const getAmendments = async (documentId: string): Promise<AmendmentsView> => {
    return withSession(async (session) => {
      const documentResult = await session.run(
        `MATCH (d:Document {id: $id})
         RETURN
           ${documentMetadataReturn('d')}`,
        { id: documentId },
      );
      const document = documentResult.records.length > 0 ? mapDocumentMetadataRecord(documentResult.records[0]) : null;

      // One row past the cap shows whether the history was cut.
      const amendmentResult = await session.run(
        `MATCH (d:Document {id: $id})
         OPTIONAL MATCH (amend:Document)-[r:AMENDS]->(d)
         RETURN
           ${documentMetadataReturn('amend')},
           amend.change_year AS changeYear,
           amend.change_sequence AS changeSequence,
           r.change_description AS changeDescription
         ORDER BY ${amendmentRecencyOrder('amend')},
           amend.id ASC
         LIMIT ${AMENDMENT_LIMIT + 1}`,
        { id: documentId },
      );

      const history = amendmentResult.records
        .filter((record) => record.get('id') != null)
        .map((record) => withNoticeNumberFromTitle({
          ...mapDocumentMetadataRecord(record),
          changeSummary: (record.get('changeDescription') as string | null | undefined) ?? null,
          changeYear: toOptionalInteger(record.get('changeYear')),
          changeSequence: toOptionalInteger(record.get('changeSequence')),
        }))
        .sort(compareAmendmentRecency);
      const amendments = history.slice(0, AMENDMENT_LIMIT);

      // A change notice often amends several manuals, so all of them are
      // returned. A manual without a policy number sorts last.
      const amendsResult = await session.run(
        `MATCH (d:Document {id: $id})-[:AMENDS]->(base:Document)
         RETURN
           ${documentMetadataReturn('base')}
         ORDER BY base.policy_number ASC, base.id ASC`,
        { id: documentId },
      );

      return {
        document,
        amends: amendsResult.records.map((record) => mapDocumentMetadataRecord(record)),
        amendments,
        latestAmendment: amendments[0] ?? null,
        truncated: history.length > AMENDMENT_LIMIT,
      } satisfies AmendmentsView;
    });
  };

  return {
    getAmendments,
  };
}
