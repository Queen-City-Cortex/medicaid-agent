import type { ReferenceView, SessionExecutor } from '../types.js';

export function createReferencePrimitiveService({ withSession }: { withSession: SessionExecutor }) {
  const followReferences = async (sectionId: string): Promise<ReferenceView[]> => {
    return withSession(async (session) => {
      const result = await session.run(
        `MATCH (s:Section {id: $id})-[r:REFERENCES|REFERENCES_DOCUMENT]->(target)
         OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(target)
         RETURN
           target.id AS targetId,
           labels(target)[0] AS targetType,
           CASE WHEN target:Section THEN target.title ELSE target.title END AS targetTitle,
           CASE WHEN target:Section THEN d.policy_number ELSE target.policy_number END AS targetPolicyNumber,
           type(r) AS relationshipType,
           r.reference_text AS referenceText`,
        { id: sectionId },
      );

      return result.records.map((record) => ({
        targetId: record.get('targetId') as string,
        targetType: record.get('targetType') as 'Section' | 'Document',
        targetTitle: (record.get('targetTitle') as string | null | undefined) ?? null,
        targetPolicyNumber: (record.get('targetPolicyNumber') as string | null | undefined) ?? null,
        relationshipType: record.get('relationshipType') as string,
        referenceText: (record.get('referenceText') as string | null | undefined) ?? null,
      })) satisfies ReferenceView[];
    });
  };

  return {
    followReferences,
  };
}
