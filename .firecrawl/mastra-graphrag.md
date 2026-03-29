[Skip to main content](https://mastra.ai/docs/rag/graph-rag#__docusaurus_skipToContent_fallback)

[mastra.ai, Back to docs homepage](https://mastra.ai/docs)

[Docs](https://mastra.ai/docs) [Models](https://mastra.ai/models) [Guides](https://mastra.ai/guides) [Reference](https://mastra.ai/reference) [Learnnew](https://mastra.ai/learn)

[GitHub repository](https://github.com/mastra-ai/mastra)

Search documentation
`CTRL + K`

Ask AI

Open main menu

Latest Version

- [Get Started](https://mastra.ai/docs/)
- [Fundamentals](https://mastra.ai/docs/getting-started/studio)

  - [Studio](https://mastra.ai/docs/getting-started/studio)
  - [Project Structure](https://mastra.ai/docs/getting-started/project-structure)
  - [Manual Install](https://mastra.ai/docs/getting-started/manual-install)
  - [Build with AI](https://mastra.ai/docs/getting-started/build-with-ai)
- [Agents](https://mastra.ai/docs/agents/overview)

- [Memory](https://mastra.ai/docs/memory/overview)

- [Workflows](https://mastra.ai/docs/workflows/overview)

- [Streaming](https://mastra.ai/docs/streaming/overview)

- [MCP](https://mastra.ai/docs/mcp/overview)

- [RAG](https://mastra.ai/docs/rag/overview)

  - [Overview](https://mastra.ai/docs/rag/overview)
  - [Chunking and Embedding](https://mastra.ai/docs/rag/chunking-and-embedding)
  - [Vector Databases](https://mastra.ai/docs/rag/vector-databases)
  - [Retrieval](https://mastra.ai/docs/rag/retrieval)
  - [GraphRAG](https://mastra.ai/docs/rag/graph-rag)
- [Workspaces(New)](https://mastra.ai/docs/workspace/overview)

- [Server](https://mastra.ai/docs/server/mastra-server)

- [Deployment](https://mastra.ai/docs/deployment/overview)

- [Mastra Cloud(Beta)](https://mastra.ai/docs/mastra-cloud/overview)

- [Observability](https://mastra.ai/docs/observability/overview)

- [Evals](https://mastra.ai/docs/evals/overview)

- [Voice](https://mastra.ai/docs/voice/overview)

- [Build with AI](https://mastra.ai/docs/build-with-ai/skills)

- [Community](https://mastra.ai/docs/community/contributing-templates)


system mode

- RAG
- GraphRAG

Copy markdown

On this page

# GraphRAG

Graph-based retrieval enhances traditional vector search by following relationships between chunks of information. This approach is useful when information is spread across multiple documents or when documents reference each other.

## When to use GraphRAG [Direct link to When to use GraphRAG](https://mastra.ai/docs/rag/graph-rag\#when-to-use-graphrag "Direct link to When to use GraphRAG")

GraphRAG is particularly effective when:

- Information is spread across multiple documents
- Documents reference each other
- You need to traverse relationships to find complete answers
- Understanding connections between concepts is important
- Simple vector similarity misses important contextual relationships

For straightforward semantic search without relationship traversal, use [standard retrieval methods](https://mastra.ai/docs/rag/retrieval).

## How GraphRAG works [Direct link to How GraphRAG works](https://mastra.ai/docs/rag/graph-rag\#how-graphrag-works "Direct link to How GraphRAG works")

GraphRAG combines vector similarity with knowledge graph traversal:

1. Initial vector search retrieves relevant chunks based on semantic similarity
2. A knowledge graph is constructed from the retrieved chunks
3. The graph is traversed to find connected information
4. Results include both directly relevant chunks and related content

This process helps surface information that might not be semantically similar to the query but is contextually relevant through connections.

## Creating a graph query tool [Direct link to Creating a graph query tool](https://mastra.ai/docs/rag/graph-rag\#creating-a-graph-query-tool "Direct link to Creating a graph query tool")

The Graph Query Tool provides agents with the ability to perform graph-based retrieval:

```ts
import { createGraphRAGTool } from '@mastra/rag'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'

const graphQueryTool = createGraphRAGTool({
  vectorStoreName: 'pgVector',
  indexName: 'embeddings',
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
  graphOptions: {
    threshold: 0.7,
  },
})
```

### Configuration options [Direct link to Configuration options](https://mastra.ai/docs/rag/graph-rag\#configuration-options "Direct link to Configuration options")

The `graphOptions` parameter controls how the knowledge graph is built and traversed:

- `threshold`: Similarity threshold (0-1) for determining which chunks are related. Higher values create sparser graphs with stronger connections; lower values create denser graphs with more potential relationships.
- `dimension`: Vector embedding dimension. Must match the embedding model's output dimension (e.g., 1536 for OpenAI's text-embedding-3-small).

```ts
const graphQueryTool = createGraphRAGTool({
  vectorStoreName: 'pgVector',
  indexName: 'embeddings',
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
  graphOptions: {
    dimension: 1536,
    threshold: 0.7,
  },
})
```

## Using GraphRAG with agents [Direct link to Using GraphRAG with agents](https://mastra.ai/docs/rag/graph-rag\#using-graphrag-with-agents "Direct link to Using GraphRAG with agents")

Integrate the graph query tool with an agent to enable graph-based retrieval:

```ts
import { Agent } from '@mastra/core/agent'

const ragAgent = new Agent({
  id: 'rag-agent',
  name: 'GraphRAG Agent',
  instructions: `You are a helpful assistant that answers questions based on the provided context.
When answering questions, use the graph query tool to find relevant information and relationships.
Base your answers on the context provided by the tool, and clearly state if the context doesn't contain enough information.`,
  model: 'openai/gpt-5.4',
  tools: {
    graphQueryTool,
  },
})
```

## Document processing and storage [Direct link to Document processing and storage](https://mastra.ai/docs/rag/graph-rag\#document-processing-and-storage "Direct link to Document processing and storage")

Before using graph-based retrieval, process documents into chunks and store their embeddings:

```ts
import { MDocument } from '@mastra/rag'
import { embedMany } from 'ai'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'

// Create and chunk document
const doc = MDocument.fromText('Your document content here...')

const chunks = await doc.chunk({
  strategy: 'recursive',
  size: 512,
  overlap: 50,
  separator: '\n',
})

// Generate embeddings
const { embeddings } = await embedMany({
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
  values: chunks.map(chunk => chunk.text),
})

// Store in vector database
const vectorStore = mastra.getVector('pgVector')
await vectorStore.createIndex({
  indexName: 'embeddings',
  dimension: 1536,
})
await vectorStore.upsert({
  indexName: 'embeddings',
  vectors: embeddings,
  metadata: chunks?.map(chunk => ({ text: chunk.text })),
})
```

## Querying with GraphRAG [Direct link to Querying with GraphRAG](https://mastra.ai/docs/rag/graph-rag\#querying-with-graphrag "Direct link to Querying with GraphRAG")

Once configured, the agent can perform graph-based queries:

```ts
const query = 'What are the effects of infrastructure changes on local businesses?'
const response = await ragAgent.generate(query)
console.log(response.text)
```

The agent uses the graph query tool to:

1. Convert the query to an embedding
2. Find semantically similar chunks in the vector store
3. Build a knowledge graph from related chunks
4. Traverse the graph to find connected information
5. Return comprehensive context for generating the response

## Choosing the right threshold [Direct link to Choosing the right threshold](https://mastra.ai/docs/rag/graph-rag\#choosing-the-right-threshold "Direct link to Choosing the right threshold")

The threshold parameter significantly impacts retrieval quality:

- **High threshold (0.8-0.9)**: Strict connections, fewer relationships, more precise but potentially incomplete results
- **Medium threshold (0.6-0.8)**: Balanced approach, good for most use cases
- **Low threshold (0.4-0.6)**: More connections, broader context, risk of including less relevant information

Start with 0.7 and adjust based on your specific use case:

```ts
// Strict connections for precise answers
const strictGraphTool = createGraphRAGTool({
  vectorStoreName: 'pgVector',
  indexName: 'embeddings',
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
  graphOptions: {
    threshold: 0.85,
  },
})

// Broader connections for exploratory queries
const broadGraphTool = createGraphRAGTool({
  vectorStoreName: 'pgVector',
  indexName: 'embeddings',
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
  graphOptions: {
    threshold: 0.5,
  },
})
```

## Combining with other retrieval methods [Direct link to Combining with other retrieval methods](https://mastra.ai/docs/rag/graph-rag\#combining-with-other-retrieval-methods "Direct link to Combining with other retrieval methods")

GraphRAG can be used alongside other retrieval approaches:

```ts
import { createVectorQueryTool } from '@mastra/rag'

const vectorQueryTool = createVectorQueryTool({
  vectorStoreName: 'pgVector',
  indexName: 'embeddings',
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
})

const graphQueryTool = createGraphRAGTool({
  vectorStoreName: 'pgVector',
  indexName: 'embeddings',
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
  graphOptions: {
    threshold: 0.7,
  },
})

const agent = new Agent({
  id: 'rag-agent',
  name: 'RAG Agent',
  instructions: `Use vector search for simple fact-finding queries.
Use graph search when you need to understand relationships or find connected information.`,
  model: 'openai/gpt-5.4',
  tools: {
    vectorQueryTool,
    graphQueryTool,
  },
})
```

This gives the agent flexibility to choose the appropriate retrieval method based on the query.

## Reference [Direct link to Reference](https://mastra.ai/docs/rag/graph-rag\#reference "Direct link to Reference")

For detailed API documentation, see:

- [GraphRAG Class](https://mastra.ai/reference/rag/graph-rag)
- [createGraphRAGTool()](https://mastra.ai/reference/tools/graph-rag-tool)

[Edit this page on GitHub](https://github.com/mastra-ai/mastra/tree/main/docs/src/content/en/docs/rag/graph-rag.mdx) [llms.txt](https://mastra.ai/docs/rag/graph-rag/llms.txt)

[Previous\\
\\
Retrieval](https://mastra.ai/docs/rag/retrieval) [Next\\
\\
Overview](https://mastra.ai/docs/workspace/overview)

On this page

- [When to use GraphRAG](https://mastra.ai/docs/rag/graph-rag#when-to-use-graphrag)
- [How GraphRAG works](https://mastra.ai/docs/rag/graph-rag#how-graphrag-works)
- [Creating a graph query tool](https://mastra.ai/docs/rag/graph-rag#creating-a-graph-query-tool)
  - [Configuration options](https://mastra.ai/docs/rag/graph-rag#configuration-options)
- [Using GraphRAG with agents](https://mastra.ai/docs/rag/graph-rag#using-graphrag-with-agents)
- [Document processing and storage](https://mastra.ai/docs/rag/graph-rag#document-processing-and-storage)
- [Querying with GraphRAG](https://mastra.ai/docs/rag/graph-rag#querying-with-graphrag)
- [Choosing the right threshold](https://mastra.ai/docs/rag/graph-rag#choosing-the-right-threshold)
- [Combining with other retrieval methods](https://mastra.ai/docs/rag/graph-rag#combining-with-other-retrieval-methods)
- [Reference](https://mastra.ai/docs/rag/graph-rag#reference)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)

protected by **reCAPTCHA**

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)