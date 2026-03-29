[Skip to main content](https://mastra.ai/docs/server/mastra-client#__docusaurus_skipToContent_fallback)

Copy markdown

On this page

The Mastra Client SDK provides a concise and type-safe interface for interacting with your [Mastra Server](https://mastra.ai/docs/server/mastra-server) from your client environment.

## Prerequisites [Direct link to Prerequisites](https://mastra.ai/docs/server/mastra-client\#prerequisites "Direct link to Prerequisites")

To ensure smooth local development, make sure you have:

- Node.js `v22.13.0` or later
- TypeScript `v4.7` or higher (if using TypeScript)
- Your local Mastra server running (typically on port `4111`)

## Usage [Direct link to Usage](https://mastra.ai/docs/server/mastra-client\#usage "Direct link to Usage")

The Mastra Client SDK is designed for browser environments and uses the native `fetch` API for making HTTP requests to your Mastra server.

## Installation [Direct link to Installation](https://mastra.ai/docs/server/mastra-client\#installation "Direct link to Installation")

To use the Mastra Client SDK, install the required dependencies:

- npm
- pnpm
- Yarn
- Bun

```bash
npm install @mastra/client-js@latest
```

```bash
pnpm add @mastra/client-js@latest
```

```bash
yarn add @mastra/client-js@latest
```

```bash
bun add @mastra/client-js@latest
```

### Initialize the `MastraClient` [Direct link to initialize-the-mastraclient](https://mastra.ai/docs/server/mastra-client\#initialize-the-mastraclient "Direct link to initialize-the-mastraclient")

Once initialized with a `baseUrl`, `MastraClient` exposes a type-safe interface for calling agents, tools, and workflows.

lib/mastra-client.ts

```typescript
import { MastraClient } from '@mastra/client-js'

export const mastraClient = new MastraClient({
  baseUrl: process.env.MASTRA_API_URL || 'http://localhost:4111',
})
```

## Core APIs [Direct link to Core APIs](https://mastra.ai/docs/server/mastra-client\#core-apis "Direct link to Core APIs")

The Mastra Client SDK exposes all resources served by the Mastra Server

- **[Agents](https://mastra.ai/reference/client-js/agents)**: Generate responses and stream conversations.
- **[Memory](https://mastra.ai/reference/client-js/memory)**: Manage conversation threads and message history.
- **[Tools](https://mastra.ai/reference/client-js/tools)**: Executed and managed tools.
- **[Workflows](https://mastra.ai/reference/client-js/workflows)**: Trigger workflows and track their execution.
- **[Vectors](https://mastra.ai/reference/client-js/vectors)**: Use vector embeddings for semantic search.
- **[Logs](https://mastra.ai/reference/client-js/logs)**: View logs and debug system behavior.
- **[Telemetry](https://mastra.ai/reference/client-js/telemetry)**: Monitor app performance and trace activity.

## Generating responses [Direct link to Generating responses](https://mastra.ai/docs/server/mastra-client\#generating-responses "Direct link to Generating responses")

Call `.generate()` with a string prompt:

```typescript
import { mastraClient } from 'lib/mastra-client'

const testAgent = async () => {
  try {
    const agent = mastraClient.getAgent('testAgent')

    const response = await agent.generate('Hello')

    console.log(response.text)
  } catch (error) {
    return 'Error occurred while generating response'
  }
}
```

info

You can also call `.generate()` with an array of message objects that include `role` and `content`. Visit the [.generate() reference](https://mastra.ai/reference/client-js/agents#generate) for more information.

## Streaming responses [Direct link to Streaming responses](https://mastra.ai/docs/server/mastra-client\#streaming-responses "Direct link to Streaming responses")

Use `.stream()` for real-time responses with a string prompt:

```typescript
import { mastraClient } from 'lib/mastra-client'

const testAgent = async () => {
  try {
    const agent = mastraClient.getAgent('testAgent')

    const stream = await agent.stream('Hello')

    stream.processDataStream({
      onTextPart: text => {
        console.log(text)
      },
    })
  } catch (error) {
    return 'Error occurred while generating response'
  }
}
```

info

You can also call `.stream()` with an array of message objects that include `role` and `content`. Visit the [.stream() reference](https://mastra.ai/reference/client-js/agents#stream) for more information.

## Configuration options [Direct link to Configuration options](https://mastra.ai/docs/server/mastra-client\#configuration-options "Direct link to Configuration options")

`MastraClient` accepts optional parameters like `retries`, `backoffMs`, and `headers` to control request behavior. These parameters are useful for controlling retry behavior and including diagnostic metadata.

lib/mastra-client.ts

```typescript
import { MastraClient } from '@mastra/client-js'

export const mastraClient = new MastraClient({
  retries: 3,
  backoffMs: 300,
  maxBackoffMs: 5000,
  headers: {
    'X-Development': 'true',
  },
})
```

info

Visit [MastraClient](https://mastra.ai/reference/client-js/mastra-client) for more configuration options.

## Credentials and session cookies [Direct link to Credentials and session cookies](https://mastra.ai/docs/server/mastra-client\#credentials-and-session-cookies "Direct link to Credentials and session cookies")

**Authenticate Mastra API calls with session cookies** when your UI and Mastra API are not on the same origin—different host, subdomain, or port (for example Mastra Studio on one port and a custom server on another). Add **`credentials: 'include'`** to `MastraClient` so each request carries the cookies the user already has after sign-in. Skip this and you will often get **`401`** responses from Mastra even though login succeeded in the browser.

lib/mastra-client.ts

```typescript
import { MastraClient } from '@mastra/client-js'

export const mastraClient = new MastraClient({
  baseUrl: process.env.MASTRA_API_URL || 'http://localhost:4111',
  credentials: 'include',
})
```

**Allow credentialed cross-origin requests on your server**—see [CORS: requests with credentials](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#requests_with_credentials). You need a concrete `Access-Control-Allow-Origin` (not `*`) and `Access-Control-Allow-Credentials: true`, or the browser will block the call before it reaches Mastra.

**Using `@mastra/react`?** Wrap your app with `MastraReactProvider`, set `baseUrl` and `apiPrefix` to match your server, and rely on the default `credentials: 'include'`. Change `credentials` only when you deliberately want `same-origin` or `omit` behavior.

## Adding request cancelling [Direct link to Adding request cancelling](https://mastra.ai/docs/server/mastra-client\#adding-request-cancelling "Direct link to Adding request cancelling")

`MastraClient` supports request cancellation using the standard Node.js `AbortSignal` API. Useful for canceling in-flight requests, such as when users abort an operation or to clean up stale network calls.

Pass an `AbortSignal` to the client constructor to enable cancellation across all requests.

lib/mastra-client.ts

```typescript
import { MastraClient } from '@mastra/client-js'

export const controller = new AbortController()

export const mastraClient = new MastraClient({
  baseUrl: process.env.MASTRA_API_URL || 'http://localhost:4111',
  abortSignal: controller.signal,
})
```

### Using the `AbortController` [Direct link to using-the-abortcontroller](https://mastra.ai/docs/server/mastra-client\#using-the-abortcontroller "Direct link to using-the-abortcontroller")

Calling `.abort()` will cancel any ongoing requests tied to that signal.

```typescript
import { mastraClient, controller } from 'lib/mastra-client'

const handleAbort = () => {
  controller.abort()
}
```

## Client tools [Direct link to Client tools](https://mastra.ai/docs/server/mastra-client\#client-tools "Direct link to Client tools")

Define tools directly in client-side applications using the `createTool()` function. Pass them to agents via the `clientTools` parameter in `.generate()` or `.stream()` calls.

This lets agents trigger browser-side functionality such as DOM manipulation, local storage access, or other Web APIs, enabling tool execution in the user's environment rather than on the server.

```typescript
import { createTool } from '@mastra/client-js'
import { z } from 'zod'

const handleClientTool = async () => {
  try {
    const agent = mastraClient.getAgent('colorAgent')

    const colorChangeTool = createTool({
      id: 'color-change-tool',
      description: 'Changes the HTML background color',
      inputSchema: z.object({
        color: z.string(),
      }),
      outputSchema: z.object({
        success: z.boolean(),
      }),
      execute: async inputData => {
        const { color } = inputData

        document.body.style.backgroundColor = color
        return { success: true }
      },
    })

    const response = await agent.generate('Change the background to blue', {
      clientTools: { colorChangeTool },
    })

    console.log(response)
  } catch (error) {
    console.error(error)
  }
}
```

### Client tool's agent [Direct link to Client tool's agent](https://mastra.ai/docs/server/mastra-client\#client-tools-agent "Direct link to Client tool's agent")

This is a standard Mastra [agent](https://mastra.ai/docs/agents/overview#quickstart) configured to return hex color codes, intended to work with the browser-based client tool defined above.

src/mastra/agents/color-agent

```typescript
import { Agent } from '@mastra/core/agent'

export const colorAgent = new Agent({
  id: 'color-agent',
  name: 'Color Agent',
  instructions: `You are a helpful CSS assistant.
  You can change the background color of web pages.
  Respond with a hex reference for the color requested by the user`,
  model: 'openai/gpt-5.4',
})
```

## Server-side environments [Direct link to Server-side environments](https://mastra.ai/docs/server/mastra-client\#server-side-environments "Direct link to Server-side environments")

You can also use `MastraClient` in server-side environments such as API routes, serverless functions or actions. The usage will broadly remain the same but you may need to recreate the response to your client:

```typescript
export async function action() {
  const agent = mastraClient.getAgent('testAgent')

  const stream = await agent.stream('Hello')

  return new Response(stream.body)
}
```

## Best practices [Direct link to Best practices](https://mastra.ai/docs/server/mastra-client\#best-practices "Direct link to Best practices")

1. **Error Handling**: Implement proper [error handling](https://mastra.ai/reference/client-js/error-handling) for development scenarios.
2. **Environment Variables**: Use environment variables for configuration.
3. **Debugging**: Enable detailed [logging](https://mastra.ai/reference/client-js/logs) when needed.
4. **Performance**: Monitor application performance, [telemetry](https://mastra.ai/reference/client-js/telemetry) and traces.

On this page

- [Prerequisites](https://mastra.ai/docs/server/mastra-client#prerequisites)
- [Usage](https://mastra.ai/docs/server/mastra-client#usage)
- [Installation](https://mastra.ai/docs/server/mastra-client#installation)
  - [Initialize the `MastraClient`](https://mastra.ai/docs/server/mastra-client#initialize-the-mastraclient)
- [Core APIs](https://mastra.ai/docs/server/mastra-client#core-apis)
- [Generating responses](https://mastra.ai/docs/server/mastra-client#generating-responses)
- [Streaming responses](https://mastra.ai/docs/server/mastra-client#streaming-responses)
- [Configuration options](https://mastra.ai/docs/server/mastra-client#configuration-options)
- [Credentials and session cookies](https://mastra.ai/docs/server/mastra-client#credentials-and-session-cookies)
- [Adding request cancelling](https://mastra.ai/docs/server/mastra-client#adding-request-cancelling)
  - [Using the `AbortController`](https://mastra.ai/docs/server/mastra-client#using-the-abortcontroller)
- [Client tools](https://mastra.ai/docs/server/mastra-client#client-tools)
  - [Client tool's agent](https://mastra.ai/docs/server/mastra-client#client-tools-agent)
- [Server-side environments](https://mastra.ai/docs/server/mastra-client#server-side-environments)
- [Best practices](https://mastra.ai/docs/server/mastra-client#best-practices)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)

protected by **reCAPTCHA**

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)