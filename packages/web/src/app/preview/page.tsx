import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PreviewGallery } from './gallery';

export const metadata: Metadata = {
  title: 'Component preview — NC Medicaid Navigator',
  robots: { index: false, follow: false },
};

/**
 * Dev-only component gallery. Renders the real UI components against fixtures
 * with NO WorkOS session and NO Mastra/Neo4j backend, so the frontend can be
 * iterated and screenshotted in isolation (`/preview`).
 *
 * Returns 404 in production so it never ships as a live route — this gate, not
 * the middleware allow-list, is the real protection. See `proxy.ts` for why
 * `/preview` is in `unauthenticatedPaths` (so it's reachable in dev without a
 * login round-trip).
 */
export default function PreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <PreviewGallery />;
}
