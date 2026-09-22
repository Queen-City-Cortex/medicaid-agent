export class VerificationWithheldError extends Error {
  constructor(readonly unavailable: boolean) {
    super(unavailable ? 'Verification service unavailable; report withheld' : 'Answer grounding failed; report withheld');
    this.name = 'VerificationWithheldError';
  }
}

export function isRetryableResearchError(error: unknown): boolean {
  if (error instanceof VerificationWithheldError) return error.unavailable;
  const value = error as { status?: number; statusCode?: number; message?: string; cause?: unknown };
  const message = value?.message ?? String(error);
  // A transport error can mention the checkpoint operation it interrupted.
  // Only an incompatible checkpoint is terminal; the word alone is not a cause.
  if (/auth|credential|api.?key|quota|budget|incompatible.*checkpoint|checkpoint.*incompatible|corpus.*chang|grounding|cancel|lease.*lost|401|403/i.test(message)) return false;
  const status = value?.statusCode ?? value?.status;
  if (status === 429 || (status && status >= 500 && status <= 599)) return true;
  if (/timeout|timed out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed|network|rate.?limit|\b429\b|\b5\d\d\b|service unavailable/i.test(message)) return true;
  return value?.cause && value.cause !== error ? isRetryableResearchError(value.cause) : false;
}
