import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let stdout = '';
let auditExitCode = 0;
try {
  stdout = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
} catch (error) {
  auditExitCode = typeof error.status === 'number' ? error.status : 1;
  stdout = error.stdout?.toString() ?? '';
}
let report;
try {
  report = JSON.parse(stdout);
} catch {
  console.error('Production dependency audit failed: npm did not return a valid JSON report.');
  process.exit(2);
}
if (report.error || !report.metadata || !report.vulnerabilities) {
  console.error(`Production dependency audit failed: ${report.error?.summary ?? 'incomplete npm audit response'}`);
  process.exit(2);
}
const exceptions = JSON.parse(readFileSync(new URL('../security/npm-audit-exceptions.json', import.meta.url), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const failures = [];
for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
  if (vulnerability.severity === 'high' || vulnerability.severity === 'critical') {
    failures.push(`${name}: unaccepted ${vulnerability.severity} vulnerability`);
  }
  if (vulnerability.severity === 'moderate') {
    const exception = exceptions[name];
    if (!exception) failures.push(`${name}: moderate vulnerability has no exception`);
    else if (exception.expires < today) failures.push(`${name}: exception expired ${exception.expires}`);
    else if (!exception.owner || !exception.reason) failures.push(`${name}: exception is incomplete`);
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
if (auditExitCode !== 0 && (report.metadata.vulnerabilities?.total ?? 0) === 0) {
  console.error(`Production dependency audit failed with npm exit code ${auditExitCode}.`);
  process.exit(2);
}
console.log('Production dependency audit passed; high/critical=0 and moderate exceptions are current.');
