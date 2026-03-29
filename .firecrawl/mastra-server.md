[Skip to main content](https://mastra.ai/docs/server/mastra-server#__docusaurus_skipToContent_fallback)

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

- [Workspaces(New)](https://mastra.ai/docs/workspace/overview)

- [Server](https://mastra.ai/docs/server/mastra-server)

  - [Overview](https://mastra.ai/docs/server/mastra-server)
  - [Server Adapters](https://mastra.ai/docs/server/server-adapters)
  - [Custom Adapters](https://mastra.ai/docs/server/custom-adapters)
  - [Middleware](https://mastra.ai/docs/server/middleware)
  - [Request Context](https://mastra.ai/docs/server/request-context)
  - [Custom API Routes](https://mastra.ai/docs/server/custom-api-routes)
  - [Mastra Client](https://mastra.ai/docs/server/mastra-client)
  - [Auth](https://mastra.ai/docs/server/auth/)
- [Deployment](https://mastra.ai/docs/deployment/overview)

- [Mastra Cloud(Beta)](https://mastra.ai/docs/mastra-cloud/overview)

- [Observability](https://mastra.ai/docs/observability/overview)

- [Evals](https://mastra.ai/docs/evals/overview)

- [Voice](https://mastra.ai/docs/voice/overview)

- [Build with AI](https://mastra.ai/docs/build-with-ai/skills)

- [Community](https://mastra.ai/docs/community/contributing-templates)


system mode

- Server
- Overview

Copy markdown

On this page

# Server overview

Mastra runs as an HTTP server that exposes your agents, workflows, and other functionality as API endpoints. The server handles request routing, middleware execution, authentication, and streaming responses.

info

This page covers the [`server`](https://mastra.ai/reference/configuration#server-options) configuration options passed to the `Mastra` constructor. For running Mastra with your own HTTP server (Hono, Express, etc.), visit [Server Adapters](https://mastra.ai/docs/server/server-adapters).

## Server architecture [Direct link to Server architecture](https://mastra.ai/docs/server/mastra-server\#server-architecture "Direct link to Server architecture")

Mastra uses [Hono](https://hono.dev/) as its underlying HTTP server framework. When you build a Mastra application using `mastra build`, it generates a Hono-based HTTP server in the `.mastra` directory.

The server provides:

- API endpoints for all registered agents and workflows
- Custom API routes and middleware
- Authentication with multiple providers
- Request context for dynamic configuration
- Stream data redaction for secure responses

## Configuration [Direct link to Configuration](https://mastra.ai/docs/server/mastra-server\#configuration "Direct link to Configuration")

Configure the server by passing a `server` object to the `Mastra` constructor:

src/mastra/index.ts

```typescript
import { Mastra } from '@mastra/core'

export const mastra = new Mastra({
  server: {
    port: 3000, // Defaults to PORT env var or 4111
    host: '0.0.0.0', // Defaults to MASTRA_HOST env var or 'localhost'
  },
})
```

info

Visit the [configuration reference](https://mastra.ai/reference/configuration#server-options) for a full list of available server options.

## Server features [Direct link to Server features](https://mastra.ai/docs/server/mastra-server\#server-features "Direct link to Server features")

- **[Middleware](https://mastra.ai/docs/server/middleware)**: Intercept requests for authentication, logging, CORS, or injecting request-specific context.
- **[Custom API Routes](https://mastra.ai/docs/server/custom-api-routes)**: Extend the server with your own HTTP endpoints that have access to the Mastra instance.
- **[Request Context](https://mastra.ai/docs/server/request-context)**: Pass request-specific values to agents, tools, and workflows based on runtime conditions.
- **[Server Adapters](https://mastra.ai/docs/server/server-adapters)**: Run Mastra with Express, Hono, or your own HTTP server instead of the generated server.
- **[Custom Adapters](https://mastra.ai/docs/server/custom-adapters)**: Build adapters for frameworks not officially supported.
- **[Mastra Client SDK](https://mastra.ai/docs/server/mastra-client)**: Type-safe client for calling agents, workflows, and tools from browser or server environments.
- **[Authentication](https://mastra.ai/docs/server/auth)**: Secure endpoints with JWT, Clerk, Supabase, Firebase, Auth0, or WorkOS.

## Stream data redaction [Direct link to Stream data redaction](https://mastra.ai/docs/server/mastra-server\#stream-data-redaction "Direct link to Stream data redaction")

When streaming agent responses, the HTTP layer redacts system prompts, tool definitions, API keys, and similar data from each chunk before sending it to clients. This is enabled by default.

This behavior is only configurable by using [server adapters](https://mastra.ai/docs/server/server-adapters#stream-data-redaction). For server adapters, stream data redaction is enabled by default, too.

## TypeScript configuration [Direct link to TypeScript configuration](https://mastra.ai/docs/server/mastra-server\#typescript-configuration "Direct link to TypeScript configuration")

Mastra requires `module` and `moduleResolution` settings compatible with modern Node.js. Legacy options like `CommonJS` or `node` aren't supported.

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

[Edit this page on GitHub](https://github.com/mastra-ai/mastra/tree/main/docs/src/content/en/docs/server/mastra-server.mdx) [llms.txt](https://mastra.ai/docs/server/mastra-server/llms.txt)

[Previous\\
\\
Search and Indexing](https://mastra.ai/docs/workspace/search) [Next\\
\\
Server Adapters](https://mastra.ai/docs/server/server-adapters)

On this page

- [Server architecture](https://mastra.ai/docs/server/mastra-server#server-architecture)
- [Configuration](https://mastra.ai/docs/server/mastra-server#configuration)
- [Server features](https://mastra.ai/docs/server/mastra-server#server-features)
- [Stream data redaction](https://mastra.ai/docs/server/mastra-server#stream-data-redaction)
- [TypeScript configuration](https://mastra.ai/docs/server/mastra-server#typescript-configuration)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)

protected by **reCAPTCHA**

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)