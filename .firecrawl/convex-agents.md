[Skip to main content](https://docs.convex.dev/agents#__docusaurus_skipToContent_fallback)

[![Convex](https://docs.convex.dev/img/convex-light.svg)](https://convex.dev/)[Docs](https://docs.convex.dev/home)

Search docs and more...^K

Ask AI

[Dashboard](https://dashboard.convex.dev/) [Blog](https://stack.convex.dev/) [GitHub](https://github.com/get-convex) [Discord](https://convex.dev/community)

[![Convex](https://docs.convex.dev/img/convex-light.svg)](https://convex.dev/)[Docs](https://docs.convex.dev/home)

- [Home](https://docs.convex.dev/home)
- [Dashboard](https://dashboard.convex.dev/)
- [Blog](https://stack.convex.dev/)
- [GitHub](https://github.com/get-convex)
- [Discord](https://convex.dev/community)
- * * *

- Get Started

- [Tutorial](https://docs.convex.dev/tutorial/)

- [Quickstarts](https://docs.convex.dev/quickstarts)

- [Understand Convex](https://docs.convex.dev/understanding/)

- * * *

- Platform

- [Functions](https://docs.convex.dev/functions)

- [Database](https://docs.convex.dev/database)

- [Realtime](https://docs.convex.dev/realtime)
- [Authentication](https://docs.convex.dev/auth)

- [Scheduling](https://docs.convex.dev/scheduling)

- [File Storage](https://docs.convex.dev/file-storage)

- [Search](https://docs.convex.dev/search)

- [Components](https://docs.convex.dev/components)

- * * *

- Guides

- [AI Code Gen](https://docs.convex.dev/ai)

- [Agents](https://docs.convex.dev/agents)

  - [Getting Started](https://docs.convex.dev/agents/getting-started)
  - [Agent Usage](https://docs.convex.dev/agents/agent-usage)
  - [Threads](https://docs.convex.dev/agents/threads)
  - [Messages](https://docs.convex.dev/agents/messages)
  - [Streaming](https://docs.convex.dev/agents/streaming)
  - [Playground](https://docs.convex.dev/agents/playground)
  - [Tools](https://docs.convex.dev/agents/tools)
  - [LLM Context](https://docs.convex.dev/agents/context)
  - [RAG](https://docs.convex.dev/agents/rag)
  - [Workflows](https://docs.convex.dev/agents/workflows)
  - [Human Agents](https://docs.convex.dev/agents/human-agents)
  - [Files](https://docs.convex.dev/agents/files)
  - [Debugging](https://docs.convex.dev/agents/debugging)
  - [Rate Limiting](https://docs.convex.dev/agents/rate-limiting)
  - [Usage Tracking](https://docs.convex.dev/agents/usage-tracking)
- [Chef](https://docs.convex.dev/chef)
- [Testing](https://docs.convex.dev/testing)

- [Production](https://docs.convex.dev/production)

- [Self Hosting](https://docs.convex.dev/self-hosting)
- [Platform APIs](https://docs.convex.dev/platform-apis)

- * * *

- Client Libraries

- [React](https://docs.convex.dev/client/react)

- [Next.js](https://docs.convex.dev/client/nextjs/app-router/)

- [TanStack](https://docs.convex.dev/client/tanstack/tanstack-query/)

- [React Native](https://docs.convex.dev/client/react-native)
- [JavaScript](https://docs.convex.dev/client/javascript)

- [Vue](https://docs.convex.dev/client/vue)

- [Svelte](https://docs.convex.dev/client/svelte)
- [Python](https://docs.convex.dev/client/python)
- [Swift](https://docs.convex.dev/client/swift)

- [Android Kotlin](https://docs.convex.dev/client/android)

- [Rust](https://docs.convex.dev/client/rust)
- [OpenAPI](https://docs.convex.dev/client/open-api)
- * * *

- Tools

- [Dashboard](https://docs.convex.dev/dashboard)

- [CLI](https://docs.convex.dev/cli)

- * * *

- API Reference

- [Convex API](https://docs.convex.dev/api/)

- [Generated Code](https://docs.convex.dev/generated-api/)

- [Deployment API](https://docs.convex.dev/deployment-api)

- [Management API](https://docs.convex.dev/management-api)

- [Errors](https://docs.convex.dev/error)
- [ESLint](https://docs.convex.dev/eslint)

Copy as Markdown

Copied!

On this page

# AI Agents

## Building AI Agents with Convex [​](https://docs.convex.dev/agents\#building-ai-agents-with-convex "Direct link to Building AI Agents with Convex")

Convex provides powerful building blocks for building agentic AI applications,
leveraging Components and existing Convex features.

With Convex, you can separate your long-running agentic workflows from your UI,
without the user losing reactivity and interactivity. The message history with
an LLM is persisted by default, live updating on every client, and easily
composed with other Convex features using code rather than configuration.

## Agent Component [​](https://docs.convex.dev/agents\#agent-component "Direct link to Agent Component")

The Agent component is a core building block for building AI agents. It manages
threads and messages, around which your Agents can cooperate in static or
dynamic workflows.

Powerful AI Apps Made Easy with the Agent Component - YouTube

Tap to unmute

[Powerful AI Apps Made Easy with the Agent Component](https://www.youtube.com/watch?v=tUKMPUlOCHY) [Convex](https://www.youtube.com/channel/UCoC_9mdiPwIu1sDxDtGQggQ)

Convex11.8K subscribers

[Watch on](https://www.youtube.com/watch?v=tUKMPUlOCHY)

[Agent Component YouTube\\
Video](https://www.youtube.com/embed/tUKMPUlOCHY?si=ce-M8pt6EWDZ8tfd)

### Core Concepts [​](https://docs.convex.dev/agents\#core-concepts "Direct link to Core Concepts")

- Agents organize LLM prompting with associated models, prompts, and
[Tools](https://docs.convex.dev/agents/tools). They can generate and stream both text and objects.
- Agents can be used in any Convex action, letting you write your agentic code
alongside your other business logic with all the abstraction benefits of using
code rather than static configuration.
- [Threads](https://docs.convex.dev/agents/threads) persist [messages](https://docs.convex.dev/agents/messages) and can be
shared by multiple users and agents (including
[human agents](https://docs.convex.dev/agents/human-agents)).
- [Conversation context](https://docs.convex.dev/agents/context) is automatically included in each LLM
call, including built-in hybrid vector/text search for messages.

### Advanced Features [​](https://docs.convex.dev/agents\#advanced-features "Direct link to Advanced Features")

- [Workflows](https://docs.convex.dev/agents/workflows) allow building multi-step operations that can
span agents, users, durably and reliably.
- [RAG](https://docs.convex.dev/agents/rag) techniques are also supported for prompt augmentation
either up front or as tool calls using the
[RAG Component](https://www.convex.dev/components/rag).
- [Files](https://docs.convex.dev/agents/files) can be used in the chat history with automatic saving
to [file storage](https://docs.convex.dev/file-storage).

### Debugging and Tracking [​](https://docs.convex.dev/agents\#debugging-and-tracking "Direct link to Debugging and Tracking")

- [Debugging](https://docs.convex.dev/agents/debugging) is supported, including the
[agent playground](https://docs.convex.dev/agents/playground) where you can inspect all metadata and
iterate on prompts and context settings.
- [Usage tracking](https://docs.convex.dev/agents/usage-tracking) enables usage billing for users and
teams.
- [Rate limiting](https://docs.convex.dev/agents/rate-limiting) helps control the rate at which users
can interact with agents and keep you from exceeding your LLM provider's
limits.

[**Build your first Agent**](https://docs.convex.dev/agents/getting-started)

Learn more about the motivation by reading:
[AI Agents with Built-in Memory](https://stack.convex.dev/ai-agents).

Sample code:

```typescript
import { Agent } from "@convex-dev/agents";
import { openai } from "@ai-sdk/openai";
import { components } from "./_generated/api";
import { action } from "./_generated/server";

// Define an agent
const supportAgent = new Agent(components.agent, {
  name: "Support Agent",
  chat: openai.chat("gpt-4o-mini"),
  instructions: "You are a helpful assistant.",
  tools: { accountLookup, fileTicket, sendEmail },
});

// Use the agent from within a normal action:
export const createThread = action({
  args: { prompt: v.string() },
  handler: async (ctx, { prompt }) => {
    const { threadId, thread } = await supportAgent.createThread(ctx);
    const result = await thread.generateText({ prompt });
    return { threadId, text: result.text };
  },
});

// Pick up where you left off, with the same or a different agent:
export const continueThread = action({
  args: { prompt: v.string(), threadId: v.string() },
  handler: async (ctx, { prompt, threadId }) => {
    // This includes previous message history from the thread automatically.
    const { thread } = await anotherAgent.continueThread(ctx, { threadId });
    const result = await thread.generateText({ prompt });
    return result.text;
  },
});
```

[Previous\\
\\
Convex MCP Server](https://docs.convex.dev/ai/convex-mcp-server) [Next\\
\\
Getting Started](https://docs.convex.dev/agents/getting-started)

- [Building AI Agents with Convex](https://docs.convex.dev/agents#building-ai-agents-with-convex)
- [Agent Component](https://docs.convex.dev/agents#agent-component)
  - [Core Concepts](https://docs.convex.dev/agents#core-concepts)
  - [Advanced Features](https://docs.convex.dev/agents#advanced-features)
  - [Debugging and Tracking](https://docs.convex.dev/agents#debugging-and-tracking)

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept

reCAPTCHA

Recaptcha requires verification.

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)

protected by **reCAPTCHA**

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)