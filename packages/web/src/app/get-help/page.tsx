import type { Metadata } from 'next';
import Link from 'next/link';
import { GetHelp } from '@/components/GetHelp';
import { SiteFooter } from '@/components/SiteFooter';
import { WHO_DECIDES } from '@/lib/get-help';

export const metadata: Metadata = {
  title: 'Get help — NC Medicaid Navigator',
  description: 'Where to get help with your own NC Medicaid case.',
};

// Public, like /terms and /privacy: a person who cannot sign in must still be
// able to reach these contacts (see unauthenticatedPaths in proxy.ts).
export default function GetHelpPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 px-4 py-12 md:px-8">
        <article className="mx-auto max-w-3xl">
          <Link href="/" className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground">
            NC Medicaid Navigator
          </Link>
          <h1 className="font-heading mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Get help
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-foreground">
            NC Medicaid Navigator explains published policy. {WHO_DECIDES}
          </p>
          <GetHelp className="mt-6 text-[15px]" />
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
