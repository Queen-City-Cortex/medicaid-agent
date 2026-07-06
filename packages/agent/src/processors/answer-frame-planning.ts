import type { Processor, ProcessInputStepArgs, ProcessInputStepResult } from '@mastra/core/processors';
import type { AnswerFrame, AnswerFrameDocument, AnswerFrameSection } from '@nc-medicaid/policy-corpus';
import { contentText, latestToolResult, latestUserText } from './message-utils.js';

interface ResolveAnswerFrameResult {
  frame: AnswerFrame;
}

const PLAN_MARKER = '[answer-frame-plan]';
const CHECKLIST_LIMIT = 6;

function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase();
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

function isYesNoCoverageQuestion(questionLower: string): boolean {
  return /^(does|is|can)\b/.test(questionLower) && /\bcover\b/.test(questionLower);
}

function asksForTelehealthServiceList(questionLower: string): boolean {
  return (
    questionLower.includes('telehealth') &&
    includesAny(questionLower, [
      'which services',
      'what services',
      'which service',
      'what service',
      'which codes',
      'what codes',
      'eligible service',
      'telehealth-eligible',
      'telehealth eligible',
      'cpt',
      'hcpcs',
      'billing code',
      'code-by-code',
    ])
  );
}

function isPharmacyQuantityPriorAuthQuestion(questionLower: string): boolean {
  return (
    includesAny(questionLower, ['quantity limit', 'quantity limits', 'quantity limitation', 'quantity limitations', 'episodic']) &&
    includesAny(questionLower, ['pharmacy', 'pharmacy claims', 'prescription drug', 'prescription drugs', 'drug', 'drugs'])
  );
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function isAttachmentSection(section: AnswerFrameSection): boolean {
  return normalize(section.sectionNumber).startsWith('attachment ') || normalize(section.title).startsWith('attachment ');
}

function sectionText(section: AnswerFrameSection): string {
  return `${normalize(section.title)} ${normalize(section.content)}`.trim();
}

function sectionLabel(section: AnswerFrameSection): string {
  const label = section.sectionNumber ? `§ ${section.sectionNumber}` : section.title || '(untitled section)';
  if (section.sectionNumber && section.title && !normalize(section.title).startsWith(normalize(section.sectionNumber))) {
    return `${label} ${section.title}`;
  }
  return label;
}

function listSections(sections: AnswerFrameSection[], limit = 3): string {
  return sections.slice(0, limit).map(sectionLabel).join('; ');
}

function listDocuments(documents: AnswerFrameDocument[], limit = 3): string {
  return documents
    .slice(0, limit)
    .map((document) => {
      if (document.policyNumber && document.title) return `${document.policyNumber} (${document.title})`;
      return document.policyNumber || document.title || '(unknown document)';
    })
    .join('; ');
}

function matchingSections(sections: AnswerFrameSection[], phrases: string[]): AnswerFrameSection[] {
  return sections.filter((section) => includesAny(sectionText(section), phrases));
}

function sectionNumberDepth(sectionNumber: string | null | undefined): number {
  const normalized = normalize(sectionNumber);
  if (normalized.length === 0) return 0;
  return normalized.split('.').filter((segment) => segment.length > 0).length;
}

function hasProcedureCode(section: AnswerFrameSection): boolean {
  return /\b\d{5}\b/.test(sectionText(section));
}

function buildCoverageChecklist(questionLower: string, frame: ResolveAnswerFrameResult['frame']): string[] {
  const allSections = unique([...frame.primarySections, ...frame.supportingSections]);
  const checklist: string[] = [];
  const telehealthSections = matchingSections(allSections, ['telehealth']);
  const telehealthServiceListQuestion = asksForTelehealthServiceList(questionLower);
  const ambulanceNotCoveredQuestion = questionLower.includes('ambulance') && includesAny(questionLower, ['not covered', 'not cover']);
  const yesNoCoverageQuestion = isYesNoCoverageQuestion(questionLower);
  const generalEligibilityQuestion = includesAny(questionLower, ['eligibility criteria', 'general eligibility']);
  const generalSections = matchingSections(allSections, [
    'epsdt',
    'eligibility',
    'general criteria',
    'criteria covered',
    'specific criteria covered',
    'scope',
    'description',
    'general provisions',
  ]);
  const serviceSpecificSections = matchingSections(allSections, [
    'speech-language therapy',
    'speech -language therapy',
    'speech/language evaluation',
    'speech/language treatment',
    'audiology',
    'therapy',
    'equipment, modification and technology',
    'home modification',
  ]);
  const documentationSections = matchingSections(allSections, [
    'documentation',
    'documented',
    'documented findings',
    'training',
    'statement of need',
    'recommendation',
    'beneficiary need',
    'physician order',
    'plan of care',
    'signed',
  ]);
  const limitationSections = matchingSections(allSections, ['not covered', 'limitation', 'limitations', 'exclusion']);
  const generalLimitationSections = limitationSections.filter((section) =>
    includesAny(sectionText(section), ['general criteria not covered', 'general not covered']),
  );
  const specificLimitationSections = limitationSections.filter((section) =>
    includesAny(sectionText(section), [
      'specific criteria not covered',
      'specific exclusion',
      'comfort or convenience',
      'other non-covered',
      'other noncovered',
      'room and board',
    ]) || sectionNumberDepth(section.sectionNumber) >= 3,
  );
  const premiumSections = matchingSections(allSections, ['premium', 'premiums', 'enrollment fee', 'cost sharing']);
  const telehealthTableSections = matchingSections(allSections, [
    'telehealth eligible service',
    'speech/language evaluation',
    'speech/language treatment',
  ]);
  const airAmbulanceSections = matchingSections(allSections, ['air medical ambulance', 'air ambulance']);
  const personalCareSections = matchingSections(allSections, ['personal care services']);
  const roomAndBoardSections = matchingSections(allSections, ['room and board']);
  const congregateWorkflowSections = matchingSections(
    unique([...allSections, ...frame.avoidSections]),
    ['assessment', 'admission', 'expedited'],
  );
  const baselineEligibilitySections = matchingSections(allSections, ['general provisions', '2.1.1']);
  const generalCoveredSections = matchingSections(allSections, ['3.1', 'general criteria covered']);
  const specificEligibilitySections = matchingSections(allSections, ['3.2.1', 'specific criteria covered']);
  const eligibilityScopeSections = matchingSections(allSections, ['18 years of age', 'adult with disabilities', 'risk of institutionalization']);

  if (generalSections.length > 0) {
    checklist.push(`Start with the governing coverage rule from ${listSections(generalSections)} before lower-level details.`);
  }

  if (generalEligibilityQuestion && generalSections.length > 0) {
    if (baselineEligibilitySections.length > 0 && generalCoveredSections.length > 0 && specificEligibilitySections.length > 0) {
      checklist.push(
        `For this general eligibility question, build the answer in layers: baseline Medicaid/program eligibility from ${listSections(baselineEligibilitySections, 1)}, then general covered criteria from ${listSections(generalCoveredSections, 1)}, then the CAP/DA- or service-specific criteria from ${listSections(specificEligibilitySections, 1)}.`,
      );
    }
    if (eligibilityScopeSections.length > 0) {
      checklist.push(
        `If the surfaced scope text ${listSections(eligibilityScopeSections, 1)} states an age or program-boundary requirement, include that briefly as scope context instead of skipping straight to provider or reimbursement operations.`,
      );
    }
  }

  if (
    yesNoCoverageQuestion &&
    generalSections.length > 0 &&
    limitationSections.length > 0 &&
    !includesAny(questionLower, ['assisted living', 'congregate'])
  ) {
    checklist.push(
      `For this yes/no coverage question, answer yes or no first, then cite both the scope section ${listSections(generalSections, 1)} and the not-covered section ${listSections(limitationSections, 1)}.`,
    );
    checklist.push(
      'If the surfaced scope or description section shows that this policy governs a different service category than the one asked about, say that plainly, keep the citations on the scope/not-covered sections, and avoid padding the answer with broader criteria that do not change the yes/no result.',
    );
  }

  // Evidence-gated EPSDT-exception directive for ADULT exclusion questions:
  // fires only when the frame actually surfaced the policy's EPSDT
  // special-provision section, instructs read-and-cite, and asserts nothing
  // about what the exception allows (de-contamination guarantee). Questions
  // that themselves ask about under-21/EPSDT use the pairing directive below
  // instead. Uses a local coverage matcher: the shared yes/no regex misses
  // "covered" phrasing (separate follow-up).
  const epsdtExceptionSections = matchingSections(allSections, [
    'epsdt special provision',
    'exception to policy limitations',
  ]);
  const adultExclusionQuestion =
    /\bcover(s|ed|age)?\b/.test(questionLower) &&
    !includesAny(questionLower, ['under age 21', 'under 21', 'epsdt', 'child', 'children', 'pediatric']);
  if (epsdtExceptionSections.length > 0 && adultExclusionQuestion) {
    checklist.push(
      `The frame surfaced an EPSDT special-provision section (${listSections(epsdtExceptionSections, 1)}). Before finalizing a no-coverage conclusion for adults, read that section and state what it says about beneficiaries under 21, citing it. Do not assert what the exception allows beyond that section's text.`,
    );
  }

  if (questionLower.includes('telehealth') && telehealthSections.length > 0) {
    checklist.push(`Lead with the telehealth-specific state rule from ${listSections(telehealthSections, 1)}.`);
    checklist.push('Use the state telehealth conditions first. Do not widen to cross-referenced telehealth background or federal rules unless the user explicitly asks for them or the state section leaves a material gap.');

    const telehealthText = telehealthSections.map(sectionText).join('\n');
    if (
      includesAny(telehealthText, [
        'exposure to others should be avoided',
        'remote or underserved',
        'adjunct to in-person care',
        'best interest of the beneficiary',
        'convenience for the therapist',
        'increase therapist productivity',
      ])
    ) {
      checklist.push('State the beneficiary-specific telehealth conditions explicitly: why telehealth is medically necessary, when it must remain adjunct to in-person care, and that it cannot be used for therapist convenience or productivity.');
    }

    if (serviceSpecificSections.length > 0) {
      checklist.push(
        telehealthServiceListQuestion
          ? `Use ${listSections(serviceSpecificSections)} to explain which speech-language services or code families are surfaced as telehealth-eligible, while keeping the governing conditions first.`
          : `Use ${listSections(serviceSpecificSections)} only to explain that the ordinary speech-language therapy criteria still apply, and cite that section separately from the telehealth rule when you mention documentation or service-specific limits.`,
      );
    }
    if (!telehealthServiceListQuestion && documentationSections.length > 0) {
      checklist.push(
        `Tie the documentation point from ${listSections(documentationSections, 1)} to the beneficiary-specific telehealth conditions: say the chart should document why telehealth is medically necessary or appropriate for this beneficiary when the surfaced sections support that.`,
      );
    }
    if (!telehealthServiceListQuestion && telehealthTableSections.length > 0) {
      checklist.push(
        'Do not enumerate telehealth-eligible CPT or billing-code tables for this conditions question. Say only that selected speech-language services may be eligible if that context is needed.',
      );
    } else if (telehealthTableSections.length > 0 && !telehealthTableSections.some(hasProcedureCode)) {
      checklist.push(
        'Do not enumerate CPT or billing-code lists unless those exact codes appear in the surfaced sections. If the surfaced telehealth sections only say selected services are eligible, say that without inventing the code list.',
      );
    }
  }

  if (
    includesAny(questionLower, ['under age 21', 'under 21', 'epsdt']) &&
    generalSections.length > 0 &&
    serviceSpecificSections.length > 0
  ) {
    checklist.push(
      `Pair the general EPSDT / pediatric rule with the discipline-specific sections ${listSections(serviceSpecificSections)}.`,
    );
  }

  if (includesAny(questionLower, ['requirements', 'requirement', 'documentation', 'must']) && documentationSections.length > 0) {
    checklist.push(
      `Separate baseline coverage criteria from documentation requirements. Use ${listSections(
        generalSections.length > 0 ? generalSections : frame.primarySections,
      )} for coverage, then ${listSections(documentationSections)} for documentation.`,
    );
  }

  if (includesAny(questionLower, ['not covered', 'not cover']) && limitationSections.length > 0) {
    checklist.push(`Answer the not-covered or limitation part explicitly from ${listSections(limitationSections)}.`);
    if (generalLimitationSections.length > 0 && specificLimitationSections.length > 0 && generalSections.length > 0) {
      checklist.push(
        `Separate the general exclusions in ${listSections(generalLimitationSections, 1)} from the item-specific exclusions in ${listSections(specificLimitationSections, 1)}, then return to the governing coverage criteria in ${listSections(generalSections, 2)}.`,
      );
    }
  }

  if (ambulanceNotCoveredQuestion && specificLimitationSections.length > 0) {
    checklist.push(
      `For this ambulance non-covered question, lead with ${listSections(specificLimitationSections, 1)} and keep general exclusions secondary unless they add a missing limit.`,
    );
    if (airAmbulanceSections.length > 0) {
      checklist.push(
        `Use ${listSections(airAmbulanceSections, 1)} only to explain the narrow situations where air ambulance remains covered, so the exclusions are clearly bounded.`,
      );
    }
  }

  if (
    includesAny(questionLower, ['assisted living', 'congregate']) &&
    generalSections.length > 0 &&
    personalCareSections.length > 0
  ) {
    checklist.push(
      `For congregate-setting PCS questions, use ${listSections(generalSections, 1)} for the beneficiary and facility criteria, ${listSections(personalCareSections, 1)} for the covered PCS service scope, and ${listSections(roomAndBoardSections, 1)} for room-and-board exclusions when surfaced.`,
    );
    if (congregateWorkflowSections.length > 0) {
      checklist.push(
        `Do not cite workflow sections like ${listSections(congregateWorkflowSections, 1)} unless the user specifically asked about assessments, admissions, or expedited processing.`,
      );
    }
    checklist.push('Keep assessment or admission-procedure sections secondary unless the user specifically asks about authorization, attestation, or admissions workflow.');
  }

  if (includesAny(questionLower, ['premium', 'premiums', 'enrollment fee', 'cost sharing']) && premiumSections.length > 0) {
    checklist.push(
      `Use ${listSections(premiumSections)} for premium or fee terms, and state only the numeric thresholds or dollar amounts that appear directly in those sections.`,
    );
    checklist.push('Do not reconstruct full premium charts, FPL dollar conversions, or later update notices unless those exact figures are present in the surfaced evidence.');
    if (frame.route.lane === 'deterministic_evidence') {
      checklist.push('If the current authoritative text points to a premium chart without reproducing the current figures, say the premium structure is verified but the current monthly dollar amounts were not confirmed in surfaced evidence.');
    }
  }

  if (frame.avoidSections.some(isAttachmentSection) || allSections.some(isAttachmentSection)) {
    checklist.push('Do not lead with attachments, forms, or request-process sections unless the user explicitly asked for them.');
  }

  return checklist.slice(0, CHECKLIST_LIMIT);
}

function buildPriorAuthChecklist(questionLower: string, frame: ResolveAnswerFrameResult['frame']): string[] {
  const allSections = unique([...frame.primarySections, ...frame.supportingSections]);
  const checklist: string[] = [];
  const pharmacyQuantityQuestion = isPharmacyQuantityPriorAuthQuestion(questionLower);
  const quantitySections = matchingSections(allSections, [
    'quantity and episodic drugs',
    'quantity limitation',
    'quantity limitations',
    'episodic drug',
    'episodic drugs',
  ]);
  const criteriaSections = matchingSections(allSections, [
    'pharmacy prior approval drugs and criteria',
    'prior approval drugs and criteria',
    'attachment k',
    'pharmacy prior approval criteria',
  ]);
  const attachmentCriteriaSections = criteriaSections.filter(isAttachmentSection);
  const contentfulCriteriaSections = criteriaSections.filter((section) => !isAttachmentSection(section) || (section.content ?? '').trim().length > 0);
  const requestProcessSections = unique([
    ...matchingSections([...allSections, ...frame.avoidSections], [
      'requesting prior authorization',
      'prior authorization process',
      'retroactive prior authorization',
      'web portal',
      'fax',
      'phone',
    ]),
  ]);
  const exceptionSections = unique([
    ...matchingSections([...allSections, ...frame.avoidSections], [
      'exceptions to fda and nc medicaid drug criteria approval',
      'peer-reviewed medical literature',
      'requested drug',
    ]),
  ]);

  if (pharmacyQuantityQuestion && (quantitySections.length > 0 || criteriaSections.length > 0)) {
    checklist.push(
      `Lead with the surfaced quantity-limit and criteria sections ${listSections([...quantitySections, ...criteriaSections], 2)}.${frame.authoritativeDocuments[0]?.policyNumber ? ` Name the governing source by policy number first: ${frame.authoritativeDocuments[0].policyNumber}. Use the title only as supporting citation context if needed.` : ''}`,
    );
    checklist.push(
      `For this pharmacy quantity-limit question, read ${listSections(quantitySections, 1)} and state the yes/no conclusion only as that text supports it. Then use ${listSections(contentfulCriteriaSections.length > 0 ? contentfulCriteriaSections : criteriaSections, 1)}${attachmentCriteriaSections.length > 0 ? ` together with ${listSections(attachmentCriteriaSections, 1)}` : ''} to explain which drugs or categories the pharmacy prior-approval criteria list as requiring prior authorization.`,
    );
    checklist.push(
      'Do not present a partial sample drug list as if it were exhaustive. If you mention examples, label them as examples only; otherwise say Attachment K / the pharmacy prior-approval criteria contains the detailed list. Keep request-process or exception procedures secondary unless the user asks about them.',
    );
    return checklist.slice(0, CHECKLIST_LIMIT);
  }

  if (frame.primarySections.length > 0) {
    checklist.push(`Lead with the criteria sections ${listSections(frame.primarySections)}.`);
  }
  if (includesAny(questionLower, ['quantity limit', 'quantity limits', 'episodic'])) {
    checklist.push('Separate quantity-limit rules from prior-approval categories or drug lists.');
  }
  if (frame.authoritativeDocuments[0]?.policyNumber) {
    checklist.push(`Name the governing source by policy number first: ${frame.authoritativeDocuments[0].policyNumber}.`);
  }
  if (requestProcessSections.length > 0 || frame.avoidSections.length > 0) {
    checklist.push('Keep request-process or submission instructions secondary unless the user asks how to submit.');
  }
  if (pharmacyQuantityQuestion && exceptionSections.length > 0) {
    checklist.push('Keep off-label or exception-request procedures secondary unless the user asks about exceptions to the standard drug criteria.');
  }

  return checklist.slice(0, CHECKLIST_LIMIT);
}

function buildFederalChecklist(questionLower: string, frame: ResolveAnswerFrameResult['frame']): string[] {
  const allSections = unique([...frame.primarySections, ...frame.supportingSections]);
  const allText = allSections.map(sectionText).join('\n');
  const conditions: string[] = [];
  const checklist: string[] = [];
  const waiverApplicationQuestion =
    questionLower.includes('waiver') &&
    includesAny(questionLower, ['application', 'demonstrate', 'must show', 'need to demonstrate', 'need to show']);
  const publicNoticeQuestion = includesAny(questionLower, ['public notice', 'comment period', 'public hearing', 'notice and comment']);
  const enforcementSections = matchingSections(frame.supportingSections, [
    'annually submit',
    'annual reporting',
    'remittance',
    'state oversight',
  ]);
  const ncImplementationSections = matchingSections(frame.supportingSections, [
    'medical loss ratio',
    'mlr',
    'minimum mlr',
    'calculate and report',
    'rebate',
    'remittance',
    'contract',
  ]);
  const mlrMethodologySections = matchingSections(allSections, [
    'numerator',
    'denominator',
    'credibility adjustment',
    'credibility adjusted',
    'aggregation',
    'incurred claims',
    'quality improvement',
  ]);
  const waiverApplicationSections = matchingSections(allSections, [
    'request for a waiver',
    'supporting documentation required',
    'assurances',
    'home and community-based services',
    'level of care',
    'target group',
    'service to be furnished',
    'geographic area',
    'number of individuals',
    'person-centered service plan',
  ]);
  const publicNoticeSections = matchingSections(unique([...frame.primarySections, ...frame.supportingSections, ...frame.avoidSections]), [
    'public notice',
    'comment period',
    'public hearings',
    '431.408',
  ]);

  if (frame.primarySections.length > 0) {
    checklist.push(`Lead with the federal rule from ${listSections(frame.primarySections, 1)}.`);
  }

  if (waiverApplicationQuestion && waiverApplicationSections.length > 0) {
    checklist.push(
      `For this waiver-application question, keep the core answer on ${listSections(waiverApplicationSections, 2)} and enumerate the concrete showings those sections actually surface, such as level of care, target group, services, safeguards, or supporting documentation.`,
    );
    if (publicNoticeSections.length > 0 && !publicNoticeQuestion) {
      checklist.push(
        `Keep the public-notice procedure in ${listSections(publicNoticeSections, 1)} clearly secondary unless the user explicitly asks about notice, hearings, or comment requirements.`,
      );
    }
  }

  if (allText.includes('order of a physician') || includesAny(allText, ['nurse practitioner', 'clinical nurse specialist', 'physician assistant'])) {
    conditions.push('ordering practitioner requirements');
  }
  if (allText.includes('written plan of care')) {
    conditions.push('written plan of care');
  }
  if (allText.includes('60 days')) {
    conditions.push('60-day review cycle');
  }
  if (conditions.length > 0) {
    checklist.push(`Include the core conditions in that same section: ${conditions.join(', ')}.`);
  }

  if (allText.includes('calculate and report') && allText.includes('if a state elects')) {
    checklist.push('Separate the unconditional reporting/calculation duties from any conditional minimum-threshold requirement in the same rule.');
  }

  // Evidence-gated: only direct the model at a place-of-residence rule when
  // the surfaced text actually contains one — question keywords alone
  // previously injected this directive with no supporting evidence.
  if (allText.includes('place of residence')) {
    checklist.push('The surfaced sections mention a place-of-residence rule — state it and any excluded settings explicitly, citing the section that contains them.');
  }

  if (includesAny(questionLower, ['enforce', 'enforced', 'implementation', 'implement']) && enforcementSections.length > 0) {
    checklist.push(`Use the enforcement/reporting section ${listSections(enforcementSections, 1)} before broader oversight context.`);
  }

  if (includesAny(questionLower, ['medical loss ratio', 'mlr']) && mlrMethodologySections.length > 0) {
    checklist.push(
      `Summarize the federal MLR methodology from ${listSections(mlrMethodologySections, 2)} at a high level, including the surfaced numerator/denominator or adjustment rules before turning to NC implementation.`,
    );
  }

  if (includesAny(questionLower, ['medical loss ratio', 'mlr']) && ncImplementationSections.length > 0) {
    checklist.push(
      `For NC implementation, use ${listSections(ncImplementationSections, 2)} to say whether the surfaced NC evidence sets a minimum threshold in contract or SPA text, or only reporting, remittance, and monitoring duties.`,
    );
  }

  if (includesAny(questionLower, ['north carolina', ' nc ', 'implement']) && frame.supportingSections.length > 0) {
    checklist.push(`Put NC implementation in a separate paragraph after the federal rule using ${listSections(frame.supportingSections)}.`);
  }

  return checklist.slice(0, CHECKLIST_LIMIT);
}

function buildAmendmentChecklist(questionLower: string, frame: ResolveAnswerFrameResult['frame']): string[] {
  const checklist: string[] = [];
  const latestRevisionContent = frame.latestRevision?.section?.content?.trim() ?? '';
  const historyRequested = includesAny(questionLower, ['history', 'older', 'previous', 'chronolog']);

  if (frame.latestRevision?.marker) {
    checklist.push(`Lead with the latest revision marker: ${frame.latestRevision.marker}.`);
  }
  if (frame.latestRevision?.section && latestRevisionContent.length === 0) {
    checklist.push(
      'If the latest revision header is title-only, say you verified the latest marker but could not confirm the specific substantive changes from parsed text, and do not name or summarize older notices to fill that gap unless the user asked for chronology.',
    );
  }
  if (historyRequested) {
    checklist.push('If you include older notices for chronology, keep them clearly secondary to the latest revision and mark unverified change details as unconfirmed.');
  } else {
    checklist.push(
      'Do not backfill the latest-change answer with older notice details, numbers, or summaries unless the user explicitly asks for history or chronology.',
    );
  }

  return checklist.slice(0, CHECKLIST_LIMIT);
}

function buildVariantChecklist(frame: ResolveAnswerFrameResult['frame']): string[] {
  const checklist: string[] = [];

  if (frame.authoritativeDocuments.length > 0) {
    checklist.push(`Lead with the preferred policy variant: ${listDocuments(frame.authoritativeDocuments, 1)}.`);
  }
  if (frame.variantReasoning) {
    checklist.push(`Explain briefly why that variant controls: ${frame.variantReasoning}`);
  }
  if (frame.supportingSections.length > 0) {
    checklist.push(`Use sibling policy material only as comparison from ${listSections(frame.supportingSections)}.`);
  }

  return checklist.slice(0, CHECKLIST_LIMIT);
}

function buildGeneralChecklist(frame: ResolveAnswerFrameResult['frame']): string[] {
  if (frame.primarySections.length === 0) return [];
  return [`Answer directly from ${listSections(frame.primarySections)} before adding broader context.`];
}

function buildRouteChecklist(questionLower: string, frame: ResolveAnswerFrameResult['frame']): string[] {
  const checklist: string[] = [];

  switch (frame.route.lane) {
    case 'baseline_hybrid':
      checklist.push('Answer directly from the current frame before widening further.');
      if (frame.route.determinism_hints.cite_scope_and_not_covered) {
        checklist.push('For this yes/no coverage question, answer yes or no first and pair the governing scope section with the not-covered section.');
      }
      if (frame.avoidSections.length > 0) {
        checklist.push('Keep attachments, request-process instructions, and other procedural sections secondary unless the user asked for them.');
      }
      break;
    case 'graph_reasoning':
      checklist.push('Separate the governing rule, supporting context, and implementation or history into distinct answer segments.');
      if (frame.questionType === 'federal_authority' || includesAny(questionLower, ['north carolina', ' nc ', 'implement'])) {
        checklist.push('Keep federal authority separate from NC implementation. Do not blend them into a single rule statement.');
      }
      break;
    case 'deterministic_evidence':
      checklist.push('State only numbers, thresholds, dates, and change markers that appear directly in surfaced evidence.');
      if (frame.route.determinism_hints.numeric_evidence_only) {
        checklist.push('Do not reconstruct charts, infer updated math, or fill in missing numeric tables from context.');
        checklist.push('If the surfaced current sections point to a chart or table without reproducing the figures, say the current dollar amounts were not verified in the surfaced evidence.');
      }
      if (frame.route.widening_policy === 'none') {
        checklist.push('Do not widen beyond the current structured frame for extra numeric details. Finalize from the verified evidence you already have.');
      }
      if (frame.route.determinism_hints.latest_revision_only) {
        checklist.push('Do not backfill with older notice details unless the user explicitly asked for chronology or history.');
      }
      break;
  }

  return checklist;
}

function buildChecklist(question: string, frame: ResolveAnswerFrameResult['frame']): string[] {
  const questionLower = normalize(question);
  const routeChecklist = buildRouteChecklist(questionLower, frame);
  const familyChecklist = (() => {
    switch (frame.questionType) {
    case 'coverage':
        return buildCoverageChecklist(questionLower, frame);
    case 'prior_authorization':
        return buildPriorAuthChecklist(questionLower, frame);
    case 'federal_authority':
        return buildFederalChecklist(questionLower, frame);
    case 'amendment':
        return buildAmendmentChecklist(questionLower, frame);
    case 'policy_variant':
        return buildVariantChecklist(frame);
    default:
        return buildGeneralChecklist(frame);
    }
  })();

  return unique([...routeChecklist, ...familyChecklist]).slice(0, CHECKLIST_LIMIT);
}

function buildPlanMessage(question: string, frame: ResolveAnswerFrameResult['frame']): string | null {
  const lines = [
    PLAN_MARKER,
    'Use the structured frame as the answer outline for this turn.',
    'Start with the answer itself, not a search log.',
    'Do not say what tools you called, what you searched for, or what you plan to do next unless the missing evidence materially limits the conclusion.',
    `Route: ${frame.route.lane} (${frame.route.rationale}); widening policy: ${frame.route.widening_policy}.`,
  ];

  if (frame.authoritativeDocuments.length > 0) {
    lines.push(`Preferred sources: ${listDocuments(frame.authoritativeDocuments)}.`);
  }
  if (frame.primarySections.length > 0) {
    lines.push(`Cover first: ${listSections(frame.primarySections)}.`);
  }
  if (frame.supportingSections.length > 0) {
    lines.push(`Use supporting sections only to fill missing parts: ${listSections(frame.supportingSections)}.`);
  }
  if (frame.avoidSections.length > 0) {
    lines.push(`Do not lead with: ${listSections(frame.avoidSections)}.`);
  }

  const checklist = buildChecklist(question, frame);
  if (checklist.length > 0) {
    lines.push('Checklist:');
    for (const item of checklist) {
      lines.push(`- ${item}`);
    }
  }

  return lines.join('\n');
}

export class AnswerFramePlanningProcessor implements Processor {
  readonly id = 'answer-frame-planning';

  processInputStep({ stepNumber, messages, systemMessages }: ProcessInputStepArgs): ProcessInputStepResult | void {
    if (stepNumber === 0) return;

    const alreadyPlanned = systemMessages.some((message) => contentText(message.content).includes(PLAN_MARKER));
    if (alreadyPlanned) return;

    const question = latestUserText(messages);
    if (!question) return;

    const frameResult = latestToolResult<ResolveAnswerFrameResult>(messages, 'resolveAnswerFrame');
    const frame = frameResult?.frame;
    if (!frame) return;

    const content = buildPlanMessage(question, frame);
    if (!content) return;

    return {
      systemMessages: [
        ...systemMessages,
        {
          role: 'system',
          content,
        },
      ],
    };
  }
}
