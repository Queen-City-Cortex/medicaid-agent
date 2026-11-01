/**
 * Keyless demo of the answer release path. No API key, Neo4j or network.
 *
 *   npm run demo                     (from the repository root)
 *   npx tsx scripts/demo.ts --json   (from packages/agent; one JSON line per scenario)
 *
 * The verification and release code is the production code; the drafts and
 * the verifier model's verdicts are scripted. See scripts/demo/scenarios.ts.
 */
// Release log lines would interleave with the walkthrough; keep warnings and errors.
process.env.LOG_LEVEL ??= 'warn';
const { SCENARIOS, runScenario } = await import('./demo/scenarios.js');

const json = process.argv.includes('--json');
const rule = '─'.repeat(72);
const indent = (text: string) => text.replace(/^/gm, '    ');

if (!json) {
  console.log('NC Medicaid Navigator: keyless demo of the answer release path\n');
  console.log('Real: the coverage, link, quotation and evidence checks, the two-pass correction');
  console.log('rule and the release decision (packages/agent/src/processors/verifier/run.ts).');
  console.log('Scripted: the agent drafts and the verifier model replies. No model is called.');
}

let mismatches = 0;
for (const [index, scenario] of SCENARIOS.entries()) {
  const { run, modelCalls, shown } = await runScenario(scenario);
  const { outcome, telemetry } = run;
  const matches = outcome.status === scenario.expected.status && modelCalls === scenario.expected.modelCalls;
  if (!matches) mismatches += 1;

  if (json) {
    console.log(JSON.stringify({ id: scenario.id, outcome, modelCalls, shown, telemetry }));
    continue;
  }
  console.log(`\n${rule}\n${index + 1}. ${scenario.title}\n${rule}`);
  console.log(scenario.shows);
  console.log(`\nQuestion:\n${indent(scenario.question)}`);
  console.log(`\nDraft (private; in production it never leaves the server):\n${indent(scenario.draft)}`);
  console.log(`\nSources retrieved: ${scenario.sources.length ? scenario.sources.map(source => source.policyNumber).join(', ') : 'none'}`);
  console.log('Checks:');
  console.log(`    links not in any retrieved source: ${telemetry.fabricated_url_count}`);
  console.log(`    quotations not in any retrieved text: ${telemetry.fabricated_quote_count}`);
  console.log(`    verifier model calls: ${modelCalls} (at most two, no retries)`);
  for (const finding of run.findings) {
    for (const claim of finding.unsupportedClaims ?? []) console.log(`    pass ${finding.pass}: unsupported "${claim.claim}": ${claim.reason}`);
  }
  const reason = outcome.status === 'withheld' ? ` (${outcome.reason})` : '';
  console.log(`\nOutcome: ${outcome.status}${reason}${matches ? '' : '   <-- UNEXPECTED'}`);
  console.log(`What the person sees:\n${indent(shown)}`);
}

if (!json) console.log(`\n${rule}\n${SCENARIOS.length - mismatches} of ${SCENARIOS.length} scenarios ended as expected.`);
if (mismatches) process.exitCode = 1;
