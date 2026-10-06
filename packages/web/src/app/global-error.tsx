'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { CRISIS_LINE, GET_HELP_CONTACTS } from '@/lib/get-help';

// Catches errors that crash the root layout itself (which the segment-level
// error.tsx cannot). Must render its own <html>/<body>. Sentry.captureException
// is a no-op when Sentry is not initialised.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          padding: '1rem',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#666' }}>
            Something broke on our side. Please reload the page.
          </p>
          {/* The root layout has crashed, so the styled GetHelp component and
              the /get-help page may not render. List the contacts inline. */}
          <p style={{ marginTop: '1.5rem', fontWeight: 600 }}>Need help with your own case?</p>
          <ul style={{ listStyle: 'none', padding: 0, lineHeight: 1.6 }}>
            {GET_HELP_CONTACTS.map((contact) => (
              <li key={contact.id}>
                <a href={contact.url}>{contact.name}</a>
                {contact.phone ? <>: <a href={`tel:${contact.tel}`}>{contact.phone}</a></> : null}
              </li>
            ))}
          </ul>
          <p style={{ fontWeight: 600 }}>{CRISIS_LINE}</p>
        </div>
      </body>
    </html>
  );
}
