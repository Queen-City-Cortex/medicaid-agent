import { z } from 'zod';

export const DocumentMetadataSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  documentType: z.string().nullable(),
  policyNumber: z.string().nullable(),
  effectiveDate: z.string().nullable(),
  url: z.string().nullable(),
  status: z.string().nullable(),
});

export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

type RecordLike = {
  get(key: string): unknown;
};

export function documentMetadataReturn(alias: string): string {
  return [
    `${alias}.id AS id`,
    `${alias}.title AS title`,
    `${alias}.document_type AS documentType`,
    `${alias}.policy_number AS policyNumber`,
    `${alias}.effective_date AS effectiveDate`,
    `${alias}.source_url AS url`,
    `${alias}.status AS status`,
  ].join(',\n           ');
}

export function mapDocumentMetadataRecord(record: RecordLike): DocumentMetadata {
  return {
    id: record.get('id') as string,
    title: record.get('title') as string | null,
    documentType: record.get('documentType') as string | null,
    policyNumber: record.get('policyNumber') as string | null,
    effectiveDate: record.get('effectiveDate') as string | null,
    url: record.get('url') as string | null,
    status: record.get('status') as string | null,
  };
}
