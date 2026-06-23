/**
 * Single source of truth for the Mastra agent base URL.
 *
 * This previously lived as four identical `process.env.NEXT_PUBLIC_MASTRA_URL
 * || 'http://localhost:4111'` definitions (mastra-client, use-chat-thread,
 * use-feedback, use-corpus-status). A deploy that forgot to set the build-time
 * var would silently bake `localhost` into the bundle, so every backend call
 * failed opaquely for end users with nothing pointing at the misconfig.
 *
 * `NEXT_PUBLIC_*` is inlined at build time, so we can't recover at runtime —
 * but we can fail loud: a production browser bundle missing the var logs a
 * prominent error. We deliberately do NOT throw, because the local
 * `next build` (NODE_ENV=production) intentionally relies on the localhost
 * fallback and must keep building.
 */
const FALLBACK_MASTRA_URL = 'http://localhost:4111';

const configuredMastraUrl = process.env.NEXT_PUBLIC_MASTRA_URL;

if (
  !configuredMastraUrl &&
  process.env.NODE_ENV === 'production' &&
  typeof window !== 'undefined'
) {
  console.error(
    `[config] NEXT_PUBLIC_MASTRA_URL is not set — falling back to ${FALLBACK_MASTRA_URL}. ` +
      'Backend calls (chat, threads, feedback, corpus status) will fail in production. ' +
      'Set NEXT_PUBLIC_MASTRA_URL as a build-time variable on the web service.',
  );
}

export const MASTRA_URL = configuredMastraUrl || FALLBACK_MASTRA_URL;
