We use tracking cookies to understand how you use the product and help us improve it. Please accept cookies to help us improve.

Accept cookiesDecline cookies

[Skip to main content](https://mastra.ai/docs/agents/using-tools#__docusaurus_skipToContent_fallback)

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
- Tools

Copy markdown

On this page

# Tools

Agents use tools to call APIs, query databases, or run custom functions from your codebase. Tools give agents capabilities beyond language generation by providing structured access to data and performing clearly defined operations. You can also load tools from remote [MCP servers](https://mastra.ai/docs/mcp/overview) to expand an agent's capabilities.

## When to use tools [Direct link to When to use tools](https://mastra.ai/docs/agents/using-tools\#when-to-use-tools "Direct link to When to use tools")

Use tools when an agent needs additional context or information from remote resources, or when it needs to run code that performs a specific operation. This includes tasks a model can't reliably handle on its own, such as fetching live data or returning consistent, well-defined outputs.

## Quickstart [Direct link to Quickstart](https://mastra.ai/docs/agents/using-tools\#quickstart "Direct link to Quickstart")

Import [`createTool`](https://mastra.ai/reference/tools/create-tool) from `@mastra/core/tools` and define a tool with an `id`, `description`, `inputSchema`, `outputSchema`, and `execute` function.

This example shows how to create a tool that fetches weather data from an API. When the agent calls the tool, it provides the required input as defined by the tool's `inputSchema`. The tool accesses this data through its `inputData` parameter, which in this example includes the `location` used in the weather API query.

src/mastra/tools/weather-tool.ts

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const weatherTool = createTool({
  id: 'weather-tool',
  description: 'Fetches weather for a location',
  inputSchema: z.object({
    location: z.string(),
  }),
  outputSchema: z.object({
    weather: z.string(),
  }),
  execute: async inputData => {
    const { location } = inputData

    const response = await fetch(`https://wttr.in/${location}?format=3`)
    const weather = await response.text()

    return { weather }
  },
})
```

When creating tools, keep descriptions concise and focused on what the tool does, emphasizing its primary use case. Descriptive schema names can also help guide the agent on how to use the tool.

note

Visit the [`createTool`](https://mastra.ai/reference/tools/create-tool) reference for more information on available properties, configurations, and examples.

To make a tool available to an agent, add it to the `tools` property on the `Agent` class. Mentioning available tools and their general purpose in the agent's system prompt helps the agent decide when to call a tool and when not to.

src/mastra/agents/weather-agent.ts

```typescript
import { Agent } from '@mastra/core/agent'
import { weatherTool } from '../tools/weather-tool'

export const weatherAgent = new Agent({
  id: 'weather-agent',
  name: 'Weather Agent',
  instructions: `
    You are a helpful weather assistant.
    Use the weatherTool to fetch current weather data.`,
  model: 'openai/gpt-5.4',
  tools: { weatherTool },
})
```

## Multiple tools [Direct link to Multiple tools](https://mastra.ai/docs/agents/using-tools\#multiple-tools "Direct link to Multiple tools")

An agent can use multiple tools to handle more complex tasks by delegating specific parts to individual tools. The agent decides which tools to use based on the user's message, the agent's instructions, and the tool descriptions and schemas.

src/mastra/agents/weather-agent.ts

```typescript
import { Agent } from '@mastra/core/agent'
import { weatherTool } from '../tools/weather-tool'
import { hazardsTool } from '../tools/hazards-tool'

export const weatherAgent = new Agent({
  id: 'weather-agent',
  name: 'Weather Agent',
  instructions: `
    You are a helpful weather assistant.
    Use the weatherTool to fetch current weather data.
    Use the hazardsTool to provide information about potential weather hazards.`,
  model: 'openai/gpt-5.4',
  tools: { weatherTool, hazardsTool },
})
```

## Agents as tools [Direct link to Agents as tools](https://mastra.ai/docs/agents/using-tools\#agents-as-tools "Direct link to Agents as tools")

Add subagents through the `agents` configuration to create a [supervisor](https://mastra.ai/docs/agents/supervisor-agents). Mastra converts each subagent to a tool named `agent-<key>`. Include a `description` on each subagent so the supervisor knows when to delegate.

src/mastra/agents/supervisor.ts

```typescript
import { Agent } from '@mastra/core/agent'

const writer = new Agent({
  id: 'writer',
  name: 'Writer',
  description: 'Drafts and edits written content',
  instructions: 'You are a skilled writer.',
  model: 'openai/gpt-5.4',
})

export const supervisor = new Agent({
  id: 'supervisor',
  name: 'Supervisor',
  instructions: 'Coordinate the writer to produce content.',
  model: 'openai/gpt-5.4',
  agents: { writer },
})
```

## Workflows as tools [Direct link to Workflows as tools](https://mastra.ai/docs/agents/using-tools\#workflows-as-tools "Direct link to Workflows as tools")

Add workflows through the `workflows` configuration. Mastra converts each workflow to a tool named `workflow-<key>`, using the workflow's `inputSchema` and `outputSchema`. Include a `description` on the workflow so the agent knows when to trigger it.

src/mastra/agents/research-agent.ts

```typescript
import { Agent } from '@mastra/core/agent'
import { researchWorkflow } from '../workflows/research-workflow'

export const researchAgent = new Agent({
  id: 'research-agent',
  name: 'Research Agent',
  instructions: 'You are a research assistant.',
  model: 'openai/gpt-5.4',
  workflows: { researchWorkflow },
})
```

## Shape output for the model [Direct link to Shape output for the model](https://mastra.ai/docs/agents/using-tools\#shape-output-for-the-model "Direct link to Shape output for the model")

Use `toModelOutput` when your tool returns rich structured data for your application, but you want the model to receive a smaller or multimodal representation. This keeps model context focused while preserving the full tool result in your app.

src/mastra/tools/weather-tool.ts

```typescript
export const weatherTool = createTool({
  execute: async ({ location }) => {
    const response = await fetch(`https://wttr.in/${location}?format=j1`)
    const data = await response.json()

    return {
      location,
      temperature: data.current_condition[0].temp_F,
      condition: data.current_condition[0].weatherDesc[0].value,
      weatherIconUrl: data.current_condition[0].weatherIconUrl[0].value,
      source: data,
    }
  },
  toModelOutput: output => {
    return {
      type: 'content',
      value: [\
        {\
          type: 'text',\
          text: `${output.location}: ${output.temperature}F and ${output.condition}`,\
        },\
        { type: 'image-url', url: output.weatherIconUrl },\
      ],
    }
  },
})
```

## Control tool selection [Direct link to Control tool selection](https://mastra.ai/docs/agents/using-tools\#control-tool-selection "Direct link to Control tool selection")

Pass `toolChoice` or `activeTools` to `.generate()` or `.stream()` to control which tools the agent uses at runtime.

```typescript
await agent.generate('Check the forecast', {
  toolChoice: 'required',
  activeTools: ['weatherTool'],
})
```

note

See the [`Agent.generate()` reference](https://mastra.ai/reference/agents/generate) for all runtime options including `toolsets`, `clientTools`, and `prepareStep`.

## Control `toolName` in stream responses [Direct link to control-toolname-in-stream-responses](https://mastra.ai/docs/agents/using-tools\#control-toolname-in-stream-responses "Direct link to control-toolname-in-stream-responses")

The `toolName` in stream responses is determined by the **object key** you use, not the `id` property of the tool, agent, or workflow.

```typescript
export const weatherTool = createTool({
  id: 'weather-tool',
})

// Using the variable name as the key
tools: { weatherTool }
// Stream returns: toolName: "weatherTool"

// Using the tool's id as the key
tools: { [weatherTool.id]: weatherTool }
// Stream returns: toolName: "weather-tool"

// Using a custom key
tools: { "my-custom-name": weatherTool }
// Stream returns: toolName: "my-custom-name"
```

This lets you specify how tools are identified in the stream. If you want the `toolName` to match the tool's `id`, use the tool's `id` as the object key.

### Subagents and workflows as tools [Direct link to Subagents and workflows as tools](https://mastra.ai/docs/agents/using-tools\#subagents-and-workflows-as-tools "Direct link to Subagents and workflows as tools")

Subagents and workflows follow the same pattern. They're converted to tools with a prefix followed by your object key:

| Property | Prefix | Example key | `toolName` |
| --- | --- | --- | --- |
| `agents` | `agent-` | `weather` | `agent-weather` |
| `workflows` | `workflow-` | `research` | `workflow-research` |

```typescript
const orchestrator = new Agent({
  agents: {
    weather: weatherAgent, // toolName: "agent-weather"
  },
  workflows: {
    research: researchWorkflow, // toolName: "workflow-research"
  },
})
```

Note that for subagents, you'll see two different identifiers in stream responses:

- `toolName: "agent-weather"` in tool call events — the generated tool wrapper name
- `id: "weather-agent"` in `data-tool-agent` chunks — the subagent's actual `id` property

## Related [Direct link to Related](https://mastra.ai/docs/agents/using-tools\#related "Direct link to Related")

- [`createTool` reference](https://mastra.ai/reference/tools/create-tool)
- [`Agent.generate()` reference](https://mastra.ai/reference/agents/generate): Runtime options for tool selection, steps, and callbacks
- [MCP overview](https://mastra.ai/docs/mcp/overview)
- [Dynamic tool search](https://mastra.ai/reference/processors/tool-search-processor): Load tools on demand for agents with large tool libraries
- [Tools with structured output](https://mastra.ai/docs/agents/structured-output#combine-tools-and-structured-output): Model compatibility when combining tools and structured output
- [Agent approval](https://mastra.ai/docs/agents/agent-approval)
- [Request context](https://mastra.ai/docs/server/request-context)

[Edit this page on GitHub](https://github.com/mastra-ai/mastra/tree/main/docs/src/content/en/docs/agents/using-tools.mdx) [llms.txt](https://mastra.ai/docs/agents/using-tools/llms.txt)

[Previous\\
\\
Overview](https://mastra.ai/docs/agents/overview) [Next\\
\\
Structured Output](https://mastra.ai/docs/agents/structured-output)

On this page

- [When to use tools](https://mastra.ai/docs/agents/using-tools#when-to-use-tools)
- [Quickstart](https://mastra.ai/docs/agents/using-tools#quickstart)
- [Multiple tools](https://mastra.ai/docs/agents/using-tools#multiple-tools)
- [Agents as tools](https://mastra.ai/docs/agents/using-tools#agents-as-tools)
- [Workflows as tools](https://mastra.ai/docs/agents/using-tools#workflows-as-tools)
- [Shape output for the model](https://mastra.ai/docs/agents/using-tools#shape-output-for-the-model)
- [Control tool selection](https://mastra.ai/docs/agents/using-tools#control-tool-selection)
- [Control `toolName` in stream responses](https://mastra.ai/docs/agents/using-tools#control-toolname-in-stream-responses)
  - [Subagents and workflows as tools](https://mastra.ai/docs/agents/using-tools#subagents-and-workflows-as-tools)
- [Related](https://mastra.ai/docs/agents/using-tools#related)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)

protected by **reCAPTCHA**

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)