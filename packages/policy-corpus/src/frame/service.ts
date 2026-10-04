import type { FrameResolver, LegalPrimitiveService, SearchService } from '../contracts.js';
import type { SessionExecutor } from '../types.js';
import { createFrameContext } from './context.js';
import { createEvidencePlanner } from './evidence-plan.js';
import { buildEvidencePlan } from './evidence-plan.js';
import { resolveCoverageScope } from '../scope/coverage.js';
import type { AnswerFrame } from '../types.js';

export function createAnswerFrameResolver({
  searchSectionsDetailed,
  primitives,
  withSession,
}: {
  searchSectionsDetailed: SearchService['searchSectionsDetailed'];
  primitives: LegalPrimitiveService;
  withSession: SessionExecutor;
}): FrameResolver {
  const context = createFrameContext({
    searchSectionsDetailed,
    primitives,
    withSession,
  });

  const planner = createEvidencePlanner(context);

  return {
    async resolveAnswerFrame(input): Promise<AnswerFrame> {
      const scope = resolveCoverageScope(input.query);
      if (!scope) return planner.resolveAnswerFrame(input);
      const route = buildEvidencePlan(input).route;
      const frame: AnswerFrame = { questionType: 'general', route, authoritativeDocuments: [], primarySections: [], supportingSections: [], avoidSections: [], latestRevision: null, variantReasoning: null, coverageScope: scope };
      if (scope.notice) return frame;
      const ids = await withSession(async session => {
        const result = await session.run('MATCH (d:Document) WHERE d.source_url IN $urls RETURN d.id AS id ORDER BY d.id', { urls: scope.requiredSourceUrls });
        return result.records.map(record => record.get('id')).filter((id): id is string => typeof id === 'string');
      });
      const documents = await Promise.all(ids.map(id => primitives.getDocument(id)));
      for (const document of documents) {
        if (!document || document.answerReady !== true || !scope.requiredSourceUrls.includes(document.url ?? '')) continue;
        frame.authoritativeDocuments.push({ ...document, reason: 'Exact source for the supported dated coverage.' });
        const sections = await Promise.all(document.sections.map(section => primitives.getSection(section.id)));
        frame.primarySections.push(...sections.filter(section => section?.answerReady === true).map(section => ({ ...section!, reason: 'Full evidence for the coverage obligation.' })));
      }
      if (!scope.requiredSourceUrls.every(url => frame.authoritativeDocuments.some(document => document.url === url))) {
        scope.notice = 'The required applicable source is not available in this graph. I cannot establish this answer from older or unrelated guidance.';
      }
      return frame;
    },
  };
}
