import type { SessionExecutor } from '../types.js';

/**
 * Corpus coverage surface.
 *
 * Exposes what's actually loaded in Neo4j so the agent, eval, and any dashboard
 * can tell when the graph drifts from the declared manifest or when a specific
 * CFR part / policy family is under-ingested.
 *
 * This is the READ side of the manifest/pipeline/graph triad:
 *   - `corpus-manifest.json` DECLARES source families that should be present.
 *   - `packages/pipeline` LOADS documents into Neo4j; its CLI writes the
 *     `SchemaVersion` node (see `getSchemaVersion` below) at the end of a load.
 *   - `getCorpusCoverage` READS back what's there so an operator can see drift.
 */

export interface SchemaVersionInfo {
  manifestHash: string | null;
  loadedAt: string | null; // ISO 8601
  pipelineVersion: string | null;
}

export interface SourceTypeCoverage {
  sourceType: string;
  documentCount: number;
  sectionCount: number;
}

export interface CfrPartCoverage {
  documentId: string;
  title: number;
  part: number;
  sectionCount: number;
}

export interface DhhsPolicyCoverage {
  policyNumber: string;
  documentCount: number;
}

export interface CorpusCoverage {
  schemaVersion: SchemaVersionInfo;
  totalDocuments: number;
  totalSections: number;
  bySourceType: SourceTypeCoverage[];
  cfrParts: CfrPartCoverage[];
  dhhsPolicies: DhhsPolicyCoverage[];
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number.parseInt(value, 10) || 0;
  // Neo4j integer objects expose `.toNumber()`.
  if (value && typeof value === 'object' && typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function toStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  // Neo4j DateTime → ISO string via toString()
  if (typeof (value as { toString?: () => string }).toString === 'function') {
    const s = (value as { toString: () => string }).toString();
    return s && s !== '[object Object]' ? s : null;
  }
  return null;
}

export async function getCorpusCoverage(withSession: SessionExecutor): Promise<CorpusCoverage> {
  return withSession(async (session) => {
    const sourceTypeResult = await session.run(
      `
      MATCH (d:Document)
      OPTIONAL MATCH (d)-[:HAS_SECTION]->(s:Section)
      WITH d.document_type AS sourceType, count(DISTINCT d) AS docs, count(s) AS secs
      RETURN coalesce(sourceType, 'unknown') AS sourceType, docs, secs
      ORDER BY sourceType
      `,
    );
    const bySourceType: SourceTypeCoverage[] = sourceTypeResult.records.map((record) => ({
      sourceType: String(record.get('sourceType') ?? 'unknown'),
      documentCount: toNumber(record.get('docs')),
      sectionCount: toNumber(record.get('secs')),
    }));

    const totalDocuments = bySourceType.reduce((sum, row) => sum + row.documentCount, 0);
    const totalSections = bySourceType.reduce((sum, row) => sum + row.sectionCount, 0);

    const cfrResult = await session.run(
      `
      MATCH (d:Document { document_type: 'federal_regulation' })
      OPTIONAL MATCH (d)-[:HAS_SECTION]->(s:Section)
      WITH d, count(s) AS secs
      RETURN d.id AS id, secs
      ORDER BY d.id
      `,
    );
    const cfrParts: CfrPartCoverage[] = cfrResult.records
      .map((record) => {
        const id = String(record.get('id') ?? '');
        const match = /^doc:federal_regulation:(\d+)-CFR-(\d+)$/i.exec(id);
        if (!match) return null;
        return {
          documentId: id,
          title: Number.parseInt(match[1], 10),
          part: Number.parseInt(match[2], 10),
          sectionCount: toNumber(record.get('secs')),
        };
      })
      .filter((entry): entry is CfrPartCoverage => entry !== null);

    const dhhsResult = await session.run(
      `
      MATCH (d:Document { document_type: 'dhhs_policy' })
      WHERE d.policy_number IS NOT NULL
      WITH d.policy_number AS pn, count(d) AS docs
      RETURN pn, docs
      ORDER BY pn
      `,
    );
    const dhhsPolicies: DhhsPolicyCoverage[] = dhhsResult.records.map((record) => ({
      policyNumber: String(record.get('pn')),
      documentCount: toNumber(record.get('docs')),
    }));

    const schemaVersion = await getSchemaVersion(withSession);

    return {
      schemaVersion,
      totalDocuments,
      totalSections,
      bySourceType,
      cfrParts,
      dhhsPolicies,
    };
  });
}

export async function getSchemaVersion(withSession: SessionExecutor): Promise<SchemaVersionInfo> {
  return withSession(async (session) => {
    const result = await session.run(
      'MATCH (v:SchemaVersion {id: "current"}) RETURN v.manifest_hash AS h, v.loaded_at AS l, v.pipeline_version AS p',
    );
    const record = result.records[0];
    if (!record) {
      return { manifestHash: null, loadedAt: null, pipelineVersion: null };
    }
    return {
      manifestHash: toStringOrNull(record.get('h')),
      loadedAt: toStringOrNull(record.get('l')),
      pipelineVersion: toStringOrNull(record.get('p')),
    };
  });
}
