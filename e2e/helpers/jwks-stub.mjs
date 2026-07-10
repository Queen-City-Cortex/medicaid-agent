// Minimal local JWKS server for hermetic e2e auth.
//
// The authkit middleware verifies the sealed session's access token against
// WorkOS's remote JWKS. WORKOS_API_HOSTNAME/PORT/HTTPS point it here instead,
// so the mocked Playwright project runs with zero WorkOS network calls. The
// served key is the checked-in TEST-ONLY public JWK (fixtures/test-jwk.json).
//
// Started by the Playwright webServer array in hermetic mode.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const { publicJwk } = JSON.parse(readFileSync(join(here, '../fixtures/test-jwk.json'), 'utf8'));

const PORT = Number(process.env.JWKS_STUB_PORT ?? 8719);

createServer((req, res) => {
  // getJwksUrl(clientId) → `${baseURL}/sso/jwks/${clientId}` — serve any
  // client id so the stub doesn't need to know the test env's value.
  if (req.url?.startsWith('/sso/jwks/')) {
    console.log(`[jwks-stub] served JWKS for ${req.url}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ keys: [publicJwk] }));
    return;
  }
  console.log(`[jwks-stub] 404 ${req.method} ${req.url}`);
  res.writeHead(404).end();
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[jwks-stub] listening on http://127.0.0.1:${PORT}`);
});
