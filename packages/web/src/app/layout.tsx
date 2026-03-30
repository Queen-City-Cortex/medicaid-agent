import type { Metadata } from "next";
import { Source_Serif_4, DM_Sans, JetBrains_Mono } from "next/font/google";
import { AuthKitProvider } from '@workos-inc/authkit-nextjs/components';
import "./globals.css";

const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const sans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400"],
});

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
      className={`${serif.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <AuthKitProvider>{children}</AuthKitProvider>
      </body>
    </html>
  );
}
