// Chat-lifecycle diagnostics were always-on console.log noise in production.
// They stay available for debugging stream/restore issues behind an explicit
// build-time flag: NEXT_PUBLIC_DEBUG_CHAT=1 (inlined by Next at build time).
const DEBUG_CHAT = process.env.NEXT_PUBLIC_DEBUG_CHAT === '1';

export function debugLog(...args: unknown[]): void {
  if (DEBUG_CHAT) console.log(...args);
}
