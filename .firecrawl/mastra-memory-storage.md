We use tracking cookies to understand how you use the product and help us improve it. Please accept cookies to help us improve.

Accept cookiesDecline cookies

[Skip to main content](https://mastra.ai/docs/memory/storage#__docusaurus_skipToContent_fallback)

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

  - [Overview](https://mastra.ai/docs/memory/overview)
  - [Storage](https://mastra.ai/docs/memory/storage)
  - [Message History](https://mastra.ai/docs/memory/message-history)
  - [Observational Memory(New)](https://mastra.ai/docs/memory/observational-memory)
  - [Working Memory](https://mastra.ai/docs/memory/working-memory)
  - [Semantic Recall](https://mastra.ai/docs/memory/semantic-recall)
  - [Memory Processors](https://mastra.ai/docs/memory/memory-processors)
- [Workflows](https://mastra.ai/docs/workflows/overview)

- [Streaming](https://mastra.ai/docs/streaming/overview)

- [MCP](https://mastra.ai/docs/mcp/overview)

- [RAG](https://mastra.ai/docs/rag/overview)

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

- Memory
- Storage

Copy markdown

On this page

# Storage

For agents to remember previous interactions, Mastra needs a storage adapter. Use one of the [supported providers](https://mastra.ai/docs/memory/storage#supported-providers) and pass it to your Mastra instance.

src/mastra/index.ts

```typescript
import { Mastra } from '@mastra/core'
import { LibSQLStore } from '@mastra/libsql'

export const mastra = new Mastra({
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),
})
```

Sharing the database with Mastra Studio

When running `mastra dev` alongside your application (e.g., Next.js), use an absolute path to ensure both processes access the same database:

```typescript
url: 'file:/absolute/path/to/your/project/mastra.db'
```

Relative paths like `file:./mastra.db` resolve based on each process's working directory, which may differ.

This configures instance-level storage, which all agents share by default. You can also configure [agent-level storage](https://mastra.ai/docs/memory/storage#agent-level-storage) for isolated data boundaries.

Mastra automatically initializes the necessary storage structures on first interaction. See [Storage Overview](https://mastra.ai/reference/storage/overview) for domain coverage and the schema used by the built-in database-backed domains.

## Supported providers [Direct link to Supported providers](https://mastra.ai/docs/memory/storage\#supported-providers "Direct link to Supported providers")

Each provider page includes installation instructions, configuration parameters, and usage examples:

- [libSQL](https://mastra.ai/reference/storage/libsql)
- [PostgreSQL](https://mastra.ai/reference/storage/postgresql)
- [MongoDB](https://mastra.ai/reference/storage/mongodb)
- [Upstash](https://mastra.ai/reference/storage/upstash)
- [Cloudflare D1](https://mastra.ai/reference/storage/cloudflare-d1)
- [Cloudflare KV & Durable Objects](https://mastra.ai/reference/storage/cloudflare)
- [Convex](https://mastra.ai/reference/storage/convex)
- [DynamoDB](https://mastra.ai/reference/storage/dynamodb)
- [LanceDB](https://mastra.ai/reference/storage/lance)
- [Microsoft SQL Server](https://mastra.ai/reference/storage/mssql)

tip

libSQL is the easiest way to get started because it doesn’t require running a separate database server.

## Configuration scope [Direct link to Configuration scope](https://mastra.ai/docs/memory/storage\#configuration-scope "Direct link to Configuration scope")

Storage can be configured at the instance level (shared by all agents) or at the agent level (isolated to a specific agent).

### Instance-level storage [Direct link to Instance-level storage](https://mastra.ai/docs/memory/storage\#instance-level-storage "Direct link to Instance-level storage")

Add storage to your Mastra instance so all agents, workflows, observability traces, and scores share the same storage backend:

src/mastra/index.ts

```typescript
import { Mastra } from '@mastra/core'
import { PostgresStore } from '@mastra/pg'

export const mastra = new Mastra({
  storage: new PostgresStore({
    id: 'mastra-storage',
    connectionString: process.env.DATABASE_URL,
  }),
})

// Both agents inherit storage from the Mastra instance above
const agent1 = new Agent({ id: 'agent-1', memory: new Memory() })
const agent2 = new Agent({ id: 'agent-2', memory: new Memory() })
```

This is useful when all primitives share the same storage backend and have similar performance, scaling, and operational requirements.

#### Composite storage [Direct link to Composite storage](https://mastra.ai/docs/memory/storage\#composite-storage "Direct link to Composite storage")

[Composite storage](https://mastra.ai/reference/storage/composite) is an alternative way to configure instance-level storage. Use `MastraCompositeStore` to route `memory` and any other [supported domains](https://mastra.ai/reference/storage/composite#storage-domains) to different storage providers.

src/mastra/index.ts

```typescript
import { Mastra } from '@mastra/core'
import { MastraCompositeStore } from '@mastra/core/storage'
import { MemoryLibSQL } from '@mastra/libsql'
import { WorkflowsPG } from '@mastra/pg'
import { ObservabilityStorageClickhouse } from '@mastra/clickhouse'

export const mastra = new Mastra({
  storage: new MastraCompositeStore({
    id: 'composite',
    domains: {
      memory: new MemoryLibSQL({ url: 'file:./memory.db' }),
      workflows: new WorkflowsPG({ connectionString: process.env.DATABASE_URL }),
      observability: new ObservabilityStorageClickhouse({
        url: process.env.CLICKHOUSE_URL,
        username: process.env.CLICKHOUSE_USERNAME,
        password: process.env.CLICKHOUSE_PASSWORD,
      }),
    },
  }),
})
```

This is useful when different types of data have different performance or operational requirements, such as low-latency storage for memory, durable storage for workflows, and high-throughput storage for observability.

### Agent-level storage [Direct link to Agent-level storage](https://mastra.ai/docs/memory/storage\#agent-level-storage "Direct link to Agent-level storage")

Agent-level storage overrides storage configured at the instance level. Add storage to a specific agent when you need to keep data separate or use different providers per agent.

src/mastra/agents/your-agent.ts

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { PostgresStore } from '@mastra/pg'

export const agent = new Agent({
  id: 'agent',
  memory: new Memory({
    storage: new PostgresStore({
      id: 'agent-storage',
      connectionString: process.env.AGENT_DATABASE_URL,
    }),
  }),
})
```

warning

Agent-level storage isn't supported when using [Mastra Cloud Store](https://mastra.ai/docs/mastra-cloud/deployment#using-mastra-cloud-store). If you use Mastra Cloud Store, configure storage on the Mastra instance instead. This limitation doesn't apply if you bring your own database.

## Threads and resources [Direct link to Threads and resources](https://mastra.ai/docs/memory/storage\#threads-and-resources "Direct link to Threads and resources")

Mastra organizes conversations using two identifiers:

- **Thread**: A conversation session containing a sequence of messages.
- **Resource**: The entity that owns the thread, such as a user, organization, project, or any other domain entity in your application.

Both identifiers are required for agents to store information:

- Generate
- Stream

```typescript
const response = await agent.generate('hello', {
  memory: {
    thread: 'conversation-abc-123',
    resource: 'user_123',
  },
})
```

```typescript
const stream = await agent.stream('hello', {
  memory: {
    thread: 'conversation-abc-123',
    resource: 'user_123',
  },
})
```

note

[Studio](https://mastra.ai/docs/getting-started/studio) automatically generates a thread and resource ID for you. When calling `stream()` or `generate()` yourself, remember to provide these identifiers explicitly.

### Thread title generation [Direct link to Thread title generation](https://mastra.ai/docs/memory/storage\#thread-title-generation "Direct link to Thread title generation")

Mastra can automatically generate descriptive thread titles based on the user's first message when `generateTitle` is enabled.

Use this option when implementing a ChatGPT-style chat interface to render a title alongside each thread in the conversation list (for example, in a sidebar) derived from the thread’s initial user message.

src/mastra/agents/my-agent.ts

```typescript
export const agent = new Agent({
  id: 'agent',
  memory: new Memory({
    options: {
      generateTitle: true,
    },
  }),
})
```

Title generation runs asynchronously after the agent responds and doesn't affect response time.

To optimize cost or behavior, provide a smaller [`model`](https://mastra.ai/models) and custom `instructions`:

src/mastra/agents/my-agent.ts

```typescript
export const agent = new Agent({
  id: 'agent',
  memory: new Memory({
    options: {
      generateTitle: {
        model: 'openai/gpt-5-mini',
        instructions: 'Generate a 1 word title',
      },
    },
  }),
})
```

## Semantic recall [Direct link to Semantic recall](https://mastra.ai/docs/memory/storage\#semantic-recall "Direct link to Semantic recall")

Semantic recall has different storage requirements - it needs a vector database in addition to the standard storage adapter. See [Semantic recall](https://mastra.ai/docs/memory/semantic-recall) for setup and supported vector providers.

## Handling large attachments [Direct link to Handling large attachments](https://mastra.ai/docs/memory/storage\#handling-large-attachments "Direct link to Handling large attachments")

Some storage providers enforce record size limits that base64-encoded file attachments (such as images) can exceed:

| Provider | Record size limit |
| --- | --- |
| [DynamoDB](https://mastra.ai/reference/storage/dynamodb) | 400 KB |
| [Convex](https://mastra.ai/reference/storage/convex) | 1 MiB |
| [Cloudflare D1](https://mastra.ai/reference/storage/cloudflare-d1) | 1 MiB |

PostgreSQL, MongoDB, and libSQL have higher limits and are generally unaffected.

To avoid this, use an input processor to upload attachments to external storage (S3, R2, GCS, [Convex file storage](https://docs.convex.dev/file-storage), etc.) and replace them with URL references before persistence.

src/mastra/processors/attachment-uploader.ts

```typescript
import type { Processor } from '@mastra/core/processors'
import type { MastraDBMessage } from '@mastra/core/memory'

export class AttachmentUploader implements Processor {
  id = 'attachment-uploader'

  async processInput({ messages }: { messages: MastraDBMessage[] }) {
    return Promise.all(messages.map(msg => this.processMessage(msg)))
  }

  async processMessage(msg: MastraDBMessage) {
    const attachments = msg.content.experimental_attachments
    if (!attachments?.length) return msg

    const uploaded = await Promise.all(
      attachments.map(async att => {
        // Skip if already a URL
        if (!att.url?.startsWith('data:')) return att

        // Upload base64 data and replace with URL
        const url = await this.upload(att.url, att.contentType)
        return { ...att, url }
      }),
    )

    return { ...msg, content: { ...msg.content, experimental_attachments: uploaded } }
  }

  async upload(dataUri: string, contentType?: string): Promise<string> {
    const base64 = dataUri.split(',')[1]
    const buffer = Buffer.from(base64, 'base64')

    // Replace with your storage provider (S3, R2, GCS, Convex, etc.)
    // return await s3.upload(buffer, contentType);
    throw new Error('Implement upload() with your storage provider')
  }
}
```

Use the processor with your agent:

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { AttachmentUploader } from './processors/attachment-uploader'

const agent = new Agent({
  id: 'my-agent',
  memory: new Memory({ storage: yourStorage }),
  inputProcessors: [new AttachmentUploader()],
})
```

[Edit this page on GitHub](https://github.com/mastra-ai/mastra/tree/main/docs/src/content/en/docs/memory/storage.mdx) [llms.txt](https://mastra.ai/docs/memory/storage/llms.txt)

[Previous\\
\\
Overview](https://mastra.ai/docs/memory/overview) [Next\\
\\
Message History](https://mastra.ai/docs/memory/message-history)

On this page

- [Supported providers](https://mastra.ai/docs/memory/storage#supported-providers)
- [Configuration scope](https://mastra.ai/docs/memory/storage#configuration-scope)
  - [Instance-level storage](https://mastra.ai/docs/memory/storage#instance-level-storage)
  - [Agent-level storage](https://mastra.ai/docs/memory/storage#agent-level-storage)
- [Threads and resources](https://mastra.ai/docs/memory/storage#threads-and-resources)
  - [Thread title generation](https://mastra.ai/docs/memory/storage#thread-title-generation)
- [Semantic recall](https://mastra.ai/docs/memory/storage#semantic-recall)
- [Handling large attachments](https://mastra.ai/docs/memory/storage#handling-large-attachments)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)

protected by **reCAPTCHA**

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)