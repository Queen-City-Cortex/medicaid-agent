import type { DocumentView, SessionRecordLike } from './types.js';

type MetadataField =
  | 'id'
  | 'title'
  | 'documentType'
  | 'policyNumber'
  | 'effectiveDate'
  | 'sourceModifiedDate'
  | 'retrievedAt'
  | 'url'
  | 'status'
  | 'authorityTier'
  | 'answerRole'
  | 'sourceFormat'
  | 'answerReady'
  | 'corpusBucket'
  | 'variantGroup'
  | 'variantDate'
  | 'retrievalReady';

const FIELD_EXPR: Record<MetadataField, string> = {
  id: 'id',
  title: 'title',
  documentType: 'document_type',
  policyNumber: 'policy_number',
  effectiveDate: 'effective_date',
  sourceModifiedDate: 'source_modified_date',
  retrievedAt: 'retrieved_at',
  url: 'source_url',
  status: 'status',
  authorityTier: 'authority_tier',
  answerRole: 'answer_role',
  sourceFormat: 'source_format',
  answerReady: 'answer_ready',
  corpusBucket: 'corpus_bucket',
  variantGroup: 'variant_group',
  variantDate: 'variant_date',
  retrievalReady: 'retrieval_ready',
};

const FIELDS: MetadataField[] = [
  'id',
  'title',
  'documentType',
  'policyNumber',
  'effectiveDate',
  'sourceModifiedDate',
  'retrievedAt',
  'url',
  'status',
  'authorityTier',
  'answerRole',
  'sourceFormat',
  'answerReady',
  'corpusBucket',
  'variantGroup',
  'variantDate',
  'retrievalReady',
];

function aliasField(prefix: string, field: MetadataField): string {
  if (!prefix) return field;
  return `${prefix}${field[0].toUpperCase()}${field.slice(1)}`;
}

export function documentMetadataReturn(alias: string, prefix = ''): string {
  return FIELDS.map((field) => `${alias}.${FIELD_EXPR[field]} AS ${aliasField(prefix, field)}`).join(',\n           ');
}

function recordStringValue(record: SessionRecordLike, prefix: string, field: MetadataField): string | null {
  const value = record.get(aliasField(prefix, field));
  return value == null ? null : String(value);
}

function recordBooleanValue(record: SessionRecordLike, prefix: string, field: MetadataField): boolean | null {
  const value = record.get(aliasField(prefix, field));
  return value == null ? null : Boolean(value);
}

export function mapDocumentMetadataRecord(record: SessionRecordLike, prefix = ''): DocumentView {
  const title = recordStringValue(record, prefix, 'title');
  const url = recordStringValue(record, prefix, 'url');
  const sourceModifiedDate = recordStringValue(record, prefix, 'sourceModifiedDate');
  const retrievedAt = recordStringValue(record, prefix, 'retrievedAt');
  return {
    id: recordStringValue(record, prefix, 'id') ?? '',
    title,
    documentType: recordStringValue(record, prefix, 'documentType'),
    policyNumber: recordStringValue(record, prefix, 'policyNumber'),
    effectiveDate: recordStringValue(record, prefix, 'effectiveDate'),
    ...(sourceModifiedDate !== null ? { sourceModifiedDate } : {}),
    ...(retrievedAt !== null ? { retrievedAt } : {}),
    url,
    citationLink: title && url ? `[${title}](${url})` : null,
    status: recordStringValue(record, prefix, 'status'),
    authorityTier: recordStringValue(record, prefix, 'authorityTier'),
    answerRole: recordStringValue(record, prefix, 'answerRole'),
    sourceFormat: recordStringValue(record, prefix, 'sourceFormat'),
    answerReady: recordBooleanValue(record, prefix, 'answerReady'),
    corpusBucket: recordStringValue(record, prefix, 'corpusBucket'),
    variantGroup: recordStringValue(record, prefix, 'variantGroup'),
    variantDate: recordStringValue(record, prefix, 'variantDate'),
    retrievalReady: recordBooleanValue(record, prefix, 'retrievalReady'),
  };
}
