import type { AmendmentsView, SessionExecutor } from '../types.js';
import { documentMetadataReturn, mapDocumentMetadataRecord } from '../document-metadata.js';

export function createAmendmentPrimitiveService({ withSession }: { withSession: SessionExecutor }) {
  const getAmendments = async (documentId: string): Promise<AmendmentsView> => {
    return withSession(async (session) => {
      const currentResult = await session.run(
        `MATCH (d:Document {id: $id})
         RETURN
           ${documentMetadataReturn('d')}`,
        { id: documentId },
      );
      const currentDocument =
        currentResult.records.length > 0 ? mapDocumentMetadataRecord(currentResult.records[0]) : null;

      // Cap at 50 amendments — plenty to answer "most recent" / "any since
      // 2024" questions while keeping the agent's tool response bounded.
      // Clinical coverage policies with full revision-history tables can
      // otherwise return 200+ amendments and blow through the agent's
      // 180s turn budget.
      // Cypher DESC sorts nulls FIRST: without the IS NULL key, an undated
      // change notice outranked every dated one and was presented as the
      // authoritative document.
      const amendmentResult = await session.run(
        `MATCH (d:Document {id: $id})
         OPTIONAL MATCH (amend:Document)-[r:AMENDS]->(d)
         RETURN
           ${documentMetadataReturn('amend')},
           r.change_description AS changeDescription
         ORDER BY amend.effective_date IS NULL, amend.effective_date DESC, amend.id ASC
         LIMIT 50`,
        { id: documentId },
      );

      const amendments = amendmentResult.records
        .filter((record) => record.get('id') != null)
        .map((record) => ({
          ...mapDocumentMetadataRecord(record),
          changeSummary: (record.get('changeDescription') as string | null | undefined) ?? null,
        }));

      const baseResult = await session.run(
        `MATCH (d:Document {id: $id})-[:AMENDS]->(base:Document)
         RETURN
           ${documentMetadataReturn('base')}
         LIMIT 1`,
        { id: documentId },
      );

      const baseDocument = baseResult.records.length > 0 ? mapDocumentMetadataRecord(baseResult.records[0]) : null;
      const authoritativeDocument = amendments[0]
        ? {
            id: amendments[0].id,
            title: amendments[0].title,
            documentType: amendments[0].documentType,
            policyNumber: amendments[0].policyNumber,
            effectiveDate: amendments[0].effectiveDate,
            url: amendments[0].url,
            citationLink: amendments[0].citationLink,
            status: amendments[0].status,
            authorityTier: amendments[0].authorityTier,
            answerRole: amendments[0].answerRole,
            sourceFormat: amendments[0].sourceFormat,
            answerReady: amendments[0].answerReady,
            corpusBucket: amendments[0].corpusBucket,
            variantGroup: amendments[0].variantGroup,
            variantDate: amendments[0].variantDate,
            retrievalReady: amendments[0].retrievalReady,
          }
        : currentDocument;

      return {
        amendments,
        baseDocument,
        authoritativeDocument,
      } satisfies AmendmentsView;
    });
  };

  return {
    getAmendments,
  };
}
