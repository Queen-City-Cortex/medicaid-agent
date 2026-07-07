// Typed process.env accessors — the single home for env parsing idioms that
// were previously re-implemented per module. All helpers read process.env at
// CALL time, so each call site keeps its original evaluation timing:
// module-scope consts stay eager, config functions like the verifier's
// getConfig() stay lazy.

/** Returns process.env[name] if set and non-empty; otherwise fallback.
 *  Note: an explicitly set empty string ("") is treated as unset — `||`, not
 *  `??` — matching every original call site this helper replaced. */
export function strEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Unset → fallback; otherwise only '1'/'true' count as true. */
export function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === '1' || raw === 'true';
}

/** The verifier kill-switch, read in three places. Deliberately NOT boolEnv
 *  semantics: the verifier is on unless VERIFIER_ENABLED is exactly 'false'
 *  (so '0' or garbage still means enabled). */
export function isVerifierEnabled(): boolean {
  return process.env.VERIFIER_ENABLED !== 'false';
}
