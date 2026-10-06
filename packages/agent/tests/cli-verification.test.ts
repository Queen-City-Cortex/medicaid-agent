import { WITHHELD_ANSWER } from '@nc-medicaid/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyCliAnswer } from '../src/cli-verification.js';
import { AGENT_MODEL, AGENT_REASONING_EFFORT } from '../src/model.js';
import { getConfig } from '../src/processors/verifier/config.js';
import { emitVerifierTelemetry, runVerificationForAnswer } from '../src/processors/verifier/run.js';

vi.mock('../src/processors/verifier/run.js', () => ({
  runVerificationForAnswer: vi.fn(), emitVerifierTelemetry: vi.fn(),
}));

afterEach(() => vi.restoreAllMocks());

describe('CLI answer release', () => {
  it.each(['evidence extraction', 'verification'])('withholds the draft when %s unexpectedly throws', async stage => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(runVerificationForAnswer).mockRejectedValue(new Error('PRIVATE_CLI_DRAFT_SENTINEL'));
    const answer = await verifyCliAnswer({ question: 'Question', answerText: 'PRIVATE_CLI_DRAFT_SENTINEL',
      getSources: () => {
        if (stage === 'evidence extraction') throw new Error('PRIVATE_CLI_DRAFT_SENTINEL');
        return [{ toolName: 'getSection', key: 'policy', text: 'Evidence' }];
      },
    });
    expect(answer).toBe(WITHHELD_ANSWER);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('PRIVATE_CLI_DRAFT_SENTINEL');
    expect(emitVerifierTelemetry).toHaveBeenLastCalledWith(expect.objectContaining({
      outcome: { status: 'withheld', reason: 'unavailable', passCount: 0 },
    }));
    expect(JSON.stringify(vi.mocked(emitVerifierTelemetry).mock.calls)).not.toContain('PRIVATE_CLI_DRAFT_SENTINEL');
  });

  it('returns exactly the released correction and its telemetry', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const telemetry = { outcome: { status: 'corrected', passCount: 2 } };
    vi.mocked(runVerificationForAnswer).mockResolvedValue({ finalAnswer: 'Verified correction', telemetry } as any);
    expect(await verifyCliAnswer({ question: 'Question', answerText: 'PRIVATE_CLI_DRAFT_SENTINEL',
      getSources: () => [{ toolName: 'getSection', key: 'policy', text: 'Evidence' }],
    })).toBe('Verified correction');
    expect(emitVerifierTelemetry).toHaveBeenLastCalledWith(telemetry);
  });

  it('emits the resolved model and reasoning effort for the evaluation harness', async () => {
    const print = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(runVerificationForAnswer).mockResolvedValue({ finalAnswer: 'Verified', telemetry: {} } as any);
    await verifyCliAnswer({ question: 'Question', answerText: 'Draft',
      getSources: () => [{ toolName: 'getSection', key: 'policy', text: 'Evidence' }],
    });
    const evidence = JSON.parse(print.mock.calls[print.mock.calls.findIndex(([line]) => String(line).includes('---EVIDENCE---')) + 1][0]);
    expect(evidence.agent_config).toEqual({
      agent_model: AGENT_MODEL, agent_reasoning_effort: AGENT_REASONING_EFFORT, verifier_model: getConfig().model,
    });
    expect(evidence.evidence_bytes).toBe(8);
  });
});
