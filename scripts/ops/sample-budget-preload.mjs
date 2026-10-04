// The child has only fake provider credentials; the gateway holds real keys.
const originalFetch = globalThis.fetch;
const gateway = process.env.SAMPLE_GATEWAY_URL;
globalThis.fetch = async (input, options = {}) => {
  const request = input instanceof Request ? input : null;
  const url = new URL(request?.url ?? String(input));
  let target;
  if (url.origin === gateway && url.pathname === '/v1/responses') target = url;
  else if (url.origin === 'https://api.openai.com' && url.pathname === '/v1/responses') target = new URL('/v1/responses', gateway);
  else if (url.origin === 'https://api.voyageai.com' && url.pathname === '/v1/embeddings') target = new URL('/voyage/embeddings', gateway);
  else throw new Error('External fetch is outside the finite cost sample');
  const headers = new Headers(options.headers ?? request?.headers);
  headers.set('Authorization', 'Bearer ' + process.env.SAMPLE_GATEWAY_NONCE);
  headers.set('X-Sample-Question', process.env.SAMPLE_QUESTION_ID);
  return originalFetch(target, { ...options, headers,
    ...(request ? { method: options.method ?? request.method, body: options.body ?? await request.text() } : {}) });
};
