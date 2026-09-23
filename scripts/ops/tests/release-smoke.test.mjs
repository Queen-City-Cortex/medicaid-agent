import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswerStream, validateAccessToken, smokeCredentials, runSmoke } from '../release-smoke.mjs';

const event = value => 'data: ' + JSON.stringify(value) + '\n\n';
const answer = 'An evidence-backed answer. [Source](https://medicaid.ncdhhs.gov/policy)';
const events = status => [
  { type: 'data-verification-status', data: { status: 'verifying' } },
  { type: 'data-verification-status', data: { status, passCount: status === 'corrected' ? 2 : 1 } },
  { type: 'text-start', id: 'a' },
  { type: 'text-delta', id: 'a', delta: answer },
  { type: 'text-end', id: 'a' }, { type: 'finish' },
];
const stream = values => values.map(event).join('') + 'data: [DONE]\n\n';
for (const status of ['passed', 'corrected']) test('accepts ' + status, () => {
  assert.equal(checkAnswerStream(stream(events(status)), 20).outcome, status);
});
for (const [name, values] of [
  ['withheld', events('withheld')],
  ['missing outcome', events('passed').filter(e => e.type !== 'data-verification-status')],
  ['source-only', [{ type: 'source-url', url: 'https://example.com' }, { type: 'finish' }]],
  ['missing finish', events('passed').slice(0, -1)],
  ['unchecked draft', [{ type: 'text-start', id: 'draft' }, ...events('passed')]],
  ['error', [...events('passed').slice(0, -1), { type: 'error' }]],
  ['invalid citation', events('passed').map(e => e.type === 'text-delta' ? { ...e, delta: 'A long answer without an inline citation.' } : e)],
]) test('rejects ' + name, () => assert.throws(() => checkAnswerStream(stream(values), 20)));
test('rejects disconnected stream', () => assert.throws(() => checkAnswerStream(events('passed').map(event).join(''), 20)));
const token = (sub, exp) => 'header.' + Buffer.from(JSON.stringify({ sub, exp })).toString('base64url') + '.signature';
test('rejects expired and wrong-user tokens', () => {
  assert.throws(() => validateAccessToken(token('u', 1), 'u', 240));
  assert.throws(() => validateAccessToken(token('other', Date.now()/1000+3600), 'u', 240));
  validateAccessToken(token('u', Date.now()/1000+3600), 'u', 240);
});
test('obtains fresh credentials on every invocation and never falls back on auth failure', async () => {
  let calls = 0;
  const env = { SYNTHETIC_USER_EMAIL: 'test@example.com', SYNTHETIC_USER_PASSWORD: 'password', WORKOS_CLIENT_ID: 'client', WORKOS_API_KEY: 'secret' };
  const request = async () => { calls++; return { ok: true, json: async () => ({ access_token: 'fresh', user: { id: 'u' } }) }; };
  await smokeCredentials(env, request); await smokeCredentials(env, request);
  assert.equal(calls, 2);
  await assert.rejects(smokeCredentials({ ...env, SYNTHETIC_ACCESS_TOKEN: 'fallback' }, async () => ({ ok: false, status: 401 })));
});
test('rejects a healthy endpoint serving a stale release', async () => {
  const env = { AGENT_PUBLIC_URL: 'https://agent.example', SYNTHETIC_RESOURCE_ID: 'u', SYNTHETIC_ACCESS_TOKEN: token('u', Date.now()/1000+3600) };
  await assert.rejects(runSmoke('new', env, async () => ({ ok: true, json: async () => ({ status: 'ok', releaseId: 'old' }) })), /expected healthy release/);
});
