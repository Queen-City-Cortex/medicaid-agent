[Skip to main content](https://mastra.ai/docs/agents/overview#__docusaurus_skipToContent_fallback)

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

  - [Overview](https://mastra.ai/docs/agents/overview)
  - [Tools](https://mastra.ai/docs/agents/using-tools)
  - [Memory](https://mastra.ai/docs/memory/overview)
  - [Structured Output](https://mastra.ai/docs/agents/structured-output)
  - [Supervisor Agents(New)](https://mastra.ai/docs/agents/supervisor-agents)
  - [Processors](https://mastra.ai/docs/agents/processors)
  - [Guardrails](https://mastra.ai/docs/agents/guardrails)
  - [Agent Approval](https://mastra.ai/docs/agents/agent-approval)
  - [Voice](https://mastra.ai/docs/agents/adding-voice)
  - [Networks(Deprecated)](https://mastra.ai/docs/agents/networks)
- [Memory](https://mastra.ai/docs/memory/overview)

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

- Agents
- Overview

Copy markdown

On this page

# Agents overview

Agents use LLMs and tools to solve open-ended tasks. They reason about goals, decide which tools to use, retain conversation memory, and iterate internally until the model emits a final answer or an optional stop condition is met. Agents produce structured responses you can render in your UI or process programmatically. Use agents directly or compose them into workflows or multi-agent systems.

## When to use agents [Direct link to When to use agents](https://mastra.ai/docs/agents/overview\#when-to-use-agents "Direct link to When to use agents")

Use agents when the task is open-ended and the steps aren't known in advance. An agent decides which tools to call, how many times to loop, and when to stop. You provide the goal and constraints instead of defining each step. For predetermined, multi-step processes with explicit control flow, use [workflows](https://mastra.ai/docs/workflows/overview) instead.

tip

Watch an introduction to agents, and how they compare to workflows on [YouTube (7 minutes)](https://youtu.be/0jg2g3sNvgw).

## Quickstart [Direct link to Quickstart](https://mastra.ai/docs/agents/overview\#quickstart "Direct link to Quickstart")

Create an agent by instantiating the `Agent` class from `@mastra/core` and provide the required properties:

src/mastra/agents/test-agent.ts

```typescript
import { Agent } from '@mastra/core/agent'

export const testAgent = new Agent({
  id: 'test-agent',
  name: 'Test Agent',
  instructions: 'You are a helpful assistant.',
  model: 'openai/gpt-5.4',
})
```

The `instructions` define the agent's behavior, personality, and capabilities. They're system-level prompts that establish the agent's core identity and expertise. The `model` is specified as `'provider/model-name'` using Mastra's [model router](https://mastra.ai/models).

To make the agent available throughout your application, register it in your Mastra instance (typically located in `src/mastra/index.ts`):

src/mastra/index.ts

```typescript
import { Mastra } from '@mastra/core'
import { testAgent } from './agents/test-agent'

export const mastra = new Mastra({
  agents: { testAgent },
})
```

Once registered, it can be called from workflows, tools, or other agents, and has access to shared resources such as memory, logging, and observability features.

tip

Use [Studio](https://mastra.ai/docs/getting-started/studio) to test your agent with different messages, inspect tool calls and responses, and debug agent behavior.

note

Visit the [agent reference](https://mastra.ai/reference/agents/agent) for more information on available properties and configurations.

## Use your agent [Direct link to Use your agent](https://mastra.ai/docs/agents/overview\#use-your-agent "Direct link to Use your agent")

After registration, retrieve your agent with [`mastra.getAgentById()`](https://mastra.ai/reference/core/getAgentById). Call `.generate()` for a complete response or `.stream()` to deliver tokens in real time. You can call agents from [workflow steps](https://mastra.ai/docs/workflows/agents-and-tools), [tools](https://mastra.ai/docs/agents/using-tools), the [Mastra Client](https://mastra.ai/reference/client-js/mastra-client), route handlers, [server adapters](https://mastra.ai/docs/server/server-adapters), or the command line. Visit the [guides section](https://mastra.ai/guides) to learn how to use agents in your framework of choice.

When referencing an agent from your Mastra instance, use `mastra.getAgentById()` to ensure it has access to shared services such as instance-level storage, logging, and agent registry. A directly imported agent can still work with its own local configuration, but it won't have access to those shared services.

- Generate
- Stream

Returns the full response after all tool calls and steps complete. The result includes `text`, `toolCalls`, `toolResults`, `steps`, and token `usage` statistics.

```ts
const agent = mastra.getAgentById('test-agent')
const response = await agent.generate('Help me organize my day')
console.log(response.text)
```

Returns a stream you can consume as tokens arrive. The result exposes `textStream` for incremental output and promises for `toolCalls`, `toolResults`, `steps`, and token `usage` that resolve when the stream finishes.

```ts
const agent = mastra.getAgentById('test-agent')
const stream = await agent.stream('Help me organize my day')

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk)
}
```

## Expand your agent [Direct link to Expand your agent](https://mastra.ai/docs/agents/overview\#expand-your-agent "Direct link to Expand your agent")

Once your agent is running, use this table to find the right page for what you want to do next:

| Goal | Start here |
| --- | --- |
| Give your agent tools to call external APIs or services | [Tools](https://mastra.ai/docs/agents/using-tools) |
| Keep context and preferences across conversations | [Memory](https://mastra.ai/docs/memory/overview) |
| Get typed objects back instead of plain text | [Structured output](https://mastra.ai/docs/agents/structured-output) |
| Human-in-the-loop: Pause execution and wait for human approval | [Approval](https://mastra.ai/docs/agents/agent-approval) |
| Build a multi-agent network | [Supervisor agents](https://mastra.ai/docs/agents/supervisor-agents) |
| Register subagents | [Tools](https://mastra.ai/docs/agents/using-tools#agents-as-tools) |
| Intercept or transform messages before and after generation | [Processors](https://mastra.ai/docs/agents/processors) |
| Keep your agent safe | [Guardrails](https://mastra.ai/docs/agents/guardrails) |
| Swap instructions or models based on request context | [Dynamic configuration](https://mastra.ai/docs/server/request-context) |
| Add speech-to-text or text-to-speech | [Voice](https://mastra.ai/docs/agents/adding-voice) |

## Multi-agent systems [Direct link to Multi-agent systems](https://mastra.ai/docs/agents/overview\#multi-agent-systems "Direct link to Multi-agent systems")

A multi-agent system uses multiple agents to solve a task that is too broad or too specialized for a single agent. Instead of building one agent with dozens of tools and a long instruction set, you split responsibilities across focused agents and let a coordinator bring results together.

Read the [conceptual overview of multi-agent systems](https://mastra.ai/guides/concepts/multi-agent-systems) to learn how you can apply different patterns with Mastra.

[Edit this page on GitHub](https://github.com/mastra-ai/mastra/tree/main/docs/src/content/en/docs/agents/overview.mdx) [llms.txt](https://mastra.ai/docs/agents/overview/llms.txt)

[Previous\\
\\
Build with AI](https://mastra.ai/docs/getting-started/build-with-ai) [Next\\
\\
Tools](https://mastra.ai/docs/agents/using-tools)

On this page

- [When to use agents](https://mastra.ai/docs/agents/overview#when-to-use-agents)
- [Quickstart](https://mastra.ai/docs/agents/overview#quickstart)
- [Use your agent](https://mastra.ai/docs/agents/overview#use-your-agent)
- [Expand your agent](https://mastra.ai/docs/agents/overview#expand-your-agent)
- [Multi-agent systems](https://mastra.ai/docs/agents/overview#multi-agent-systems)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)

protected by **reCAPTCHA**

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)