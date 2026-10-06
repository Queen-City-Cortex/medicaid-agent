import type { PrivateVerificationCapture } from './processors/verifier/diagnostics.js';
import { WITHHELD_ANSWER } from '@nc-medicaid/contracts';
import { emitVerifierTelemetry, runVerificationForAnswer } from './processors/verifier/run.js';
import { type SourceEntry } from './processors/verifier/evidence.js';
import { getConfig } from './processors/verifier/config.js';
import { AGENT_MODEL, sentReasoningEffort } from './model.js';

/** Keep the CLI's exception path behind the same release boundary as success. */
export async function verifyCliAnswer({ question, answerText, getSources, capture }: {
  question: string;
  answerText: string;
  getSources: () => SourceEntry[];
  capture?: PrivateVerificationCapture;
}): Promise<string> {
  const started = Date.now();
  try {
    const sources = getSources();
    console.log('\n---EVIDENCE---\n');
    // The evaluation harness copies agent_config into its result file. It is
    // the configuration this process resolved, which the harness cannot know.
    // The effort is the one sent, null when the model is sent none.
    console.log(JSON.stringify({
      sources,
      evidence_bytes: sources.reduce((n, s) => n + s.text.length, 0),
      agent_config: { agent_model: AGENT_MODEL, agent_reasoning_effort: sentReasoningEffort(AGENT_MODEL), verifier_model: getConfig().model },
    }));
    const result = await runVerificationForAnswer({ question, answerText, sources, capture });
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
