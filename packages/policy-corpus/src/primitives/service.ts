import type { LegalPrimitiveService } from '../contracts.js';
import type { SessionExecutor } from '../types.js';
import { createSectionPrimitiveService } from './sections.js';
import { createReferencePrimitiveService } from './references.js';
import { createAmendmentPrimitiveService } from './amendments.js';
import { createPolicyLookupPrimitiveService } from './policy-lookup.js';
import { createConceptPrimitiveService } from './concepts.js';

export function createLegalPrimitiveService({ withSession }: { withSession: SessionExecutor }): LegalPrimitiveService {
  return {
    ...createSectionPrimitiveService({ withSession }),
    ...createReferencePrimitiveService({ withSession }),
    ...createAmendmentPrimitiveService({ withSession }),
    ...createPolicyLookupPrimitiveService({ withSession }),
    ...createConceptPrimitiveService({ withSession }),
  };
}
