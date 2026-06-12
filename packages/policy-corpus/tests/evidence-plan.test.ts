import { describe, expect, it } from 'vitest';
import { buildEvidencePlan } from '../src/frame/evidence-plan.js';

describe('buildEvidencePlan', () => {
  it('routes coverage questions to the coverage pipeline on the baseline lane', () => {
    const plan = buildEvidencePlan({
      query: 'Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?',
    });

    expect(plan.pipeline).toBe('coverage');
    expect(plan.route.lane).toBe('baseline_hybrid');
    expect(plan.route.determinism_hints.cite_scope_and_not_covered).toBe(true);
  });

  it('keeps federal authority questions on the graph-reasoning lane', () => {
    const plan = buildEvidencePlan({
      query: 'What federal authority governs medical loss ratio requirements in NC managed care contracts?',
    });

    expect(plan.pipeline).toBe('federal_authority');
    expect(plan.route.lane).toBe('graph_reasoning');
  });

  it('plans prior-authorization and amendment paths', () => {
    const priorAuthPlan = buildEvidencePlan({
      query: 'What prior approval criteria apply under Policy 9A?',
    });
    const amendmentPlan = buildEvidencePlan({
      query: 'What is the latest change notice for MA-3550?',
    });

    expect(priorAuthPlan.pipeline).toBe('prior_authorization');
    expect(amendmentPlan.pipeline).toBe('amendment');
    expect(amendmentPlan.route.determinism_hints.latest_revision_only).toBe(true);
  });
});
