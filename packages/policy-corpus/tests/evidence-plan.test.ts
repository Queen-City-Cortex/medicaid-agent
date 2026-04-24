import { describe, expect, it } from 'vitest';
import { buildEvidencePlan } from '../src/frame/evidence-plan.js';

describe('buildEvidencePlan', () => {
  it('centralizes coverage routing diagnostics', () => {
    const plan = buildEvidencePlan({
      query: 'Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?',
    });

    expect(plan.pipeline).toBe('coverage');
    expect(plan.route.determinism_hints.cite_scope_and_not_covered).toBe(true);
    expect(plan.diagnostics.searchProfile).toBe('baseline_hybrid');
    expect(plan.diagnostics.sourceFamilies).toContain('clinical_policy');
  });

  it('keeps federal authority questions on federal and implementation sources', () => {
    const plan = buildEvidencePlan({
      query: 'What federal authority governs medical loss ratio requirements in NC managed care contracts?',
    });

    expect(plan.pipeline).toBe('federal_authority');
    expect(plan.route.lane).toBe('graph_reasoning');
    expect(plan.diagnostics.sourceFamilies).toEqual(
      expect.arrayContaining(['federal_regulation', 'state_plan_amendment', 'managed_care_contract']),
    );
  });

  it('plans prior-authorization and amendment paths without changing the public resolver API', () => {
    const priorAuthPlan = buildEvidencePlan({
      query: 'What prior approval criteria apply under Policy 9A?',
    });
    const amendmentPlan = buildEvidencePlan({
      query: 'What is the latest change notice for MA-3550?',
    });

    expect(priorAuthPlan.pipeline).toBe('prior_authorization');
    expect(priorAuthPlan.diagnostics.sourceFamilies).toEqual(['clinical_policy', 'pharmacy_policy']);
    expect(amendmentPlan.pipeline).toBe('amendment');
    expect(amendmentPlan.route.determinism_hints.latest_revision_only).toBe(true);
    expect(amendmentPlan.diagnostics.sourceFamilies).toEqual(['dhhs_policy', 'change_notice']);
  });
});
