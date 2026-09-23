import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function checkAnswerStream(body, minimumCharacters = 200) {
  let outcome;
  let text = '';
  let finished = false;
  let done = false;
  const openText = new Set();
  for (const frame of body.replaceAll('\r\n', '\n').split('\n\n')) {
    const lines = frame.split('\n').filter(line => line.startsWith('data:'));
    if (!lines.length) continue;
    const data = lines.map(line => line.slice(5).trimStart()).join('\n');
    if (done) throw new Error('Data after stream completion');
    if (data === '[DONE]') { done = true; continue; }
    const event = JSON.parse(data);
    if (finished) throw new Error('Event after finish');
    if (['error', 'abort', 'data-tripwire'].includes(event.type)) throw new Error('Chat failed');
    if (event.type === 'data-verification-status') {
      if (event.data?.status === 'verifying' && !outcome) continue;
      if (outcome || !['passed', 'corrected'].includes(event.data?.status)
          || ![1, 2].includes(event.data?.passCount)) throw new Error('Answer was not verified');
      outcome = event.data;
    }
    if (event.type === 'text-start') {
      if (!outcome || openText.has(event.id)) throw new Error('Unchecked or malformed text');
      openText.add(event.id);
    }
    if (event.type === 'text-delta') {
      if (!outcome || !openText.has(event.id) || typeof event.delta !== 'string') throw new Error('Unchecked or malformed text');
      text += event.delta;
    }
    if (event.type === 'text-end' && !openText.delete(event.id)) throw new Error('Malformed text end');
    if (event.type === 'finish') {
      if (['error', 'length', 'content-filter'].includes(event.finishReason)) throw new Error('Incomplete answer');
      finished = true;
    }
  }
  if (!done || !finished || openText.size || !outcome) throw new Error('Incomplete verified stream');
  if (text.trim().length < minimumCharacters) throw new Error('Released answer too short');
  if (!/\[[^\]]+\]\(https?:\/\/[^\s)]+\)/i.test(text)) throw new Error('Released answer lacks citations');
  return { outcome: outcome.status, passCount: outcome.passCount, answerCharacters: text.length };
}

export function validateAccessToken(token, resourceId, timeoutSeconds, now = Date.now()) {
  let claims;
  try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')); } catch { throw new Error('Invalid smoke access token'); }
  // The agent verifies the signature. This preflight prevents known-expired or
  // wrong-account credentials from being mistaken for a release regression.
  if (claims.sub !== resourceId || !Number.isFinite(claims.exp)
      || claims.exp * 1000 <= now + (timeoutSeconds + 15) * 1000) throw new Error('Smoke access token is expired or belongs to another account');
}

export async function smokeCredentials(env, request = fetch) {
  const email = env.SYNTHETIC_USER_EMAIL;
  const password = env.SYNTHETIC_USER_PASSWORD;
  if (email || password) {
    if (!email || !password || !env.WORKOS_CLIENT_ID || !env.WORKOS_API_KEY) throw new Error('Incomplete fresh smoke authentication configuration');
    const response = await request('https://api.workos.com/user_management/authenticate', {
      method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: env.WORKOS_CLIENT_ID, client_secret: env.WORKOS_API_KEY, grant_type: 'password', email, password }),
    });
    if (!response.ok) throw new Error('Fresh smoke authentication failed (HTTP ' + response.status + ')');
    const auth = await response.json();
    if (!auth.access_token || !auth.user?.id) throw new Error('Authentication did not return an access token and user');
    if (env.SYNTHETIC_RESOURCE_ID && env.SYNTHETIC_RESOURCE_ID !== auth.user.id) throw new Error('Unexpected synthetic account');
    return { token: auth.access_token, resourceId: auth.user.id };
  }
  if (!env.SYNTHETIC_ACCESS_TOKEN || !env.SYNTHETIC_RESOURCE_ID) throw new Error('Fresh synthetic credentials or an unexpired explicit token are required');
  return { token: env.SYNTHETIC_ACCESS_TOKEN, resourceId: env.SYNTHETIC_RESOURCE_ID };
}

export async function runSmoke(releaseId, env = process.env, request = fetch) {
  if (!releaseId || !env.AGENT_PUBLIC_URL) throw new Error('Release ID and AGENT_PUBLIC_URL are required');
  const base = new URL(env.AGENT_PUBLIC_URL);
  if (base.protocol !== 'https:') throw new Error('Production smoke requires HTTPS');
  const timeoutSeconds = Number(env.RELEASE_SMOKE_TIMEOUT_SECONDS ?? 240);
  const minimumCharacters = Number(env.RELEASE_SMOKE_MIN_ANSWER_CHARS ?? 200);
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 900
      || !Number.isInteger(minimumCharacters) || minimumCharacters < 1) throw new Error('Invalid smoke limits');
  let { token, resourceId } = await smokeCredentials(env, request);
  validateAccessToken(token, resourceId, timeoutSeconds);
  const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
  for (const route of ['/readyz', '/corpus-status', '/dependencyz']) {
    const response = await request(new URL(route, base), { headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(route + ' failed (HTTP ' + response.status + ')');
    const status = await response.json();
    if (route === '/corpus-status' ? status.releaseId !== releaseId || !(status.documentCount > 0)
      : status.status !== 'ok' || (route === '/readyz' && status.releaseId !== releaseId)) throw new Error(route + ' did not confirm the expected healthy release');
  }
  try { validateAccessToken(token, resourceId, timeoutSeconds); } catch (error) {
    if (!env.SYNTHETIC_USER_EMAIL) throw error;
    ({ token, resourceId } = await smokeCredentials(env, request));
    validateAccessToken(token, resourceId, timeoutSeconds);
    headers.authorization = 'Bearer ' + token;
  }
  const response = await request(new URL('/chat', base), {
    method: 'POST', headers, signal: AbortSignal.timeout(timeoutSeconds * 1000),
    body: JSON.stringify({
      messages: [{ id: randomUUID(), role: 'user', parts: [{ type: 'text', text: env.RELEASE_SMOKE_QUESTION ?? 'What does EPSDT require?' }] }],
      memory: { thread: 'release-smoke-' + releaseId + '-' + randomUUID(), resource: resourceId },
    }),
  });
  if (!response.ok) throw new Error('Chat failed (HTTP ' + response.status + ')');
  return { releaseId, ...checkAnswerStream(await response.text(), minimumCharacters) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSmoke(process.argv[2]).then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(error.message); process.exitCode = 1;
  });
}
