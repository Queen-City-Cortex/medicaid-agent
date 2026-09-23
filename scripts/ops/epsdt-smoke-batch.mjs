import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runSmoke } from './release-smoke.mjs';

/** Fixed-size batch: retain failures and never replace a failed attempt. */
export async function runEpsdtBatch(releaseId, output, env = process.env, smoke = runSmoke) {
  if (!env.SYNTHETIC_USER_EMAIL || !env.SYNTHETIC_USER_PASSWORD) throw new Error('Every EPSDT attempt requires fresh account authentication');
  if (!output) throw new Error('An evidence output path is required');
  if (fs.existsSync(output)) throw new Error('Refusing to overwrite an existing smoke batch');
  const report = { schemaVersion: 1, releaseId, deploymentId: env.SMOKE_DEPLOYMENT_ID ?? null,
    question: 'What does EPSDT require?', startedAt: new Date().toISOString(), attempts: [], passed: false };
  const save = () => {
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output + '.pending', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(output + '.pending', output);
  };
  save();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const started = Date.now();
    try {
      const result = await smoke(releaseId, { ...env, RELEASE_SMOKE_QUESTION: report.question });
      report.attempts.push({ attempt, ...result, passed: true, elapsedMs: Date.now() - started });
    } catch (error) {
      report.attempts.push({ attempt, passed: false, error: error.message, ...(error.verification ? { verification: error.verification } : {}), elapsedMs: Date.now() - started });
    }
    save();
  }
  report.passed = report.attempts.every(row => row.passed);
  report.completedAt = new Date().toISOString();
  save();
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEpsdtBatch(process.argv[2], process.argv[3]).then(report => {
    console.log(JSON.stringify(report));
    if (!report.passed) process.exitCode = 1;
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
