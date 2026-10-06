import './load-env.js';
import { Mastra } from '@mastra/core';
import { resolveCoverageScope } from '@nc-medicaid/policy-corpus';
import { cliAgentConfig, verifyCliAnswer, type CliRuntimeRecord } from './cli-verification.js';
import { deepResearchWorkflow } from './deep-research/workflow.js';
import { isVerifierEnabled } from './env.js';
import { closeDriver } from './neo4j.js';
import {
  extractSources,
  extractSourcesFromToolResults,
  type ToolResultRecord,
} from './processors/hallucination-verifier.js';
import type { GateTripwireMetadata } from './processors/message-length-guard.js';
import { createPrivateVerificationCapture } from './processors/verifier/diagnostics.js';
import { emitVerifierTelemetry } from './processors/verifier/run.js';
import { createAgentRuntime } from './runtime.js';

// One-shot command line, and the process the answer evaluation runs once per
// question. Usage:
//   npx tsx src/cli.ts "question"                  → chat agent
//   npx tsx src/cli.ts --deep-research "question"   → deep-research workflow
const CLI_ARGS = process.argv.slice(2);
const IS_DEEP_RESEARCH = CLI_ARGS[0] === '--deep-research';
const QUESTION = IS_DEEP_RESEARCH ? CLI_ARGS[1] : CLI_ARGS[0];
if (!QUESTION) {
  console.error('Usage: tsx src/cli.ts [--deep-research] "question"');
  process.exit(2);
}

// The production assembly less two paid parts, to save evaluation quota: no
// thread memory (so no observational memory either) and no prompt-injection
// classifier. The length, coverage and scope gates run as they do for a web
// user. No server options, so no WorkOS settings are needed.
const CLI_RUNTIME = { memory: false, promptInjectionDetector: false, verifyOutput: false } as const;

const runtime = await createAgentRuntime(CLI_RUNTIME);
void runtime.runRetention();
const mastra = new Mastra({
  agents: { ncMedicaidAgent: runtime.agent },
  workflows: { deepResearchWorkflow },
  storage: runtime.storage,
  observability: runtime.observability,
  logger: runtime.logger,
});

type Fields = Record<string, unknown>;
const fields = (value: unknown): Fields => (value && typeof value === 'object' ? value as Fields : {});

/** Mastra wraps each AI SDK tool-result into an envelope:
 *  { type: 'tool-result', runId, from, payload: { toolName, toolCallId, result, args } }
 *  Some callers / versions put those fields at the top level — accept both shapes. */
function stepToolResults(step: unknown): ToolResultRecord[] {
  const results = fields(step).toolResults ?? fields(fields(step).response).toolResults;
  return (Array.isArray(results) ? results : []).flatMap((entry): ToolResultRecord[] => {
    if (!entry) return [];
    const payload = fields(fields(entry).payload ?? entry);
    const toolName = payload.toolName ?? payload.tool_name;
    if (typeof toolName !== 'string' || !toolName) return [];
    const toolCallId = payload.toolCallId ?? payload.tool_call_id;
    return [{
      toolName,
      toolCallId: typeof toolCallId === 'string' ? toolCallId : undefined,
      result: payload.result ?? payload.output,
    }];
  });
}

/**
 * An input gate refused the question, as it would for a web user: no model ran
 * and nothing was verified. The evaluation reads every outcome from the
 * `---VERIFIER---` block, so the refusal is reported there as a withheld
 * answer with zero passes, marked by `gate` so it cannot be mistaken for the
 * verifier's own decision. Only the gate's code and its fixed user message are
 * printed; the tripwire reason can quote a classifier.
 */
function emitGateRefusal(question: string, tripwire: { processorId?: string; metadata?: unknown }, record: CliRuntimeRecord): string {
  const metadata = fields(tripwire.metadata) as Partial<GateTripwireMetadata>;
  const code = metadata.code ?? 'input-gate';
  const userMessage = metadata.userMessage ?? 'This request was blocked before it reached the assistant.';
  console.log('\n---EVIDENCE---\n');
  console.log(JSON.stringify({ sources: [], evidence_bytes: 0, agent_config: cliAgentConfig(record) }));
  emitVerifierTelemetry({
    gate: { processor_id: tripwire.processorId ?? null, code },
    coverage_policy_id: resolveCoverageScope(question)?.policyId ?? null,
    coverage_issue: code === 'coverage-limitation' ? userMessage : null,
    latency_ms: 0, pass_count: 0, withholding_reason: code,
    outcome: { status: 'withheld', reason: code, passCount: 0 },
    rewrote: false, supported: false, verifier_unavailable: false,
  });
  return userMessage;
}

if (IS_DEEP_RESEARCH) {
  // Internal-only CLI runner: suspend for approval, then approve directly on
  // the in-process workflow. No public autoApprove input exists.
  try {
    const run = await mastra.getWorkflow('deepResearchWorkflow').createRun();
    const planned = await run.start({ inputData: { question: QUESTION } });
    if (planned.status !== 'suspended') {
      throw new Error(`Planner did not suspend for approval (status ${planned.status})`);
    }
    const result = await run.resume({ step: 'plan-approval', resumeData: { approved: true } });
    if (result.status === 'success') {
      const report = result.result;
      console.log('\n---PLAN---\n');
      console.log(JSON.stringify({ brief: report.brief, subQuestions: report.subQuestions }, null, 2));
      console.log('\n---STATS---\n');
      console.log(JSON.stringify(report.stats));
      if (report.citationProvenance) {
        console.log('\n---VERIFIER---\n');
        console.log(JSON.stringify(report.citationProvenance));
      }
      console.log('\n---REPORT---\n');
      console.log(report.reportMarkdown);
    } else {
      console.error('Deep research did not complete. Status:', result.status);
      if ('error' in result) console.error(result.error);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Deep research error:', err);
    process.exitCode = 1;
  } finally {
    await closeDriver();
  }
} else {
  const agent = runtime.agent;
  const record: CliRuntimeRecord = {
    input_processors: (await agent.listConfiguredInputProcessors()).map(processor => processor.id),
    runtime_options: { memory: CLI_RUNTIME.memory, prompt_injection_detector: CLI_RUNTIME.promptInjectionDetector },
  };

  // Accumulate tool-call results across generate() steps. We need raw
  // {toolName, result} records rather than Mastra DB messages because the AI SDK
  // response format the agent returns doesn't carry tool-invocation parts in a
  // shape extractSources can parse.
  const toolResults: ToolResultRecord[] = [];
  const captureGeneration = createPrivateVerificationCapture();

  try {
    const result = await agent.generate(QUESTION, {
      ...runtime.runLimits,
      memory: { thread: `cli-${Date.now()}`, resource: 'cli' },
      onStepFinish: (step: unknown) => { toolResults.push(...stepToolResults(step)); },
    });

    let finalAnswer: string;
    if (result.tripwire) {
      // Mastra logs the tripwire through an asynchronous stream on stdout. A
      // refusal returns at once, so let those lines land before the blocks the
      // evaluation parses; everything after `---ANSWER---` is read as the answer.
      await new Promise(resolve => setTimeout(resolve, 250));
      finalAnswer = emitGateRefusal(QUESTION, result.tripwire, record);
    } else {
      const messages = result.response?.messages ?? fields(result).messages;
      captureGeneration?.({ stage: 'generation', question: QUESTION, toolResults, messages: result.response?.messages });
      finalAnswer = result.text ?? '';

      if (isVerifierEnabled() && finalAnswer) {
        finalAnswer = await verifyCliAnswer({ question: QUESTION, answerText: finalAnswer, capture: captureGeneration, runtime: record, getSources: () => {
          const sources = extractSourcesFromToolResults(toolResults);
          if (sources.length > 0) return sources;
          return extractSources(Array.isArray(messages) ? messages : []);
        } });
      }
    }

    console.log('\n---ANSWER---\n');
    console.log(finalAnswer || 'I was unable to find sufficient information to answer this question. Please try rephrasing or asking about a more specific aspect of the policy.');
  } catch (err) {
    console.error('Agent error:', err);
    process.exitCode = 1;
  } finally {
    await closeDriver();
  }
}
