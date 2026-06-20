import type { Metadata } from "next";
import { cookies } from 'next/headers';
import { AuthKitProvider } from '@workos-inc/authkit-nextjs/components';
import { ThemeProvider, type Theme } from '@/components/ThemeProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { fontClassNames } from './fonts';
import "./globals.css";

export const metadata: Metadata = {
  title: 'NC Medicaid Navigator',
  description: 'AI-powered NC Medicaid policy research tool — Queen City Cortex',
};

// Runs before first paint: resolves the persisted theme cookie (set by
// actions/theme.ts) and applies the `dark` class so dark-mode users never see
// a white flash. 'system' (or no cookie) falls back to prefers-color-scheme.
const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )theme=([^;]*)/);var t=m?decodeURIComponent(m[1]):null;if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.classList.toggle('dark',t==='dark')}catch(e){}})()`;

function parseTheme(value: string | undefined): Theme {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialTheme = parseTheme(cookieStore.get('theme')?.value);

  return (
    <html
      lang="en"
      // Server-render the dark class for explicit dark so even no-JS paints
      // correctly; the inline script below covers 'system'. The script may
      // adjust the class before hydration, hence suppressHydrationWarning.
      className={`h-full antialiased ${fontClassNames}${initialTheme === 'dark' ? ' dark' : ''}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <AuthKitProvider>
          <ThemeProvider initialTheme={initialTheme}>
            <TooltipProvider>{children}</TooltipProvider>
          </ThemeProvider>
        </AuthKitProvider>
      </body>
    </html>
  );
}
