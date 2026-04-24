import type { Metadata } from "next";
import { AuthKitProvider } from '@workos-inc/authkit-nextjs/components';
import { ThemeProvider } from '@/components/ThemeProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import "./globals.css";

export const metadata: Metadata = {
  title: 'NC Medicaid Navigator',
  description: 'AI-powered NC Medicaid policy research tool — Queen City Cortex',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col font-sans">
        <AuthKitProvider>
          <ThemeProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </ThemeProvider>
        </AuthKitProvider>
      </body>
    </html>
  );
}
