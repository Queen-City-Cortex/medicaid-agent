We use tracking cookies to understand how you use the product and help us improve it. Please accept cookies to help us improve.

Accept cookiesDecline cookies

[Skip to main content](https://mastra.ai/docs/mcp/overview#__docusaurus_skipToContent_fallback)

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

  - [Overview](https://mastra.ai/docs/mcp/overview)
  - [Publishing an MCP Server](https://mastra.ai/docs/mcp/publishing-mcp-server)
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

- MCP
- Overview

Copy markdown

On this page

# MCP overview

Mastra supports the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction), an open standard for connecting AI agents to external tools and resources. It serves as a universal plugin system, enabling agents to call tools regardless of language or hosting environment.

Mastra can also be used to author MCP servers, exposing agents, tools, and other structured resources via the MCP interface. These can then be accessed by any system or agent that supports the protocol.

Mastra currently supports two MCP classes:

1. `MCPClient`: Connects to one or many MCP servers to access their tools, resources, prompts, and handle elicitation requests.
2. `MCPServer`: Exposes Mastra tools, agents, workflows, prompts, and resources to MCP-compatible clients.

## Get started [Direct link to Get started](https://mastra.ai/docs/mcp/overview\#get-started "Direct link to Get started")

To use MCP, install the required dependency:

- npm
- pnpm
- Yarn
- Bun

```bash
npm install @mastra/mcp@latest
```

```bash
pnpm add @mastra/mcp@latest
```

```bash
yarn add @mastra/mcp@latest
```

```bash
bun add @mastra/mcp@latest
```

## Configuring `MCPClient` [Direct link to configuring-mcpclient](https://mastra.ai/docs/mcp/overview\#configuring-mcpclient "Direct link to configuring-mcpclient")

The `MCPClient` connects Mastra primitives to external MCP servers, which can be local packages (invoked using `npx`) or remote HTTP(S) endpoints. Each server must be configured with either a `command` or a `url`, depending on how it's hosted.

src/mastra/mcp/test-mcp-client.ts

```typescript
import { MCPClient } from '@mastra/mcp'

export const testMcpClient = new MCPClient({
  id: 'test-mcp-client',
  servers: {
    wikipedia: {
      command: 'npx',
      args: ['-y', 'wikipedia-mcp'],
    },
    weather: {
      url: new URL(
        `https://server.smithery.ai/@smithery-ai/national-weather-service/mcp?api_key=${process.env.SMITHERY_API_KEY}`,
      ),
    },
  },
})
```

info

Visit [MCPClient](https://mastra.ai/reference/tools/mcp-client) for a full list of configuration options.

Authentication

For connecting to OAuth-protected MCP servers, see the [OAuth Authentication](https://mastra.ai/reference/tools/mcp-client#oauth-authentication) section.

## Using `MCPClient` with an agent [Direct link to using-mcpclient-with-an-agent](https://mastra.ai/docs/mcp/overview\#using-mcpclient-with-an-agent "Direct link to using-mcpclient-with-an-agent")

To use tools from an MCP server in an agent, import your `MCPClient` and call `.listTools()` in the `tools` parameter. This loads from the defined MCP servers, making them available to the agent.

src/mastra/agents/test-agent.ts

```typescript
import { Agent } from '@mastra/core/agent'
import { testMcpClient } from '../mcp/test-mcp-client'

export const testAgent = new Agent({
  id: 'test-agent',
  name: 'Test Agent',
  description: 'You are a helpful AI assistant',
  instructions: `
      You are a helpful assistant that has access to the following MCP Servers.
      - Wikipedia MCP Server
      - US National Weather Service

      Answer questions using the information you find using the MCP Servers.`,
  model: 'openai/gpt-5.4',
  tools: await testMcpClient.listTools(),
})
```

info

Visit [Agent Class](https://mastra.ai/reference/agents/agent) for a full list of configuration options.

## Configuring `MCPServer` [Direct link to configuring-mcpserver](https://mastra.ai/docs/mcp/overview\#configuring-mcpserver "Direct link to configuring-mcpserver")

To expose agents, tools, and workflows from your Mastra application to external systems over HTTP(S) use the `MCPServer` class. This makes them accessible to any system or agent that supports the protocol.

src/mastra/mcp/test-mcp-server.ts

```typescript
import { MCPServer } from '@mastra/mcp'

import { testAgent } from '../agents/test-agent'
import { testWorkflow } from '../workflows/test-workflow'
import { testTool } from '../tools/test-tool'

export const testMcpServer = new MCPServer({
  id: 'test-mcp-server',
  name: 'Test Server',
  version: '1.0.0',
  agents: { testAgent },
  tools: { testTool },
  workflows: { testWorkflow },
})
```

info

Visit [MCPServer](https://mastra.ai/reference/tools/mcp-server) for a full list of configuration options.

Authentication

To protect your MCP server with OAuth, see the [OAuth Protection](https://mastra.ai/reference/tools/mcp-server#oauth-protection) section.

## Registering an `MCPServer` [Direct link to registering-an-mcpserver](https://mastra.ai/docs/mcp/overview\#registering-an-mcpserver "Direct link to registering-an-mcpserver")

To make an MCP server available to other systems or agents that support the protocol, register it in the main `Mastra` instance using `mcpServers`.

src/mastra/index.ts

```typescript
import { Mastra } from '@mastra/core/mastra'

import { testMcpServer } from './mcp/test-mcp-server'

export const mastra = new Mastra({
  mcpServers: { testMcpServer },
})
```

## Static and dynamic tools [Direct link to Static and dynamic tools](https://mastra.ai/docs/mcp/overview\#static-and-dynamic-tools "Direct link to Static and dynamic tools")

`MCPClient` offers two approaches to retrieving tools from connected servers, suitable for different application architectures:

| Feature | Static Configuration (`await mcp.listTools()`) | Dynamic Configuration (`await mcp.listToolsets()`) |
| --- | --- | --- |
| **Use Case** | Single-user, static config (e.g., CLI tool) | Multi-user, dynamic config (e.g., SaaS app) |
| **Configuration** | Fixed at agent initialization | Per-request, dynamic |
| **Credentials** | Shared across all uses | Can vary per user/request |
| **Agent Setup** | Tools added in `Agent` constructor | Tools passed in `.generate()` or `.stream()` options |

### Static tools [Direct link to Static tools](https://mastra.ai/docs/mcp/overview\#static-tools "Direct link to Static tools")

Use the `.listTools()` method to fetch tools from all configured MCP servers. This is suitable when configuration (such as API keys) is static and consistent across users or requests. Call it once and pass the result to the `tools` property when defining your agent.

info

Visit [listTools()](https://mastra.ai/reference/tools/mcp-client#listtools) for more information.

src/mastra/agents/test-agent.ts

```typescript
import { Agent } from '@mastra/core/agent'

import { testMcpClient } from '../mcp/test-mcp-client'

export const testAgent = new Agent({
  id: 'test-agent',
  tools: await testMcpClient.listTools(),
})
```

### Dynamic tools [Direct link to Dynamic tools](https://mastra.ai/docs/mcp/overview\#dynamic-tools "Direct link to Dynamic tools")

Use the `.listToolsets()` method when tool configuration may vary by request or user, such as in a multi-tenant system where each user provides their own API key. This method returns toolsets that can be passed to the `toolsets` option in the agent's `.generate()` or `.stream()` calls.

```typescript
import { MCPClient } from '@mastra/mcp'
import { mastra } from './mastra'

async function handleRequest(userPrompt: string, userApiKey: string) {
  const userMcp = new MCPClient({
    servers: {
      weather: {
        url: new URL('http://localhost:8080/mcp'),
        requestInit: {
          headers: {
            Authorization: `Bearer ${userApiKey}`,
          },
        },
      },
    },
  })

  const agent = mastra.getAgent('testAgent')

  const response = await agent.generate(userPrompt, {
    toolsets: await userMcp.listToolsets(),
  })

  await userMcp.disconnect()

  return Response.json({
    data: response.text,
  })
}
```

info

Visit [listToolsets()](https://mastra.ai/reference/tools/mcp-client#listtoolsets) for more information.

## Connecting to an MCP registry [Direct link to Connecting to an MCP registry](https://mastra.ai/docs/mcp/overview\#connecting-to-an-mcp-registry "Direct link to Connecting to an MCP registry")

MCP servers can be discovered through registries. Here's how to connect to some popular ones using `MCPClient`:

- Klavis AI
- mcp.run
- Composio.dev
- Smithery.ai
- Ampersand

[Klavis AI](https://klavis.ai/) provides hosted, enterprise-authenticated, high-quality MCP servers.

```typescript
import { MCPClient } from '@mastra/mcp'

const mcp = new MCPClient({
  servers: {
    salesforce: {
      url: new URL(
        'https://salesforce-mcp-server.klavis.ai/mcp/?instance_id={private-instance-id}',
      ),
    },
    hubspot: {
      url: new URL('https://hubspot-mcp-server.klavis.ai/mcp/?instance_id={private-instance-id}'),
    },
  },
})
```

Klavis AI offers enterprise-grade authentication and security for production deployments.

For more details on how to integrate Mastra with Klavis, check out their [documentation](https://docs.klavis.ai/documentation/ai-platform-integration/mastra).

[mcp.run](https://www.mcp.run/) provides pre-authenticated, managed MCP servers. Tools are grouped into Profiles, each with a unique, signed URL.

```typescript
import { MCPClient } from '@mastra/mcp'

const mcp = new MCPClient({
  servers: {
    marketing: {
      // Example profile name
      url: new URL(process.env.MCP_RUN_SSE_URL!), // Get URL from mcp.run profile
    },
  },
})
```

> **Important:** Treat the mcp.run SSE URL like a password. Store it securely, for example, in an environment variable.
>
> .env
>
> ```bash
> MCP_RUN_SSE_URL=https://www.mcp.run/api/mcp/sse?nonce=...
> ```

[Composio.dev](https://composio.dev/) offers a registry of [SSE-based MCP servers](https://mcp.composio.dev/). You can use the SSE URL generated for tools like Cursor directly.

```typescript
import { MCPClient } from '@mastra/mcp'

const mcp = new MCPClient({
  servers: {
    googleSheets: {
      url: new URL('https://mcp.composio.dev/googlesheets/[private-url-path]'),
    },
    gmail: {
      url: new URL('https://mcp.composio.dev/gmail/[private-url-path]'),
    },
  },
})
```

Authentication with services like Google Sheets often happens interactively through the agent conversation.

_Note: Composio URLs are typically tied to a single user account, making them best suited for personal automation rather than multi-tenant applications._

[Smithery.ai](https://smithery.ai/) provides a registry accessible via their CLI.

```typescript
// Unix/Mac
import { MCPClient } from '@mastra/mcp'

const mcp = new MCPClient({
  servers: {
    sequentialThinking: {
      command: 'npx',
      args: [\
        '-y',\
        '@smithery/cli@latest',\
        'run',\
        '@smithery-ai/server-sequential-thinking',\
        '--config',\
        '{}',\
      ],
    },
  },
})
```

```typescript
// Windows
import { MCPClient } from '@mastra/mcp'

const mcp = new MCPClient({
  servers: {
    sequentialThinking: {
      command: 'npx',
      args: [\
        '-y',\
        '@smithery/cli@latest',\
        'run',\
        '@smithery-ai/server-sequential-thinking',\
        '--config',\
        '{}',\
      ],
    },
  },
})
```

[Ampersand](https://withampersand.com/?utm_source=mastra-docs) offers an [MCP Server](https://docs.withampersand.com/mcp) that allows you to connect your agent to 150+ integrations with SaaS products like Salesforce, Hubspot, and Zendesk.

```typescript
// MCPClient with Ampersand MCP Server using SSE
export const mcp = new MCPClient({
  servers: {
    '@amp-labs/mcp-server': {
      url: `https://mcp.withampersand.com/v1/sse?${new URLSearchParams({
        apiKey: process.env.AMPERSAND_API_KEY,
        project: process.env.AMPERSAND_PROJECT_ID,
        integrationName: process.env.AMPERSAND_INTEGRATION_NAME,
        groupRef: process.env.AMPERSAND_GROUP_REF,
      })}`,
    },
  },
})
```

```typescript
// If you prefer to run the MCP server locally:
import { MCPClient } from '@mastra/mcp'

// MCPClient with Ampersand MCP Server using stdio transport
export const mcp = new MCPClient({
  servers: {
    '@amp-labs/mcp-server': {
      command: 'npx',
      args: [\
        '-y',\
        '@amp-labs/mcp-server@latest',\
        '--transport',\
        'stdio',\
        '--project',\
        process.env.AMPERSAND_PROJECT_ID,\
        '--integrationName',\
        process.env.AMPERSAND_INTEGRATION_NAME,\
        '--groupRef',\
        process.env.AMPERSAND_GROUP_REF, // optional\
      ],
      env: {
        AMPERSAND_API_KEY: process.env.AMPERSAND_API_KEY,
      },
    },
  },
})
```

As an alternative to MCP, Ampersand's AI SDK also has an adapter for Mastra, so you can [directly import Ampersand tools](https://docs.withampersand.com/ai-sdk#use-with-mastra) for your agent to access.

## Related [Direct link to Related](https://mastra.ai/docs/mcp/overview\#related "Direct link to Related")

- [Using Tools](https://mastra.ai/docs/agents/using-tools)
- [MCPClient](https://mastra.ai/reference/tools/mcp-client)
- [MCPServer](https://mastra.ai/reference/tools/mcp-server)

[Edit this page on GitHub](https://github.com/mastra-ai/mastra/tree/main/docs/src/content/en/docs/mcp/overview.mdx) [llms.txt](https://mastra.ai/docs/mcp/overview/llms.txt)

[Previous\\
\\
Workflow Streaming](https://mastra.ai/docs/streaming/workflow-streaming) [Next\\
\\
Publishing an MCP Server](https://mastra.ai/docs/mcp/publishing-mcp-server)

On this page

- [Get started](https://mastra.ai/docs/mcp/overview#get-started)
- [Configuring `MCPClient`](https://mastra.ai/docs/mcp/overview#configuring-mcpclient)
- [Using `MCPClient` with an agent](https://mastra.ai/docs/mcp/overview#using-mcpclient-with-an-agent)
- [Configuring `MCPServer`](https://mastra.ai/docs/mcp/overview#configuring-mcpserver)
- [Registering an `MCPServer`](https://mastra.ai/docs/mcp/overview#registering-an-mcpserver)
- [Static and dynamic tools](https://mastra.ai/docs/mcp/overview#static-and-dynamic-tools)
  - [Static tools](https://mastra.ai/docs/mcp/overview#static-tools)
  - [Dynamic tools](https://mastra.ai/docs/mcp/overview#dynamic-tools)
- [Connecting to an MCP registry](https://mastra.ai/docs/mcp/overview#connecting-to-an-mcp-registry)
- [Related](https://mastra.ai/docs/mcp/overview#related)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)

protected by **reCAPTCHA**

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)