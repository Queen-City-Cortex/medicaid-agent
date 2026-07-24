export interface BatchFailure<T> {
  item: T;
  error: unknown;
}

export async function runSettledBatches<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<{ values: R[]; failures: BatchFailure<T>[] }> {
  const values: R[] = [];
  const failures: BatchFailure<T>[] = [];
  for (let index = 0; index < items.length; index += limit) {
    const batch = items.slice(index, index + limit);
    const settled = await Promise.allSettled(batch.map(work));
    settled.forEach((result, batchIndex) => {
      const item = batch[batchIndex];
      if (item === undefined) return;
      if (result.status === 'fulfilled') values.push(result.value);
      else failures.push({ item, error: result.reason });
    });
  }
  return { values, failures };
}

export function isSystemicWorkerError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(?:401|403|429|5\d\d)\b|unauthori[sz]ed|authentication|api[-_ ]?key|invalid.*credential|rate.?limit|quota|provider.*unavailable/i
    .test(message);
}

export function workerFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').slice(0, 500) || 'Research worker failed';
}
