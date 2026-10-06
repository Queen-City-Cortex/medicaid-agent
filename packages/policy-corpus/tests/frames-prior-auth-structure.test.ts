// Prior-approval frames over a real template policy: the Prior Approval
// heading leads with its text, the hit that answers the question keeps its
// text, and "Not Covered" headings never lead.

import { describe, expect, it } from 'vitest';
import { createCorpus, hitFor, queries, resolveTypedFrame, type SessionHandler } from './helpers/graph-fixtures.js';
import { expectFrameContentInvariant } from './helpers/frame-invariants.js';
import { TEMPLATE_POLICY_3L1, templatePolicyHandlers, type TemplatePolicy } from './helpers/template-policy-fixtures.js';

const QUESTION =
  'Is prior approval required for State Plan Personal Care Services provided in congregate settings under Policy 3L-1?';

function withSectionOrder(policy: TemplatePolicy, order: 'listing' | 'reversed'): TemplatePolicy {
  const sections = order === 'listing' ? policy.document.sections : [...policy.document.sections].reverse();
  return { ...policy, document: { ...policy.document, sections } };
}

function clinicalHits(policy: TemplatePolicy, hits: Array<[sectionId: string, score: number]>): SessionHandler {
  return {
    label: 'vector clinical',
    match: queries.sectionVector('clinical_policy'),
    result: { records: hits.map(([sectionId, score]) => hitFor(policy.document, sectionId, score)) },
  };
}

describe('prior-authorization frames over Policy 3L-1', () => {
  it.each(['listing', 'reversed'] as const)('leads with Prior Approval and keeps 5.6 with text (%s order)', async (order) => {
    const policy = withSectionOrder(TEMPLATE_POLICY_3L1, order);
    const hits = clinicalHits(policy, [
      ['3l-1:5.6', 0.82],
      ['3l-1:4.1', 0.8],
      ['3l-1:5.1', 0.78],
      ['3l-1:5.5', 0.76],
      ['3l-1:3.1', 0.74],
    ]);
    const { corpus } = createCorpus([hits, ...templatePolicyHandlers(policy)]);

    const frame = await resolveTypedFrame(corpus, 'prior_authorization', QUESTION);

    const surfaced = [...frame.primarySections, ...frame.supportingSections];
    const priorApproval = frame.primarySections.filter((section) => /^Prior Approval/.test(section.title ?? ''));
    expect(priorApproval.map((section) => section.sectionNumber)).toEqual(expect.arrayContaining(['5.1']));
    expect(priorApproval.every((section) => (section.content ?? '').trim().length > 0)).toBe(true);
    const golden = surfaced.find((section) => section.sectionNumber === '5.6');
    expect(golden?.content?.trim().length ?? 0).toBeGreaterThan(0);
    expect(frame.avoidSections.map((section) => section.sectionNumber)).not.toContain('5.6');
    expect(frame.primarySections.filter((section) => /not covered/i.test(section.title ?? ''))).toEqual([]);
    expectFrameContentInvariant(frame);
  });
});
