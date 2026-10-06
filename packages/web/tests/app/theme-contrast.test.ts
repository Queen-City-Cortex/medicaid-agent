import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Pins the colour tokens in globals.css to the WCAG AA contrast minimums:
// 4.5:1 for text, 3:1 for focus rings. Opacity modifiers at call sites are not
// visible here, so text and rings must use these tokens at full opacity.

type Rgb = [number, number, number];

function oklchToSrgb(l: number, c: number, h: number): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return linear.map((x) => {
    const clipped = Math.min(1, Math.max(0, x));
    return clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055;
  }) as Rgb;
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: Rgb, bg: Rgb): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(path.resolve(__dirname, '../../src/app/globals.css'), 'utf8');

function themeTokens(selector: ':root' | '.dark'): Map<string, Rgb> {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf('\n}', start));
  const tokens = new Map<string, Rgb>();
  for (const m of block.matchAll(/--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)) {
    tokens.set(m[1], oklchToSrgb(Number(m[2]), Number(m[3]), Number(m[4])));
  }
  return tokens;
}

const SURFACES = ['background', 'card', 'muted', 'sidebar', 'sidebar-accent'];
const TEXT_PAIRS: Array<[string, string]> = [
  ...SURFACES.map((s): [string, string] => ['muted-foreground', s]),
  ...SURFACES.map((s): [string, string] => ['accent', s]),
  ['accent-foreground', 'accent'],
  // The delete-chat confirm button.
  ['destructive-foreground', 'destructive'],
];
const RING_PAIRS: Array<[string, string]> = [
  ...SURFACES.map((s): [string, string] => ['ring', s]),
  ['sidebar-ring', 'sidebar'],
  ['sidebar-ring', 'sidebar-accent'],
];

describe('theme colour contrast', () => {
  it('converts oklch to sRGB (Tailwind emerald-700 is #007a55)', () => {
    const hex = oklchToSrgb(0.508, 0.118, 165.612)
      .map((x) => Math.round(x * 255).toString(16).padStart(2, '0'))
      .join('');
    expect(hex).toBe('007a55');
  });

  describe.each([':root', '.dark'] as const)('%s', (selector) => {
    const tokens = themeTokens(selector);
    const ratio = (fg: string, bg: string) => {
      const [f, b] = [tokens.get(fg), tokens.get(bg)];
      if (!f || !b) throw new Error(`missing opaque oklch token: --${!f ? fg : bg}`);
      return contrast(f, b);
    };

    it.each(TEXT_PAIRS)('text --%s on --%s is at least 4.5:1', (fg, bg) => {
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(RING_PAIRS)('focus ring --%s on --%s is at least 3:1', (fg, bg) => {
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
    });
  });
});
