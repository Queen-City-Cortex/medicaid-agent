import { z } from 'zod';

export const DocumentMetadataSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  documentType: z.string().nullable(),
  policyNumber: z.string().nullable(),
  effectiveDate: z.string().nullable(),
  sourceModifiedDate: z.string().nullable().optional(),
  retrievedAt: z.string().nullable().optional(),
  url: z.string().nullable(),
  /** Pre-built markdown link for citations — paste verbatim into answers. */
  citationLink: z.string().nullable(),
  status: z.string().nullable(),
  authorityTier: z.string().nullable(),
  answerRole: z.string().nullable(),
  sourceFormat: z.string().nullable(),
  answerReady: z.boolean().nullable(),
  corpusBucket: z.string().nullable(),
  variantGroup: z.string().nullable(),
  variantDate: z.string().nullable(),
  retrievalReady: z.boolean().nullable(),
});
