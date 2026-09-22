import { WITHHELD_ANSWER } from '@nc-medicaid/contracts';
import { emitVerifierTelemetry, runVerificationForAnswer } from './processors/verifier/run.js';
import { type SourceEntry } from './processors/verifier/evidence.js';

/** Keep the CLI's exception path behind the same release boundary as success. */
export async function verifyCliAnswer({ question, answerText, getSources }: {
  question: string;
  answerText: string;
  getSources: () => SourceEntry[];
}): Promise<string> {
  const started = Date.now();
  try {
    const sources = getSources();
    console.log('\n---EVIDENCE---\n');
    console.log(JSON.stringify({ sources, evidence_bytes: sources.reduce((n, s) => n + s.text.length, 0) }));
    const result = await runVerificationForAnswer({ question, answerText, sources });
    emitVerifierTelemetry(result.telemetry);
    return result.finalAnswer;
  } catch {
    // Unexpected extraction/verification failures must never restore the draft.
    emitVerifierTelemetry({
      error: 'Answer verification failed', rewrote: false, supported: false, verifier_unavailable: true,
      outcome: { status: 'withheld', reason: 'unavailable', passCount: 0 },
      pass_count: 0, withholding_reason: 'unavailable', latency_ms: Date.now() - started,
    });
    return WITHHELD_ANSWER;
  }
}
