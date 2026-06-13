// Shared setup for the real-Neo4j integration suites. The vector indexes the
// retrieval tools depend on must exist before the tests run.
//
// `CREATE VECTOR INDEX ... IF NOT EXISTS` is NOT race-safe: when the
// integration test files run in parallel (vitest's default) they each issue
// the same CREATE concurrently, and Neo4j can reject the loser with
// `EquivalentSchemaRuleAlreadyExists` while the index is mid-creation. Slower
// CI runners happened to serialize enough to hide this; faster runners
// (Blacksmith) surface it. The index existing is exactly the desired
// postcondition, so that specific error is tolerated.

type RunFn = (query: string, params?: Record<string, unknown>) => Promise<unknown>;

const VECTOR_INDEXES = [
  `CREATE VECTOR INDEX section_embeddings IF NOT EXISTS
   FOR (s:Section) ON (s.embedding)
   OPTIONS {
     indexConfig: {
       \`vector.dimensions\`: 1024,
       \`vector.similarity_function\`: 'cosine'
     }
   }`,
  `CREATE VECTOR INDEX chunk_embeddings IF NOT EXISTS
   FOR (ch:Chunk) ON (ch.embedding)
   OPTIONS {
     indexConfig: {
       \`vector.dimensions\`: 1024,
       \`vector.similarity_function\`: 'cosine'
     }
   }`,
];

async function createIndexTolerant(run: RunFn, query: string): Promise<void> {
  try {
    await run(query);
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    if (!code.includes('EquivalentSchemaRuleAlreadyExists')) throw err;
  }
}

export async function ensureIntegrationIndexes(run: RunFn): Promise<void> {
  for (const query of VECTOR_INDEXES) {
    await createIndexTolerant(run, query);
  }
  await run('CALL db.awaitIndexes()');
}
