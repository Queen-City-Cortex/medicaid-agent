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

const TELEHEALTH_SERVICE_LIST_QUESTION_PHRASES = [
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
];

function asksForTelehealthServiceList(questionLower: string): boolean {
  return questionLower.includes('telehealth') && includesAny(questionLower, TELEHEALTH_SERVICE_LIST_QUESTION_PHRASES);
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

// ---------------------------------------------------------------------------
// Declarative checklist rule tables
// ---------------------------------------------------------------------------
//
// Each question family evaluates an ordered rule table against a context
// object computed once per question (question text plus phrase-bucket section
// matches). Rule ORDER within a family is behavior: the final checklist is
// truncated at CHECKLIST_LIMIT, so reordering rows changes which directives
// survive. Add new rules in the position they should be considered, not at
// the end by default.

interface ChecklistRule<C> {
  /** Question/evidence predicate deciding whether the rule fires. */
  when: (ctx: C) => boolean;
  /** Directive line(s) pushed onto the checklist when the rule fires. */
  render: (ctx: C) => string | string[];
  /** Stop evaluating later rules in the family once this rule fires (mirrors an early return). */
  terminal?: boolean;
}

function evaluateRules<C>(rules: ReadonlyArray<ChecklistRule<C>>, ctx: C): string[] {
  const checklist: string[] = [];
  for (const rule of rules) {
    if (!rule.when(ctx)) continue;
    const rendered = rule.render(ctx);
    checklist.push(...(Array.isArray(rendered) ? rendered : [rendered]));
    if (rule.terminal) break;
  }
  return checklist;
}

// --- Coverage family --------------------------------------------------------

const TELEHEALTH_SECTION_PHRASES = ['telehealth'];
const GENERAL_COVERAGE_PHRASES = [
  'epsdt',
  'eligibility',
  'general criteria',
  'criteria covered',
  'specific criteria covered',
  'scope',
  'description',
  'general provisions',
];
const SERVICE_SPECIFIC_PHRASES = [
  'speech-language therapy',
  'speech -language therapy',
  'speech/language evaluation',
  'speech/language treatment',
  'audiology',
  'therapy',
  'equipment, modification and technology',
  'home modification',
];
const DOCUMENTATION_PHRASES = [
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
];
const LIMITATION_PHRASES = ['not covered', 'limitation', 'limitations', 'exclusion'];
const GENERAL_LIMITATION_PHRASES = ['general criteria not covered', 'general not covered'];
const SPECIFIC_LIMITATION_PHRASES = [
  'specific criteria not covered',
  'specific exclusion',
  'comfort or convenience',
  'other non-covered',
  'other noncovered',
  'room and board',
];
const PREMIUM_PHRASES = ['premium', 'premiums', 'enrollment fee', 'cost sharing'];
const TELEHEALTH_TABLE_PHRASES = ['telehealth eligible service', 'speech/language evaluation', 'speech/language treatment'];
const AIR_AMBULANCE_PHRASES = ['air medical ambulance', 'air ambulance'];
const PERSONAL_CARE_PHRASES = ['personal care services'];
const ROOM_AND_BOARD_PHRASES = ['room and board'];
const CONGREGATE_WORKFLOW_PHRASES = ['assessment', 'admission', 'expedited'];
const BASELINE_ELIGIBILITY_PHRASES = ['general provisions', '2.1.1'];
const GENERAL_COVERED_PHRASES = ['3.1', 'general criteria covered'];
const SPECIFIC_ELIGIBILITY_PHRASES = ['3.2.1', 'specific criteria covered'];
const ELIGIBILITY_SCOPE_PHRASES = ['18 years of age', 'adult with disabilities', 'risk of institutionalization'];
const EPSDT_EXCEPTION_PHRASES = ['epsdt special provision', 'exception to policy limitations'];
const TELEHEALTH_CONDITION_PHRASES = [
  'exposure to others should be avoided',
  'remote or underserved',
  'adjunct to in-person care',
  'best interest of the beneficiary',
  'convenience for the therapist',
  'increase therapist productivity',
];
const UNDER_21_QUESTION_PHRASES = ['under age 21', 'under 21', 'epsdt'];
const ADULT_EXCLUSION_NEGATIVE_PHRASES = ['under age 21', 'under 21', 'epsdt', 'child', 'children', 'pediatric'];
const CONGREGATE_QUESTION_PHRASES = ['assisted living', 'congregate'];
const NOT_COVERED_QUESTION_PHRASES = ['not covered', 'not cover'];

function coverageContext(questionLower: string, frame: AnswerFrame) {
  const allSections = unique([...frame.primarySections, ...frame.supportingSections]);
  const telehealthSections = matchingSections(allSections, TELEHEALTH_SECTION_PHRASES);
  const limitationSections = matchingSections(allSections, LIMITATION_PHRASES);
  return {
    questionLower,
    frame,
    allSections,
    telehealthSections,
    telehealthText: telehealthSections.map(sectionText).join('\n'),
    telehealthServiceListQuestion: asksForTelehealthServiceList(questionLower),
    ambulanceNotCoveredQuestion: questionLower.includes('ambulance') && includesAny(questionLower, NOT_COVERED_QUESTION_PHRASES),
    yesNoCoverageQuestion: isYesNoCoverageQuestion(questionLower),
    generalEligibilityQuestion: includesAny(questionLower, ['eligibility criteria', 'general eligibility']),
    // Local coverage matcher: the shared yes/no regex misses "covered"
    // phrasing (separate follow-up).
    adultExclusionQuestion:
      /\bcover(s|ed|age)?\b/.test(questionLower) && !includesAny(questionLower, ADULT_EXCLUSION_NEGATIVE_PHRASES),
    generalSections: matchingSections(allSections, GENERAL_COVERAGE_PHRASES),
    serviceSpecificSections: matchingSections(allSections, SERVICE_SPECIFIC_PHRASES),
    documentationSections: matchingSections(allSections, DOCUMENTATION_PHRASES),
    limitationSections,
    generalLimitationSections: limitationSections.filter((section) =>
      includesAny(sectionText(section), GENERAL_LIMITATION_PHRASES),
    ),
    specificLimitationSections: limitationSections.filter(
      (section) => includesAny(sectionText(section), SPECIFIC_LIMITATION_PHRASES) || sectionNumberDepth(section.sectionNumber) >= 3,
    ),
    premiumSections: matchingSections(allSections, PREMIUM_PHRASES),
    telehealthTableSections: matchingSections(allSections, TELEHEALTH_TABLE_PHRASES),
    airAmbulanceSections: matchingSections(allSections, AIR_AMBULANCE_PHRASES),
    personalCareSections: matchingSections(allSections, PERSONAL_CARE_PHRASES),
    roomAndBoardSections: matchingSections(allSections, ROOM_AND_BOARD_PHRASES),
    congregateWorkflowSections: matchingSections(unique([...allSections, ...frame.avoidSections]), CONGREGATE_WORKFLOW_PHRASES),
    baselineEligibilitySections: matchingSections(allSections, BASELINE_ELIGIBILITY_PHRASES),
    generalCoveredSections: matchingSections(allSections, GENERAL_COVERED_PHRASES),
    specificEligibilitySections: matchingSections(allSections, SPECIFIC_ELIGIBILITY_PHRASES),
    eligibilityScopeSections: matchingSections(allSections, ELIGIBILITY_SCOPE_PHRASES),
    epsdtExceptionSections: matchingSections(allSections, EPSDT_EXCEPTION_PHRASES),
  };
}

type CoverageContext = ReturnType<typeof coverageContext>;

// Shared branch predicates for rules that belong to the same question theme.
const inTelehealthBranch = (ctx: CoverageContext): boolean =>
  ctx.questionLower.includes('telehealth') && ctx.telehealthSections.length > 0;
const inNotCoveredBranch = (ctx: CoverageContext): boolean =>
  includesAny(ctx.questionLower, NOT_COVERED_QUESTION_PHRASES) && ctx.limitationSections.length > 0;
const inCongregateBranch = (ctx: CoverageContext): boolean =>
  includesAny(ctx.questionLower, CONGREGATE_QUESTION_PHRASES) &&
  ctx.generalSections.length > 0 &&
  ctx.personalCareSections.length > 0;
const inPremiumBranch = (ctx: CoverageContext): boolean =>
  includesAny(ctx.questionLower, PREMIUM_PHRASES) && ctx.premiumSections.length > 0;

const COVERAGE_RULES: ReadonlyArray<ChecklistRule<CoverageContext>> = [
  {
    when: (ctx) => ctx.generalSections.length > 0,
    render: (ctx) => `Start with the governing coverage rule from ${listSections(ctx.generalSections)} before lower-level details.`,
  },
  {
    when: (ctx) =>
      ctx.generalEligibilityQuestion &&
      ctx.generalSections.length > 0 &&
      ctx.baselineEligibilitySections.length > 0 &&
      ctx.generalCoveredSections.length > 0 &&
      ctx.specificEligibilitySections.length > 0,
    render: (ctx) =>
      `For this general eligibility question, build the answer in layers: baseline Medicaid/program eligibility from ${listSections(ctx.baselineEligibilitySections, 1)}, then general covered criteria from ${listSections(ctx.generalCoveredSections, 1)}, then the CAP/DA- or service-specific criteria from ${listSections(ctx.specificEligibilitySections, 1)}.`,
  },
  {
    when: (ctx) => ctx.generalEligibilityQuestion && ctx.generalSections.length > 0 && ctx.eligibilityScopeSections.length > 0,
    render: (ctx) =>
      `If the surfaced scope text ${listSections(ctx.eligibilityScopeSections, 1)} states an age or program-boundary requirement, include that briefly as scope context instead of skipping straight to provider or reimbursement operations.`,
  },
  {
    when: (ctx) =>
      ctx.yesNoCoverageQuestion &&
      ctx.generalSections.length > 0 &&
      ctx.limitationSections.length > 0 &&
      !includesAny(ctx.questionLower, CONGREGATE_QUESTION_PHRASES),
    render: (ctx) => [
      `For this yes/no coverage question, answer yes or no first, then cite both the scope section ${listSections(ctx.generalSections, 1)} and the not-covered section ${listSections(ctx.limitationSections, 1)}.`,
      'If the surfaced scope or description section shows that this policy governs a different service category than the one asked about, say that plainly, keep the citations on the scope/not-covered sections, and avoid padding the answer with broader criteria that do not change the yes/no result.',
    ],
  },
  // Evidence-gated EPSDT-exception directive for ADULT exclusion questions:
  // fires only when the frame actually surfaced the policy's EPSDT
  // special-provision section, instructs read-and-cite, and asserts nothing
  // about what the exception allows (de-contamination guarantee). Questions
  // that themselves ask about under-21/EPSDT use the pairing directive below
  // instead.
  {
    when: (ctx) => ctx.epsdtExceptionSections.length > 0 && ctx.adultExclusionQuestion,
    render: (ctx) =>
      `The frame surfaced an EPSDT special-provision section (${listSections(ctx.epsdtExceptionSections, 1)}). Before finalizing a no-coverage conclusion for adults, read that section and state what it says about beneficiaries under 21, citing it. Do not assert what the exception allows beyond that section's text.`,
  },
  {
    when: inTelehealthBranch,
    render: (ctx) => [
      `Lead with the telehealth-specific state rule from ${listSections(ctx.telehealthSections, 1)}.`,
      'Use the state telehealth conditions first. Do not widen to cross-referenced telehealth background or federal rules unless the user explicitly asks for them or the state section leaves a material gap.',
    ],
  },
  {
    when: (ctx) => inTelehealthBranch(ctx) && includesAny(ctx.telehealthText, TELEHEALTH_CONDITION_PHRASES),
    render: () =>
      'State the beneficiary-specific telehealth conditions explicitly: why telehealth is medically necessary, when it must remain adjunct to in-person care, and that it cannot be used for therapist convenience or productivity.',
  },
  {
    when: (ctx) => inTelehealthBranch(ctx) && ctx.serviceSpecificSections.length > 0,
    render: (ctx) =>
      ctx.telehealthServiceListQuestion
        ? `Use ${listSections(ctx.serviceSpecificSections)} to explain which speech-language services or code families are surfaced as telehealth-eligible, while keeping the governing conditions first.`
        : `Use ${listSections(ctx.serviceSpecificSections)} only to explain that the ordinary speech-language therapy criteria still apply, and cite that section separately from the telehealth rule when you mention documentation or service-specific limits.`,
  },
  {
    when: (ctx) => inTelehealthBranch(ctx) && !ctx.telehealthServiceListQuestion && ctx.documentationSections.length > 0,
    render: (ctx) =>
      `Tie the documentation point from ${listSections(ctx.documentationSections, 1)} to the beneficiary-specific telehealth conditions: say the chart should document why telehealth is medically necessary or appropriate for this beneficiary when the surfaced sections support that.`,
  },
  {
    when: (ctx) => inTelehealthBranch(ctx) && !ctx.telehealthServiceListQuestion && ctx.telehealthTableSections.length > 0,
    render: () =>
      'Do not enumerate telehealth-eligible CPT or billing-code tables for this conditions question. Say only that selected speech-language services may be eligible if that context is needed.',
  },
  // Flattened else-if of the previous rule: fires only for service-list
  // questions whose surfaced telehealth tables carry no literal procedure codes.
  {
    when: (ctx) =>
      inTelehealthBranch(ctx) &&
      ctx.telehealthServiceListQuestion &&
      ctx.telehealthTableSections.length > 0 &&
      !ctx.telehealthTableSections.some(hasProcedureCode),
    render: () =>
      'Do not enumerate CPT or billing-code lists unless those exact codes appear in the surfaced sections. If the surfaced telehealth sections only say selected services are eligible, say that without inventing the code list.',
  },
  {
    when: (ctx) =>
      includesAny(ctx.questionLower, UNDER_21_QUESTION_PHRASES) &&
      ctx.generalSections.length > 0 &&
      ctx.serviceSpecificSections.length > 0,
    render: (ctx) => `Pair the general EPSDT / pediatric rule with the discipline-specific sections ${listSections(ctx.serviceSpecificSections)}.`,
  },
  {
    when: (ctx) =>
      includesAny(ctx.questionLower, ['requirements', 'requirement', 'documentation', 'must']) && ctx.documentationSections.length > 0,
    render: (ctx) =>
      `Separate baseline coverage criteria from documentation requirements. Use ${listSections(
        ctx.generalSections.length > 0 ? ctx.generalSections : ctx.frame.primarySections,
      )} for coverage, then ${listSections(ctx.documentationSections)} for documentation.`,
  },
  {
    when: inNotCoveredBranch,
    render: (ctx) => `Answer the not-covered or limitation part explicitly from ${listSections(ctx.limitationSections)}.`,
  },
  {
    when: (ctx) =>
      inNotCoveredBranch(ctx) &&
      ctx.generalLimitationSections.length > 0 &&
      ctx.specificLimitationSections.length > 0 &&
      ctx.generalSections.length > 0,
    render: (ctx) =>
      `Separate the general exclusions in ${listSections(ctx.generalLimitationSections, 1)} from the item-specific exclusions in ${listSections(ctx.specificLimitationSections, 1)}, then return to the governing coverage criteria in ${listSections(ctx.generalSections, 2)}.`,
  },
  {
    when: (ctx) => ctx.ambulanceNotCoveredQuestion && ctx.specificLimitationSections.length > 0,
    render: (ctx) =>
      `For this ambulance non-covered question, lead with ${listSections(ctx.specificLimitationSections, 1)} and keep general exclusions secondary unless they add a missing limit.`,
  },
  {
    when: (ctx) => ctx.ambulanceNotCoveredQuestion && ctx.specificLimitationSections.length > 0 && ctx.airAmbulanceSections.length > 0,
    render: (ctx) =>
      `Use ${listSections(ctx.airAmbulanceSections, 1)} only to explain the narrow situations where air ambulance remains covered, so the exclusions are clearly bounded.`,
  },
  {
    when: inCongregateBranch,
    render: (ctx) =>
      `For congregate-setting PCS questions, use ${listSections(ctx.generalSections, 1)} for the beneficiary and facility criteria, ${listSections(ctx.personalCareSections, 1)} for the covered PCS service scope, and ${listSections(ctx.roomAndBoardSections, 1)} for room-and-board exclusions when surfaced.`,
  },
  {
    when: (ctx) => inCongregateBranch(ctx) && ctx.congregateWorkflowSections.length > 0,
    render: (ctx) =>
      `Do not cite workflow sections like ${listSections(ctx.congregateWorkflowSections, 1)} unless the user specifically asked about assessments, admissions, or expedited processing.`,
  },
  {
    when: inCongregateBranch,
    render: () =>
      'Keep assessment or admission-procedure sections secondary unless the user specifically asks about authorization, attestation, or admissions workflow.',
  },
  {
    when: inPremiumBranch,
    render: (ctx) => [
      `Use ${listSections(ctx.premiumSections)} for premium or fee terms, and state only the numeric thresholds or dollar amounts that appear directly in those sections.`,
      'Do not reconstruct full premium charts, FPL dollar conversions, or later update notices unless those exact figures are present in the surfaced evidence.',
    ],
  },
  {
    when: (ctx) => inPremiumBranch(ctx) && ctx.frame.route.lane === 'deterministic_evidence',
    render: () =>
      'If the current authoritative text points to a premium chart without reproducing the current figures, say the premium structure is verified but the current monthly dollar amounts were not confirmed in surfaced evidence.',
  },
  {
    when: (ctx) => ctx.frame.avoidSections.some(isAttachmentSection) || ctx.allSections.some(isAttachmentSection),
    render: () => 'Do not lead with attachments, forms, or request-process sections unless the user explicitly asked for them.',
  },
];

function buildCoverageChecklist(questionLower: string, frame: ResolveAnswerFrameResult['frame']): string[] {
  return evaluateRules(COVERAGE_RULES, coverageContext(questionLower, frame)).slice(0, CHECKLIST_LIMIT);
}

// --- Prior-authorization family ----------------------------------------------

const QUANTITY_SECTION_PHRASES = [
  'quantity and episodic drugs',
  'quantity limitation',
  'quantity limitations',
  'episodic drug',
  'episodic drugs',
];
const PRIOR_APPROVAL_CRITERIA_PHRASES = [
  'pharmacy prior approval drugs and criteria',
  'prior approval drugs and criteria',
  'attachment k',
  'pharmacy prior approval criteria',
];
const REQUEST_PROCESS_PHRASES = [
  'requesting prior authorization',
  'prior authorization process',
  'retroactive prior authorization',
  'web portal',
  'fax',
  'phone',
];
const DRUG_EXCEPTION_PHRASES = [
  'exceptions to fda and nc medicaid drug criteria approval',
  'peer-reviewed medical literature',
  'requested drug',
];

function priorAuthContext(questionLower: string, frame: AnswerFrame) {
  const allSections = unique([...frame.primarySections, ...frame.supportingSections]);
  const criteriaSections = matchingSections(allSections, PRIOR_APPROVAL_CRITERIA_PHRASES);
  return {
    questionLower,
    frame,
    pharmacyQuantityQuestion: isPharmacyQuantityPriorAuthQuestion(questionLower),
    quantitySections: matchingSections(allSections, QUANTITY_SECTION_PHRASES),
    criteriaSections,
    attachmentCriteriaSections: criteriaSections.filter(isAttachmentSection),
    contentfulCriteriaSections: criteriaSections.filter(
      (section) => !isAttachmentSection(section) || (section.content ?? '').trim().length > 0,
    ),
    requestProcessSections: unique([...matchingSections([...allSections, ...frame.avoidSections], REQUEST_PROCESS_PHRASES)]),
    exceptionSections: unique([...matchingSections([...allSections, ...frame.avoidSections], DRUG_EXCEPTION_PHRASES)]),
  };
}

type PriorAuthContext = ReturnType<typeof priorAuthContext>;

const PRIOR_AUTH_RULES: ReadonlyArray<ChecklistRule<PriorAuthContext>> = [
  {
    when: (ctx) => ctx.pharmacyQuantityQuestion && (ctx.quantitySections.length > 0 || ctx.criteriaSections.length > 0),
    render: (ctx) => [
      `Lead with the surfaced quantity-limit and criteria sections ${listSections([...ctx.quantitySections, ...ctx.criteriaSections], 2)}.${ctx.frame.authoritativeDocuments[0]?.policyNumber ? ` Name the governing source by policy number first: ${ctx.frame.authoritativeDocuments[0].policyNumber}. Use the title only as supporting citation context if needed.` : ''}`,
      `For this pharmacy quantity-limit question, read ${listSections(ctx.quantitySections, 1)} and state the yes/no conclusion only as that text supports it. Then use ${listSections(ctx.contentfulCriteriaSections.length > 0 ? ctx.contentfulCriteriaSections : ctx.criteriaSections, 1)}${ctx.attachmentCriteriaSections.length > 0 ? ` together with ${listSections(ctx.attachmentCriteriaSections, 1)}` : ''} to explain which drugs or categories the pharmacy prior-approval criteria list as requiring prior authorization.`,
      'Do not present a partial sample drug list as if it were exhaustive. If you mention examples, label them as examples only; otherwise say Attachment K / the pharmacy prior-approval criteria contains the detailed list. Keep request-process or exception procedures secondary unless the user asks about them.',
    ],
    terminal: true,
  },
  {
    when: (ctx) => ctx.frame.primarySections.length > 0,
    render: (ctx) => `Lead with the criteria sections ${listSections(ctx.frame.primarySections)}.`,
  },
  {
    when: (ctx) => includesAny(ctx.questionLower, ['quantity limit', 'quantity limits', 'episodic']),
    render: () => 'Separate quantity-limit rules from prior-approval categories or drug lists.',
  },
  {
    when: (ctx) => Boolean(ctx.frame.authoritativeDocuments[0]?.policyNumber),
    render: (ctx) => `Name the governing source by policy number first: ${ctx.frame.authoritativeDocuments[0].policyNumber}.`,
  },
  {
    when: (ctx) => ctx.requestProcessSections.length > 0 || ctx.frame.avoidSections.length > 0,
    render: () => 'Keep request-process or submission instructions secondary unless the user asks how to submit.',
  },
  {
    when: (ctx) => ctx.pharmacyQuantityQuestion && ctx.exceptionSections.length > 0,
    render: () => 'Keep off-label or exception-request procedures secondary unless the user asks about exceptions to the standard drug criteria.',
  },
];

function buildPriorAuthChecklist(questionLower: string, frame: ResolveAnswerFrameResult['frame']): string[] {
  return evaluateRules(PRIOR_AUTH_RULES, priorAuthContext(questionLower, frame)).slice(0, CHECKLIST_LIMIT);
}

// --- Federal-authority family -------------------------------------------------

const ENFORCEMENT_PHRASES = ['annually submit', 'annual reporting', 'remittance', 'state oversight'];
const NC_IMPLEMENTATION_PHRASES = ['medical loss ratio', 'mlr', 'minimum mlr', 'calculate and report', 'rebate', 'remittance', 'contract'];
const MLR_METHODOLOGY_PHRASES = [
  'numerator',
  'denominator',
  'credibility adjustment',
  'credibility adjusted',
  'aggregation',
  'incurred claims',
  'quality improvement',
];
const WAIVER_APPLICATION_PHRASES = [
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
];
const PUBLIC_NOTICE_SECTION_PHRASES = ['public notice', 'comment period', 'public hearings', '431.408'];
const PUBLIC_NOTICE_QUESTION_PHRASES = ['public notice', 'comment period', 'public hearing', 'notice and comment'];
const ORDERING_PRACTITIONER_PHRASES = ['nurse practitioner', 'clinical nurse specialist', 'physician assistant'];
const MLR_QUESTION_PHRASES = ['medical loss ratio', 'mlr'];
const NC_IMPLEMENTATION_QUESTION_PHRASES = ['north carolina', ' nc ', 'implement'];

function federalCoreConditions(allText: string): string[] {
  const conditions: string[] = [];
  if (allText.includes('order of a physician') || includesAny(allText, ORDERING_PRACTITIONER_PHRASES)) {
    conditions.push('ordering practitioner requirements');
  }
  if (allText.includes('written plan of care')) {
    conditions.push('written plan of care');
  }
  if (allText.includes('60 days')) {
    conditions.push('60-day review cycle');
  }
  return conditions;
}

function federalContext(questionLower: string, frame: AnswerFrame) {
  const allSections = unique([...frame.primarySections, ...frame.supportingSections]);
  const allText = allSections.map(sectionText).join('\n');
  return {
    questionLower,
    frame,
    allText,
    coreConditions: federalCoreConditions(allText),
    waiverApplicationQuestion:
      questionLower.includes('waiver') &&
      includesAny(questionLower, ['application', 'demonstrate', 'must show', 'need to demonstrate', 'need to show']),
    publicNoticeQuestion: includesAny(questionLower, PUBLIC_NOTICE_QUESTION_PHRASES),
    enforcementSections: matchingSections(frame.supportingSections, ENFORCEMENT_PHRASES),
    ncImplementationSections: matchingSections(frame.supportingSections, NC_IMPLEMENTATION_PHRASES),
    mlrMethodologySections: matchingSections(allSections, MLR_METHODOLOGY_PHRASES),
    waiverApplicationSections: matchingSections(allSections, WAIVER_APPLICATION_PHRASES),
    publicNoticeSections: matchingSections(
      unique([...frame.primarySections, ...frame.supportingSections, ...frame.avoidSections]),
      PUBLIC_NOTICE_SECTION_PHRASES,
    ),
  };
}

type FederalContext = ReturnType<typeof federalContext>;

const FEDERAL_RULES: ReadonlyArray<ChecklistRule<FederalContext>> = [
  {
    when: (ctx) => ctx.frame.primarySections.length > 0,
    render: (ctx) => `Lead with the federal rule from ${listSections(ctx.frame.primarySections, 1)}.`,
  },
  {
    when: (ctx) => ctx.waiverApplicationQuestion && ctx.waiverApplicationSections.length > 0,
    render: (ctx) =>
      `For this waiver-application question, keep the core answer on ${listSections(ctx.waiverApplicationSections, 2)} and enumerate the concrete showings those sections actually surface, such as level of care, target group, services, safeguards, or supporting documentation.`,
  },
  {
    when: (ctx) =>
      ctx.waiverApplicationQuestion &&
      ctx.waiverApplicationSections.length > 0 &&
      ctx.publicNoticeSections.length > 0 &&
      !ctx.publicNoticeQuestion,
    render: (ctx) =>
      `Keep the public-notice procedure in ${listSections(ctx.publicNoticeSections, 1)} clearly secondary unless the user explicitly asks about notice, hearings, or comment requirements.`,
  },
  {
    when: (ctx) => ctx.coreConditions.length > 0,
    render: (ctx) => `Include the core conditions in that same section: ${ctx.coreConditions.join(', ')}.`,
  },
  {
    when: (ctx) => ctx.allText.includes('calculate and report') && ctx.allText.includes('if a state elects'),
    render: () => 'Separate the unconditional reporting/calculation duties from any conditional minimum-threshold requirement in the same rule.',
  },
  // Evidence-gated: only direct the model at a place-of-residence rule when
  // the surfaced text actually contains one — question keywords alone
  // previously injected this directive with no supporting evidence.
  {
    when: (ctx) => ctx.allText.includes('place of residence'),
    render: () =>
      'The surfaced sections mention a place-of-residence rule — state it and any excluded settings explicitly, citing the section that contains them.',
  },
  {
    when: (ctx) => includesAny(ctx.questionLower, ['enforce', 'enforced', 'implementation', 'implement']) && ctx.enforcementSections.length > 0,
    render: (ctx) => `Use the enforcement/reporting section ${listSections(ctx.enforcementSections, 1)} before broader oversight context.`,
  },
  {
    when: (ctx) => includesAny(ctx.questionLower, MLR_QUESTION_PHRASES) && ctx.mlrMethodologySections.length > 0,
    render: (ctx) =>
      `Summarize the federal MLR methodology from ${listSections(ctx.mlrMethodologySections, 2)} at a high level, including the surfaced numerator/denominator or adjustment rules before turning to NC implementation.`,
  },
  {
    when: (ctx) => includesAny(ctx.questionLower, MLR_QUESTION_PHRASES) && ctx.ncImplementationSections.length > 0,
    render: (ctx) =>
      `For NC implementation, use ${listSections(ctx.ncImplementationSections, 2)} to say whether the surfaced NC evidence sets a minimum threshold in contract or SPA text, or only reporting, remittance, and monitoring duties.`,
  },
  {
    when: (ctx) => includesAny(ctx.questionLower, NC_IMPLEMENTATION_QUESTION_PHRASES) && ctx.frame.supportingSections.length > 0,
    render: (ctx) => `Put NC implementation in a separate paragraph after the federal rule using ${listSections(ctx.frame.supportingSections)}.`,
  },
];

function buildFederalChecklist(questionLower: string, frame: ResolveAnswerFrameResult['frame']): string[] {
  return evaluateRules(FEDERAL_RULES, federalContext(questionLower, frame)).slice(0, CHECKLIST_LIMIT);
}

// --- Amendment family ----------------------------------------------------------

function amendmentContext(questionLower: string, frame: AnswerFrame) {
  return {
    frame,
    latestRevisionContent: frame.latestRevision?.section?.content?.trim() ?? '',
    historyRequested: includesAny(questionLower, ['history', 'older', 'previous', 'chronolog']),
  };
}

type AmendmentContext = ReturnType<typeof amendmentContext>;

const AMENDMENT_RULES: ReadonlyArray<ChecklistRule<AmendmentContext>> = [
  {
    when: (ctx) => Boolean(ctx.frame.latestRevision?.marker),
    render: (ctx) => `Lead with the latest revision marker: ${ctx.frame.latestRevision?.marker}.`,
  },
  {
    when: (ctx) => Boolean(ctx.frame.latestRevision?.section) && ctx.latestRevisionContent.length === 0,
    render: () =>
      'If the latest revision header is title-only, say you verified the latest marker but could not confirm the specific substantive changes from parsed text, and do not name or summarize older notices to fill that gap unless the user asked for chronology.',
  },
  {
    when: (ctx) => ctx.historyRequested,
    render: () => 'If you include older notices for chronology, keep them clearly secondary to the latest revision and mark unverified change details as unconfirmed.',
  },
  {
    when: (ctx) => !ctx.historyRequested,
    render: () =>
      'Do not backfill the latest-change answer with older notice details, numbers, or summaries unless the user explicitly asks for history or chronology.',
  },
];

function buildAmendmentChecklist(questionLower: string, frame: ResolveAnswerFrameResult['frame']): string[] {
  return evaluateRules(AMENDMENT_RULES, amendmentContext(questionLower, frame)).slice(0, CHECKLIST_LIMIT);
}

// --- Policy-variant family -------------------------------------------------------

interface FrameContext {
  frame: AnswerFrame;
}

const VARIANT_RULES: ReadonlyArray<ChecklistRule<FrameContext>> = [
  {
    when: (ctx) => ctx.frame.authoritativeDocuments.length > 0,
    render: (ctx) => `Lead with the preferred policy variant: ${listDocuments(ctx.frame.authoritativeDocuments, 1)}.`,
  },
  {
    when: (ctx) => Boolean(ctx.frame.variantReasoning),
    render: (ctx) => `Explain briefly why that variant controls: ${ctx.frame.variantReasoning}`,
  },
  {
    when: (ctx) => ctx.frame.supportingSections.length > 0,
    render: (ctx) => `Use sibling policy material only as comparison from ${listSections(ctx.frame.supportingSections)}.`,
  },
];

function buildVariantChecklist(frame: ResolveAnswerFrameResult['frame']): string[] {
  return evaluateRules(VARIANT_RULES, { frame }).slice(0, CHECKLIST_LIMIT);
}

// --- General fallback family --------------------------------------------------------

const GENERAL_RULES: ReadonlyArray<ChecklistRule<FrameContext>> = [
  {
    when: (ctx) => ctx.frame.primarySections.length > 0,
    render: (ctx) => `Answer directly from ${listSections(ctx.frame.primarySections)} before adding broader context.`,
  },
];

function buildGeneralChecklist(frame: ResolveAnswerFrameResult['frame']): string[] {
  return evaluateRules(GENERAL_RULES, { frame });
}

// --- Route lane rules (not truncated per-family; merged first in buildChecklist) ---

interface RouteContext {
  questionLower: string;
  frame: AnswerFrame;
}

const ROUTE_RULES: ReadonlyArray<ChecklistRule<RouteContext>> = [
  {
    when: (ctx) => ctx.frame.route.lane === 'baseline_hybrid',
    render: () => 'Answer directly from the current frame before widening further.',
  },
  {
    when: (ctx) => ctx.frame.route.lane === 'baseline_hybrid' && ctx.frame.route.determinism_hints.cite_scope_and_not_covered,
    render: () => 'For this yes/no coverage question, answer yes or no first and pair the governing scope section with the not-covered section.',
  },
  {
    when: (ctx) => ctx.frame.route.lane === 'baseline_hybrid' && ctx.frame.avoidSections.length > 0,
    render: () => 'Keep attachments, request-process instructions, and other procedural sections secondary unless the user asked for them.',
  },
  {
    when: (ctx) => ctx.frame.route.lane === 'graph_reasoning',
    render: () => 'Separate the governing rule, supporting context, and implementation or history into distinct answer segments.',
  },
  {
    when: (ctx) =>
      ctx.frame.route.lane === 'graph_reasoning' &&
      (ctx.frame.questionType === 'federal_authority' || includesAny(ctx.questionLower, NC_IMPLEMENTATION_QUESTION_PHRASES)),
    render: () => 'Keep federal authority separate from NC implementation. Do not blend them into a single rule statement.',
  },
  {
    when: (ctx) => ctx.frame.route.lane === 'deterministic_evidence',
    render: () => 'State only numbers, thresholds, dates, and change markers that appear directly in surfaced evidence.',
  },
  {
    when: (ctx) => ctx.frame.route.lane === 'deterministic_evidence' && ctx.frame.route.determinism_hints.numeric_evidence_only,
    render: () => [
      'Do not reconstruct charts, infer updated math, or fill in missing numeric tables from context.',
      'If the surfaced current sections point to a chart or table without reproducing the figures, say the current dollar amounts were not verified in the surfaced evidence.',
    ],
  },
  {
    when: (ctx) => ctx.frame.route.lane === 'deterministic_evidence' && ctx.frame.route.widening_policy === 'none',
    render: () => 'Do not widen beyond the current structured frame for extra numeric details. Finalize from the verified evidence you already have.',
  },
  {
    when: (ctx) => ctx.frame.route.lane === 'deterministic_evidence' && ctx.frame.route.determinism_hints.latest_revision_only,
    render: () => 'Do not backfill with older notice details unless the user explicitly asked for chronology or history.',
  },
];

function buildRouteChecklist(questionLower: string, frame: ResolveAnswerFrameResult['frame']): string[] {
  return evaluateRules(ROUTE_RULES, { questionLower, frame });
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

  return unique([...(frame.coverageScope?.notice ? [frame.coverageScope.notice] : []), ...(frame.coverageScope?.requirements ?? []), ...routeChecklist, ...familyChecklist]).slice(0, CHECKLIST_LIMIT);
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
