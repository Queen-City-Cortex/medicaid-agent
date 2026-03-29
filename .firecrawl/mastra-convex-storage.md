We use tracking cookies to understand how you use the product and help us improve it. Please accept cookies to help us improve.

Accept cookiesDecline cookies

[Skip to main content](https://mastra.ai/reference/storage/convex#__docusaurus_skipToContent_fallback)

[mastra.ai, Back to docs homepage](https://mastra.ai/docs)

[Docs](https://mastra.ai/docs) [Models](https://mastra.ai/models) [Guides](https://mastra.ai/guides) [Reference](https://mastra.ai/reference) [Learnnew](https://mastra.ai/learn)

[GitHub repository](https://github.com/mastra-ai/mastra)

Search documentation
`CTRL + K`

Ask AI

Open main menu

Latest Version

- [Overview](https://mastra.ai/reference/)
- [Configuration](https://mastra.ai/reference/configuration)
- [Agents](https://mastra.ai/reference/agents/agent)

- [AI SDK](https://mastra.ai/reference/ai-sdk/chat-route)

- [Auth](https://mastra.ai/reference/auth/auth0)

- [CLI](https://mastra.ai/reference/cli/create-mastra)

- [Client SDK](https://mastra.ai/reference/client-js/agents)

- [Core](https://mastra.ai/reference/core/mastra-class)

- [Deployer](https://mastra.ai/reference/deployer/cloudflare)

- [Evals](https://mastra.ai/reference/evals/answer-relevancy)

- [Harness](https://mastra.ai/reference/harness/harness-class)

- [Memory](https://mastra.ai/reference/memory/clone-utilities)

- [Observability](https://mastra.ai/reference/datasets/dataset)

- [Processors](https://mastra.ai/reference/processors/batch-parts-processor)

- [RAG](https://mastra.ai/reference/rag/database-config)

- [Server](https://mastra.ai/reference/server/create-route)

- [Storage](https://mastra.ai/reference/storage/overview)

  - [Overview](https://mastra.ai/reference/storage/overview)
  - [Cloudflare D1 Storage](https://mastra.ai/reference/storage/cloudflare-d1)
  - [Cloudflare KV Storage](https://mastra.ai/reference/storage/cloudflare)
  - [Composite Storage](https://mastra.ai/reference/storage/composite)
  - [Convex Storage](https://mastra.ai/reference/storage/convex)
  - [DynamoDB Storage](https://mastra.ai/reference/storage/dynamodb)
  - [LanceDB Storage](https://mastra.ai/reference/storage/lance)
  - [libSQL Storage](https://mastra.ai/reference/storage/libsql)
  - [MongoDB Storage](https://mastra.ai/reference/storage/mongodb)
  - [MSSQL Storage](https://mastra.ai/reference/storage/mssql)
  - [PostgreSQL Storage](https://mastra.ai/reference/storage/postgresql)
  - [Upstash Storage](https://mastra.ai/reference/storage/upstash)
- [Streaming](https://mastra.ai/reference/streaming/ChunkType)

- [Templates](https://mastra.ai/reference/templates/overview)

- [Tools & MCP](https://mastra.ai/reference/tools/document-chunker-tool)

- [Vectors](https://mastra.ai/reference/vectors/s3vectors)

- [Voice](https://mastra.ai/reference/voice/azure)

- [Workflows](https://mastra.ai/reference/workflows/run)

- [Workspaces](https://mastra.ai/reference/workspace/agentfs-filesystem)


system mode

- Storage
- Convex Storage

Copy markdown

On this page

# Convex storage

The Convex storage implementation provides a serverless storage solution using [Convex](https://convex.dev/), a full-stack TypeScript development platform with real-time sync and automatic caching.

Observability Not Supported

Convex storage **doesn't support the observability domain**. Traces from the `DefaultExporter` can't be persisted to Convex, and Mastra Studio's observability features won't work with Convex as your only storage provider. To enable observability, use [composite storage](https://mastra.ai/reference/storage/composite#specialized-storage-for-observability) to route observability data to a supported provider like ClickHouse or PostgreSQL.

Record Size Limit

Convex enforces a **1 MiB maximum record size**. This limit can be exceeded when storing messages with base64-encoded attachments such as images. See [Handling large attachments](https://mastra.ai/docs/memory/storage#handling-large-attachments) for workarounds including uploading attachments to external storage like S3, Cloudflare R2, or [Convex file storage](https://docs.convex.dev/file-storage).

## Installation [Direct link to Installation](https://mastra.ai/reference/storage/convex\#installation "Direct link to Installation")

- npm
- pnpm
- Yarn
- Bun

```bash
npm install @mastra/convex@latest
```

```bash
pnpm add @mastra/convex@latest
```

```bash
yarn add @mastra/convex@latest
```

```bash
bun add @mastra/convex@latest
```

## Convex setup [Direct link to Convex setup](https://mastra.ai/reference/storage/convex\#convex-setup "Direct link to Convex setup")

Before using `ConvexStore`, you need to set up the Convex schema and storage handler in your Convex project.

### 1\. Set up Convex Schema [Direct link to 1. Set up Convex Schema](https://mastra.ai/reference/storage/convex\#1-set-up-convex-schema "Direct link to 1. Set up Convex Schema")

In `convex/schema.ts`:

```typescript
import { defineSchema } from 'convex/server'
import {
  mastraThreadsTable,
  mastraMessagesTable,
  mastraResourcesTable,
  mastraWorkflowSnapshotsTable,
  mastraScoresTable,
  mastraVectorIndexesTable,
  mastraVectorsTable,
  mastraDocumentsTable,
} from '@mastra/convex/schema'

export default defineSchema({
  mastra_threads: mastraThreadsTable,
  mastra_messages: mastraMessagesTable,
  mastra_resources: mastraResourcesTable,
  mastra_workflow_snapshots: mastraWorkflowSnapshotsTable,
  mastra_scorers: mastraScoresTable,
  mastra_vector_indexes: mastraVectorIndexesTable,
  mastra_vectors: mastraVectorsTable,
  mastra_documents: mastraDocumentsTable,
})
```

### 2\. Create the Storage Handler [Direct link to 2. Create the Storage Handler](https://mastra.ai/reference/storage/convex\#2-create-the-storage-handler "Direct link to 2. Create the Storage Handler")

In `convex/mastra/storage.ts`:

```typescript
import { mastraStorage } from '@mastra/convex/server'

export const handle = mastraStorage
```

### 3\. Deploy to Convex [Direct link to 3. Deploy to Convex](https://mastra.ai/reference/storage/convex\#3-deploy-to-convex "Direct link to 3. Deploy to Convex")

```bash
npx convex dev
# or for production
npx convex deploy
```

## Usage [Direct link to Usage](https://mastra.ai/reference/storage/convex\#usage "Direct link to Usage")

```typescript
import { ConvexStore } from '@mastra/convex'

const storage = new ConvexStore({
  id: 'convex-storage',
  deploymentUrl: process.env.CONVEX_URL!,
  adminAuthToken: process.env.CONVEX_ADMIN_KEY!,
})
```

## Parameters [Direct link to Parameters](https://mastra.ai/reference/storage/convex\#parameters "Direct link to Parameters")

### deploymentUrl:

string

Convex deployment URL (e.g., https://your-project.convex.cloud)

### adminAuthToken:

string

Convex admin authentication token for backend access

### storageFunction?:

string

= mastra/storage:handle

Path to the storage mutation function (default: 'mastra/storage:handle')

## Constructor examples [Direct link to Constructor examples](https://mastra.ai/reference/storage/convex\#constructor-examples "Direct link to Constructor examples")

```ts
import { ConvexStore } from '@mastra/convex'

// Basic configuration
const store = new ConvexStore({
  id: 'convex-storage',
  deploymentUrl: 'https://your-project.convex.cloud',
  adminAuthToken: 'your-admin-token',
})

// With custom storage function path
const storeCustom = new ConvexStore({
  id: 'convex-storage',
  deploymentUrl: 'https://your-project.convex.cloud',
  adminAuthToken: 'your-admin-token',
  storageFunction: 'custom/path:handler',
})
```

## Additional notes [Direct link to Additional notes](https://mastra.ai/reference/storage/convex\#additional-notes "Direct link to Additional notes")

### Schema Management [Direct link to Schema Management](https://mastra.ai/reference/storage/convex\#schema-management "Direct link to Schema Management")

The storage implementation uses typed Convex tables for each Mastra domain:

| Domain | Convex Table | Purpose |
| --- | --- | --- |
| Threads | `mastra_threads` | Conversation threads |
| Messages | `mastra_messages` | Chat messages |
| Resources | `mastra_resources` | User working memory |
| Workflows | `mastra_workflow_snapshots` | Workflow state |
| Scorers | `mastra_scorers` | Evaluation data |
| Fallback | `mastra_documents` | Unknown tables |

### Architecture [Direct link to Architecture](https://mastra.ai/reference/storage/convex\#architecture "Direct link to Architecture")

All typed tables include:

- An `id` field for Mastra's record ID (distinct from Convex's auto-generated `_id`)
- A `by_record_id` index for efficient lookups by Mastra ID

This design ensures compatibility with Mastra's storage contract while leveraging Convex's automatic indexing and real-time capabilities.

### Environment variables [Direct link to Environment variables](https://mastra.ai/reference/storage/convex\#environment-variables "Direct link to Environment variables")

Set these environment variables for your deployment:

- `CONVEX_URL` – Your Convex deployment URL
- `CONVEX_ADMIN_KEY` – Admin authentication token (get from Convex dashboard)

## Related [Direct link to Related](https://mastra.ai/reference/storage/convex\#related "Direct link to Related")

- [Convex Vector Store](https://mastra.ai/reference/vectors/convex)
- [Convex Documentation](https://docs.convex.dev/)

[Edit this page on GitHub](https://github.com/mastra-ai/mastra/tree/main/docs/src/content/en/reference/storage/convex.mdx) [llms.txt](https://mastra.ai/reference/storage/convex/llms.txt)

[Previous\\
\\
Composite Storage](https://mastra.ai/reference/storage/composite) [Next\\
\\
DynamoDB Storage](https://mastra.ai/reference/storage/dynamodb)

On this page

- [Installation](https://mastra.ai/reference/storage/convex#installation)
- [Convex setup](https://mastra.ai/reference/storage/convex#convex-setup)
  - [1\. Set up Convex Schema](https://mastra.ai/reference/storage/convex#1-set-up-convex-schema)
  - [2\. Create the Storage Handler](https://mastra.ai/reference/storage/convex#2-create-the-storage-handler)
  - [3\. Deploy to Convex](https://mastra.ai/reference/storage/convex#3-deploy-to-convex)
- [Usage](https://mastra.ai/reference/storage/convex#usage)
- [Parameters](https://mastra.ai/reference/storage/convex#parameters)
- [Constructor examples](https://mastra.ai/reference/storage/convex#constructor-examples)
- [Additional notes](https://mastra.ai/reference/storage/convex#additional-notes)
  - [Schema Management](https://mastra.ai/reference/storage/convex#schema-management)
  - [Architecture](https://mastra.ai/reference/storage/convex#architecture)
  - [Environment variables](https://mastra.ai/reference/storage/convex#environment-variables)
- [Related](https://mastra.ai/reference/storage/convex#related)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)

protected by **reCAPTCHA**

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)