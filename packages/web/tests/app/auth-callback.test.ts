// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let GET: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.WORKOS_CLIENT_ID = 'client_test';
  process.env.WORKOS_API_KEY = 'sk_test_unit';
  process.env.WORKOS_COOKIE_PASSWORD = 'unit-test-cookie-password-0123456789abcdef';
  process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = 'https://app.example.test/auth/callback';
  ({ GET } = await import('../../src/app/auth/callback/route'));
});

describe('auth callback', () => {
  it('restarts sign-in when the callback arrives without this browser\'s sign-in cookie (invitation emails)', async () => {
    const response = await GET(new NextRequest('https://app.example.test/auth/callback?code=abc&state=xyz'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.example.test/chat');
  });

  it('restarts sign-in when the callback carries no state at all', async () => {
    const response = await GET(new NextRequest('https://app.example.test/auth/callback?code=abc'));
    expect(response.headers.get('location')).toBe('https://app.example.test/chat');
  });
});
