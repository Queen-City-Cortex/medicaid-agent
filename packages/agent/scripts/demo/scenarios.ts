/**
 * The keyless demo: five answers run through the real release path with no
 * API key, no Neo4j and no network.
 *
 * What is real: `runVerificationForAnswer` (the coverage scope, the link,
 * quotation and evidence-budget checks, the two-pass correction rule and the
 * release decision) is the production code, unchanged.
 *
 * What is scripted: the agent's draft answers and the verifier model's
 * verdicts. They are written by hand to show each path, not recorded from a
 * live model. The sample corpus is three short excerpts of public documents;
 * check the linked source before relying on any of it.
 */
import { WITHHELD_ANSWER } from '@nc-medicaid/contracts';
import type { SourceEntry } from '../../src/processors/verifier/evidence.js';
import { runVerificationForAnswer, type VerificationRunResult } from '../../src/processors/verifier/run.js';
import { VERIFICATION_UNAVAILABLE, type VerificationResult } from '../../src/processors/verifier/verify.js';

const DSS_8110_URL = 'https://policies.ncdhhs.gov/wp-content/uploads/DSS-8110-Change-Term-Timely.pdf';
const CFR_431_221_URL = 'https://www.ecfr.gov/current/title-42/section-431.221';

/** The sample corpus: excerpts of public documents, in the shape the agent's tools return. */
export const SAMPLE_CORPUS: SourceEntry[] = [
  {
    toolName: 'getSection',
    key: 'sec:demo:DSS-8110:hearing-rights',
    link: DSS_8110_URL,
    policyNumber: 'DSS-8110',
    sectionNumber: null,
    text: [
      'Document: DSS-8110 Notice of Change or Termination (Timely)',
      'Section: Think we are wrong? You have the right to a hearing.',
      'You have sixty (60) calendar days, that is until [date], to ask for a hearing. You have ninety (90) days or until [date] if you have good cause for not requesting the hearing within 60 days. If you do not ask for a hearing by then, you cannot have a hearing. You also may reapply for benefits at any time. To protect your rights, you may both reapply and ask for a hearing.',
      'If you ask for a hearing on or before [date], you can continue to receive benefits at the present level until the first hearing decision is made, unless you waive this right.',
    ].join('\n'),
  },
  {
    toolName: 'getSection',
    key: 'sec:demo:42CFR431.221:d',
    link: CFR_431_221_URL,
    policyNumber: '42 CFR 431.221',
    sectionNumber: '431.221(d)',
    text: [
      'Document: 42 CFR 431.221 Request for hearing',
      'Section: 431.221(d)',
      'The agency must allow the applicant or beneficiary a reasonable time, not to exceed 90 days from the date that notice of action is mailed, to request a fair hearing.',
    ].join('\n'),
  },
];

const CLEAN: VerificationResult = {
  supported: true, relevant: true, citationsComplete: true,
  unsupportedClaims: [], missingCitationClaims: [], relevanceIssues: [], correctedAnswer: '',
};

/** A verifier reply, or the fixed result the production code returns when the call fails. */
type ScriptedVerdict = VerificationResult;
const UNAVAILABLE: ScriptedVerdict = {
  ...CLEAN, supported: false, citationsComplete: false,
  unsupportedClaims: [{ claim: 'Full answer', reason: VERIFICATION_UNAVAILABLE }],
};

export interface DemoScenario {
  id: string;
  title: string;
  /** What the scenario shows, in one sentence. */
  shows: string;
  question: string;
  /** The agent's draft. In production it never leaves the server. */
  draft: string;
  sources: SourceEntry[];
  /** The verifier model's reply to each call, in order. Empty: the model must not be called. */
  verdicts: ScriptedVerdict[];
  expected: { status: 'passed' | 'corrected' | 'withheld'; modelCalls: number };
}

const TIMELY_QUESTION = 'My county sent a timely notice that my Medicaid is ending. How long do I have to ask for a hearing?';
const CORRECT_ANSWER = `You have 60 calendar days from the notice to ask for a hearing, or 90 days if you have good cause for missing the 60-day deadline [DSS-8110 notice](${DSS_8110_URL}). If you ask by the date on the notice, your benefits can continue at the present level until the first hearing decision [DSS-8110 notice](${DSS_8110_URL}).`;

export const SCENARIOS: DemoScenario[] = [
  {
    id: 'released',
    title: 'A grounded answer is released',
    shows: 'Every link and quotation matches retrieved text, the verifier finds every claim supported, and the exact text is released.',
    question: TIMELY_QUESTION,
    draft: CORRECT_ANSWER,
    sources: SAMPLE_CORPUS,
    verdicts: [CLEAN],
    expected: { status: 'passed', modelCalls: 1 },
  },
  {
    id: 'corrected',
    title: 'A made-up quotation is caught and the correction is rechecked',
    shows: 'The quotation check finds words that are in no retrieved source; the verifier proposes a correction, and that exact correction must pass a second check before release.',
    question: TIMELY_QUESTION,
    draft: `${CORRECT_ANSWER} The notice says "benefits always continue until every appeal is finished" [DSS-8110 notice](${DSS_8110_URL}).`,
    sources: SAMPLE_CORPUS,
    verdicts: [
      {
        ...CLEAN, supported: false,
        unsupportedClaims: [{ claim: 'benefits always continue until every appeal is finished', reason: 'The notice says benefits continue until the first hearing decision, and only if the hearing is requested by the date on the notice.' }],
        correctedAnswer: CORRECT_ANSWER,
      },
      CLEAN,
    ],
    expected: { status: 'corrected', modelCalls: 2 },
  },
  {
    id: 'wrong-jurisdiction',
    title: 'A federal ceiling stated as the state rule is withheld',
    shows: 'The draft gives the federal 90-day ceiling as North Carolina\'s deadline; the verifier\'s correction still carries a warning marker, so nothing is released.',
    question: TIMELY_QUESTION,
    draft: `In North Carolina you have 90 days from the notice to ask for a hearing [42 CFR 431.221(d)](${CFR_431_221_URL}).`,
    sources: SAMPLE_CORPUS,
    verdicts: [
      {
        ...CLEAN, supported: false, relevant: false,
        unsupportedClaims: [{ claim: 'In North Carolina you have 90 days', reason: 'The federal rule caps the time at 90 days; the NC notice gives 60 calendar days, or 90 with good cause.' }],
        relevanceIssues: [{ issue: 'Cites the federal ceiling as the state deadline.', severity: 'major' }],
        correctedAnswer: `[unverified: state deadline] You have up to 90 days to ask for a hearing [42 CFR 431.221(d)](${CFR_431_221_URL}).`,
      },
    ],
    expected: { status: 'withheld', modelCalls: 1 },
  },
  {
    id: 'no-evidence',
    title: 'A cited answer with nothing retrieved is withheld without a model call',
    shows: 'The turn retrieved no evidence but the draft cites a link, so code withholds it before any verifier call is spent.',
    question: 'Does NC Medicaid cover speech therapy by telehealth?',
    draft: 'Yes, speech therapy by telehealth is covered for all beneficiaries [Clinical Coverage Policy 8C](https://medicaid.ncdhhs.gov/8c-outpatient/download?attachment).',
    sources: [],
    verdicts: [],
    expected: { status: 'withheld', modelCalls: 0 },
  },
  {
    id: 'verifier-unavailable',
    title: 'A verifier outage withholds the answer',
    shows: 'When the verifier call fails or hits its 30-second deadline there is no retry and no fallback: the answer is withheld.',
    question: TIMELY_QUESTION,
    draft: CORRECT_ANSWER,
    sources: SAMPLE_CORPUS,
    verdicts: [UNAVAILABLE],
    expected: { status: 'withheld', modelCalls: 1 },
  },
];

export interface DemoResult {
  scenario: DemoScenario;
  run: VerificationRunResult;
  modelCalls: number;
  /** What the person asking would see. */
  shown: string;
}

/** Run one scenario through the production verification flow with its scripted verdicts. */
export async function runScenario(scenario: DemoScenario): Promise<DemoResult> {
  let modelCalls = 0;
  const verify = async (): Promise<VerificationResult> => {
    const verdict = scenario.verdicts[modelCalls];
    modelCalls += 1;
    if (!verdict) throw new Error(`Scenario ${scenario.id} called the verifier ${modelCalls} times; only ${scenario.verdicts.length} replies are scripted`);
    return verdict;
  };
  const run = await runVerificationForAnswer({
    question: scenario.question,
    answerText: scenario.draft,
    sources: scenario.sources,
    verify,
  });
  const shown = run.outcome.status === 'withheld' ? WITHHELD_ANSWER : run.finalAnswer;
  return { scenario, run, modelCalls, shown };
}
