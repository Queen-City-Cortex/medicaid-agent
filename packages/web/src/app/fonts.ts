import { Fraunces, Newsreader, IBM_Plex_Mono } from 'next/font/google';

// "Document of Record" type system — see globals.css for the rationale.
//
// next/font self-hosts each face at build time (no runtime Google request, no
// layout-shift flash), exposing a CSS variable we hang the design tokens off of.

// Display serif with gravitas + optical sizing — wordmark, hero, headings.
export const fontDisplay = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  style: ['normal', 'italic'],
  variable: '--font-display',
});

// On-screen reading serif — answer prose and body copy read like a document.
export const fontReading = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  style: ['normal', 'italic'],
  variable: '--font-reading',
});

// The "apparatus" voice — policy numbers, citation markers, uppercase
// microlabels, metadata, button labels. Mono = legal-citation register.
export const fontMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const fontClassNames = `${fontDisplay.variable} ${fontReading.variable} ${fontMono.variable}`;
