import { Memory } from '@mastra/memory';
import type { LibSQLStore } from '@mastra/libsql';

type MemoryOptions = NonNullable<NonNullable<ConstructorParameters<typeof Memory>[0]>['options']>;
type ObservationOptions = Exclude<NonNullable<MemoryOptions['observationalMemory']>, boolean>;

/** Keep production and HTTP regression tests on the same memory configuration. */
export async function createChatMemory(storage: LibSQLStore, {
  observationalMemoryEnabled = true,
  observation = {},
  generateTitle,
}: {
  observationalMemoryEnabled?: boolean;
  observation?: ObservationOptions;
  generateTitle?: MemoryOptions['generateTitle'];
} = {}): Promise<Memory> {
  if (observationalMemoryEnabled) {
    const store = await storage.getStore('memory');
    if (typeof store?.patchThread !== 'function') {
      throw new Error('Observational memory requires a storage adapter with patchThread; check the coordinated Mastra core/storage versions.');
    }
  }
  return new Memory({
    storage,
    options: {
      ...(generateTitle !== undefined ? { generateTitle } : {}),
      ...(observationalMemoryEnabled ? { observationalMemory: { model: 'openai/gpt-5.4-mini', ...observation } } : {}),
      // Profile writes precede verification; only guarded observations may be recalled.
      workingMemory: { enabled: false },
    },
  });
}
