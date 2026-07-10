/**
 * Hermetic auth for the mocked Playwright project: mints a WorkOS-shaped
 * access token with the checked-in TEST-ONLY keypair, seals it into a
 * `wos-session` cookie exactly like authkit's encryptSession (iron-session
 * sealData, same password the web dev server runs with), and writes the
 * Playwright storageState file the mocked project loads.
 *
 * The authkit middleware then unseals the cookie and verifies the token
 * against the local JWKS stub (jwks-stub.mjs) — zero WorkOS network calls.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { SignJWT, importJWK } from 'jose';
import { sealData } from 'iron-session';
import { HERMETIC_ENV } from './hermetic-env';

const here = path.dirname(fileURLToPath(import.meta.url));

export const TEST_USER = {
  object: 'user',
  id: 'user_e2e_test',
  email: 'e2e@test.local',
  emailVerified: true,
  firstName: 'E2E',
  lastName: 'Test',
  profilePictureUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export async function writeHermeticStorageState(authFile: string): Promise<void> {
  const { privateJwk, kid } = JSON.parse(
    fs.readFileSync(path.join(here, '../fixtures/test-jwk.json'), 'utf8'),
  );
  const key = await importJWK(privateJwk, 'RS256');

  const now = Math.floor(Date.now() / 1000);
  const accessToken = await new SignJWT({
    sub: TEST_USER.id,
    sid: 'session_e2e_test',
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt(now)
    // 2h: long enough that useAccessToken never triggers a refresh (which
    // would be a real WorkOS call) within any test run.
    .setExpirationTime(now + 2 * 60 * 60)
    .setIssuer(`http://127.0.0.1:8719`)
    .sign(key);

  // Same shape + sealing as authkit's encryptSession(session).
  const sealed = await sealData(
    { accessToken, refreshToken: 'e2e_test_refresh_token', user: TEST_USER },
    { password: HERMETIC_ENV.WORKOS_COOKIE_PASSWORD, ttl: 0 },
  );

  const storageState = {
    cookies: [
      {
        name: 'wos-session',
        value: sealed,
        domain: 'localhost',
        path: '/',
        expires: now + 2 * 60 * 60,
        httpOnly: true,
        secure: false, // http redirect URI → getCookieOptions sets secure=false
        sameSite: 'Lax' as const,
      },
    ],
    origins: [],
  };

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  fs.writeFileSync(authFile, JSON.stringify(storageState, null, 2));
}
