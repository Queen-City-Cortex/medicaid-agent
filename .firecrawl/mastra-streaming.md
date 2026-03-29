[Skip to main content](https://mastra.ai/docs/streaming/overview#__docusaurus_skipToContent_fallback)

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

  - [Overview](https://mastra.ai/docs/streaming/overview)
  - [Events](https://mastra.ai/docs/streaming/events)
  - [Tool Streaming](https://mastra.ai/docs/streaming/tool-streaming)
  - [Workflow Streaming](https://mastra.ai/docs/streaming/workflow-streaming)
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

- Streaming
- Overview

Copy markdown

On this page

# Streaming overview

Mastra supports real-time, incremental responses from agents and workflows, allowing users to see output as it’s generated instead of waiting for completion. This is useful for chat, long-form content, multi-step workflows, or any scenario where immediate feedback matters.

## Getting started [Direct link to Getting started](https://mastra.ai/docs/streaming/overview\#getting-started "Direct link to Getting started")

Mastra's streaming API adapts based on your model version:

- **`.stream()`**: For V2 models, supports **AI SDK v5** and later (`LanguageModelV2`).
- **`.streamLegacy()`**: For V1 models, supports **AI SDK v4** (`LanguageModelV1`).

## Streaming with agents [Direct link to Streaming with agents](https://mastra.ai/docs/streaming/overview\#streaming-with-agents "Direct link to Streaming with agents")

You can pass a single string for basic prompts, an array of strings when providing multiple pieces of context, or an array of message objects with `role` and `content` for precise control over roles and conversational flows.

### Using `Agent.stream()` [Direct link to using-agentstream](https://mastra.ai/docs/streaming/overview\#using-agentstream "Direct link to using-agentstream")

A `textStream` breaks the response into chunks as it's generated, allowing output to stream progressively instead of arriving all at once. Iterate over the `textStream` using a `for await` loop to inspect each stream chunk.

```typescript
const testAgent = mastra.getAgent('testAgent')

const stream = await testAgent.stream([{ role: 'user', content: 'Help me organize my day' }])

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk)
}
```

info

Visit [Agent.stream()](https://mastra.ai/reference/streaming/agents/stream) for more information.

### Output from `Agent.stream()` [Direct link to output-from-agentstream](https://mastra.ai/docs/streaming/overview\#output-from-agentstream "Direct link to output-from-agentstream")

The output streams the generated response from the agent.

```text
Of course!
To help you organize your day effectively, I need a bit more information.
Here are some questions to consider:
...
```

### Agent stream properties [Direct link to Agent stream properties](https://mastra.ai/docs/streaming/overview\#agent-stream-properties "Direct link to Agent stream properties")

An agent stream provides access to various response properties:

- **`stream.textStream`**: A readable stream that emits text chunks.
- **`stream.text`**: Promise that resolves to the full text response.
- **`stream.finishReason`**: The reason the agent stopped streaming.
- **`stream.usage`**: Token usage information.

### AI SDK v5+ Compatibility [Direct link to AI SDK v5+ Compatibility](https://mastra.ai/docs/streaming/overview\#ai-sdk-v5-compatibility "Direct link to AI SDK v5+ Compatibility")

AI SDK v5 (and later) uses `LanguageModelV2` for the model providers. If you are getting an error that you are using an AI SDK v4 model you will need to upgrade your model package to the next major version.

For integration with AI SDK v5+, use the `toAISdkV5Stream()` utility from `@mastra/ai-sdk` to convert Mastra streams to AI SDK-compatible format:

```typescript
import { toAISdkV5Stream } from '@mastra/ai-sdk'

const testAgent = mastra.getAgent('testAgent')

const stream = await testAgent.stream([{ role: 'user', content: 'Help me organize my day' }])

// Convert to AI SDK v5+ compatible stream
const aiSDKStream = toAISdkV5Stream(stream, { from: 'agent' })

// Use with AI SDK v5+ methods
```

For converting messages to AI SDK v5+ format, use the `toAISdkV5Messages()` utility from `@mastra/ai-sdk/ui`:

```typescript
import { toAISdkV5Messages } from '@mastra/ai-sdk/ui'

const messages = [{ role: 'user', content: 'Hello' }]
const aiSDKMessages = toAISdkV5Messages(messages)
```

### Using `Agent.network()` [Direct link to using-agentnetwork](https://mastra.ai/docs/streaming/overview\#using-agentnetwork "Direct link to using-agentnetwork")

The `network()` method enables multi-agent collaboration by executing a network loop where multiple agents can work together to handle complex tasks. The routing agent delegates tasks to appropriate subagents, workflows, and tools based on the conversation context.

> **Note**: This method is experimental and requires memory to be configured on the agent.

```typescript
const testAgent = mastra.getAgent('testAgent')

const networkStream = await testAgent.network('Help me organize my day')

for await (const chunk of networkStream) {
  console.log(chunk)
}
```

info

Visit [Agent.network()](https://mastra.ai/reference/agents/network) for more information.

#### Network stream properties [Direct link to Network stream properties](https://mastra.ai/docs/streaming/overview\#network-stream-properties "Direct link to Network stream properties")

The network stream provides access to execution information:

- **`networkStream.status`**: Promise resolving to the workflow execution status
- **`networkStream.result`**: Promise resolving to the complete execution results
- **`networkStream.usage`**: Promise resolving to token usage information

```typescript
const testAgent = mastra.getAgent('testAgent')

const networkStream = await testAgent.network('Research dolphins then write a report')

for await (const chunk of networkStream) {
  console.log(chunk)
}

console.log('Final status:', await networkStream.status)
console.log('Final result:', await networkStream.result)
console.log('Token usage:', await networkStream.usage)
```

## Streaming with workflows [Direct link to Streaming with workflows](https://mastra.ai/docs/streaming/overview\#streaming-with-workflows "Direct link to Streaming with workflows")

Streaming from a workflow returns a sequence of structured events describing the run lifecycle, rather than incremental text chunks. This event-based format makes it possible to track and respond to workflow progress in real time once a run is created using `.createRun()`.

### Using `Run.stream()` [Direct link to using-runstream](https://mastra.ai/docs/streaming/overview\#using-runstream "Direct link to using-runstream")

The `stream()` method returns a `ReadableStream` of events directly.

```typescript
const run = await testWorkflow.createRun()

const stream = await run.stream({
  inputData: {
    value: 'initial data',
  },
})

for await (const chunk of stream) {
  console.log(chunk)
}
```

info

Visit [Run.stream()](https://mastra.ai/reference/streaming/workflows/stream) for more information.

### Output from `Run.stream()` [Direct link to output-from-runstream](https://mastra.ai/docs/streaming/overview\#output-from-runstream "Direct link to output-from-runstream")

The event structure includes `runId` and `from` at the top level, making it easier to identify and track workflow runs without digging into the payload.

```typescript
{
  type: 'workflow-start',
  runId: '1eeaf01a-d2bf-4e3f-8d1b-027795ccd3df',
  from: 'WORKFLOW',
  payload: {
    stepName: 'step-1',
    args: { value: 'initial data' },
    stepCallId: '8e15e618-be0e-4215-a5d6-08e58c152068',
    startedAt: 1755121710066,
    status: 'running'
  }
}
```

## Workflow stream properties [Direct link to Workflow stream properties](https://mastra.ai/docs/streaming/overview\#workflow-stream-properties "Direct link to Workflow stream properties")

A workflow stream provides access to various response properties:

- **`stream.status`**: The status of the workflow run.
- **`stream.result`**: The result of the workflow run.
- **`stream.usage`**: The total token usage of the workflow run.

## Related [Direct link to Related](https://mastra.ai/docs/streaming/overview\#related "Direct link to Related")

- [Streaming events](https://mastra.ai/docs/streaming/events)
- [Using Agents](https://mastra.ai/docs/agents/overview)
- [Workflows overview](https://mastra.ai/docs/workflows/overview)

[Edit this page on GitHub](https://github.com/mastra-ai/mastra/tree/main/docs/src/content/en/docs/streaming/overview.mdx) [llms.txt](https://mastra.ai/docs/streaming/overview/llms.txt)

[Previous\\
\\
Error Handling](https://mastra.ai/docs/workflows/error-handling) [Next\\
\\
Events](https://mastra.ai/docs/streaming/events)

On this page

- [Getting started](https://mastra.ai/docs/streaming/overview#getting-started)
- [Streaming with agents](https://mastra.ai/docs/streaming/overview#streaming-with-agents)
  - [Using `Agent.stream()`](https://mastra.ai/docs/streaming/overview#using-agentstream)
  - [Output from `Agent.stream()`](https://mastra.ai/docs/streaming/overview#output-from-agentstream)
  - [Agent stream properties](https://mastra.ai/docs/streaming/overview#agent-stream-properties)
  - [AI SDK v5+ Compatibility](https://mastra.ai/docs/streaming/overview#ai-sdk-v5-compatibility)
  - [Using `Agent.network()`](https://mastra.ai/docs/streaming/overview#using-agentnetwork)
- [Streaming with workflows](https://mastra.ai/docs/streaming/overview#streaming-with-workflows)
  - [Using `Run.stream()`](https://mastra.ai/docs/streaming/overview#using-runstream)
  - [Output from `Run.stream()`](https://mastra.ai/docs/streaming/overview#output-from-runstream)
- [Workflow stream properties](https://mastra.ai/docs/streaming/overview#workflow-stream-properties)
- [Related](https://mastra.ai/docs/streaming/overview#related)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)

protected by **reCAPTCHA**

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)