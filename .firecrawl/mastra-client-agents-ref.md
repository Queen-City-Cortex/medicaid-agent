We use tracking cookies to understand how you use the product and help us improve it. Please accept cookies to help us improve.

Accept cookiesDecline cookies

[Skip to main content](https://mastra.ai/reference/client-js/agents#__docusaurus_skipToContent_fallback)

Copy markdown

On this page

The Agents API provides methods to interact with Mastra AI agents, including generating responses, streaming interactions, and managing agent tools.

## Getting all agents [Direct link to Getting all agents](https://mastra.ai/reference/client-js/agents\#getting-all-agents "Direct link to Getting all agents")

Retrieve a list of all available agents:

```typescript
const agents = await mastraClient.listAgents()
```

Returns a record of agent IDs to their serialized agent configurations.

## Working with a specific agent [Direct link to Working with a specific agent](https://mastra.ai/reference/client-js/agents\#working-with-a-specific-agent "Direct link to Working with a specific agent")

Get an instance of a specific agent by its ID:

src/mastra/agents/my-agent.ts

```typescript
export const myAgent = new Agent({
  id: 'my-agent',
})
```

```typescript
const agent = mastraClient.getAgent('my-agent')
```

## Agent methods [Direct link to Agent methods](https://mastra.ai/reference/client-js/agents\#agent-methods "Direct link to Agent methods")

### `details()` [Direct link to details](https://mastra.ai/reference/client-js/agents\#details "Direct link to details")

Retrieve detailed information about an agent:

```typescript
const details = await agent.details()
```

### `generate()` [Direct link to generate](https://mastra.ai/reference/client-js/agents\#generate "Direct link to generate")

Generate a response from the agent:

```typescript
const response = await agent.generate(
  [\
    {\
      role: 'user',\
      content: 'Hello, how are you?',\
    },\
  ],
  {
    memory: {
      thread: 'thread-abc', // Optional: Thread ID for conversation context
      resource: 'user-123', // Optional: Resource ID
    },
    structuredOutput: {}, // Optional: Structured Output configuration
  },
)
```

You can also use the simplified string format with memory options:

```typescript
const response = await agent.generate('Hello, how are you?', {
  memory: {
    thread: 'thread-1',
    resource: 'resource-1',
  },
})
```

### `stream()` [Direct link to stream](https://mastra.ai/reference/client-js/agents\#stream "Direct link to stream")

Stream responses from the agent for real-time interactions:

```typescript
const response = await agent.stream('Tell me a story')

// Process data stream with the processDataStream util
response.processDataStream({
  onChunk: async chunk => {
    console.log(chunk)
  },
})
```

You can also use the simplified string format with memory options:

```typescript
const response = await agent.stream('Tell me a story', {
  memory: {
    thread: 'thread-1',
    resource: 'resource-1',
  },
  clientTools: { colorChangeTool },
})

response.processDataStream({
  onChunk: async chunk => {
    if (chunk.type === 'text-delta') {
      console.log(chunk.payload.text)
    }
  },
})
```

You can also read from response body directly:

```typescript
const reader = response.body.getReader()
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  console.log(new TextDecoder().decode(value))
}
```

#### AI SDK compatible format [Direct link to AI SDK compatible format](https://mastra.ai/reference/client-js/agents\#ai-sdk-compatible-format "Direct link to AI SDK compatible format")

To stream AI SDK-formatted parts on the client from an `agent.stream(...)` response, wrap `response.processDataStream` into a `ReadableStream<ChunkType>` and use `toAISdkStream`:

client-ai-sdk-transform.ts

```typescript
import { createUIMessageStream } from 'ai'
import { toAISdkStream } from '@mastra/ai-sdk'
import type { ChunkType, MastraModelOutput } from '@mastra/core/stream'

const response = await agent.stream('Tell me a story')

const chunkStream: ReadableStream<ChunkType> = new ReadableStream<ChunkType>({
  start(controller) {
    response
      .processDataStream({
        onChunk: async chunk => controller.enqueue(chunk as ChunkType),
      })
      .finally(() => controller.close())
  },
})

const uiMessageStream = createUIMessageStream({
  execute: async ({ writer }) => {
    for await (const part of toAISdkStream(chunkStream as unknown as MastraModelOutput, {
      from: 'agent',
    })) {
      writer.write(part)
    }
  },
})

for await (const part of uiMessageStream) {
  console.log(part)
}
```

### `getTool()` [Direct link to gettool](https://mastra.ai/reference/client-js/agents\#gettool "Direct link to gettool")

Retrieve information about a specific tool available to the agent:

```typescript
const tool = await agent.getTool('tool-id')
```

### `executeTool()` [Direct link to executetool](https://mastra.ai/reference/client-js/agents\#executetool "Direct link to executetool")

Execute a specific tool for the agent:

```typescript
const result = await agent.executeTool('tool-id', {
  data: { input: 'value' },
})
```

### `network()` [Direct link to network](https://mastra.ai/reference/client-js/agents\#network "Direct link to network")

Stream responses from an agent network for multi-agent interactions:

```typescript
const response = await agent.network('Research this topic and write a summary')

response.processDataStream({
  onChunk: async chunk => {
    console.log(chunk)
  },
})
```

### `approveToolCall()` [Direct link to approvetoolcall](https://mastra.ai/reference/client-js/agents\#approvetoolcall "Direct link to approvetoolcall")

Approve a pending tool call that requires human confirmation:

```typescript
const response = await agent.approveToolCall({
  runId: 'run-123',
  toolCallId: 'tool-call-456',
})

response.processDataStream({
  onChunk: async chunk => {
    console.log(chunk)
  },
})
```

### `declineToolCall()` [Direct link to declinetoolcall](https://mastra.ai/reference/client-js/agents\#declinetoolcall "Direct link to declinetoolcall")

Decline a pending tool call that requires human confirmation:

```typescript
const response = await agent.declineToolCall({
  runId: 'run-123',
  toolCallId: 'tool-call-456',
})

response.processDataStream({
  onChunk: async chunk => {
    console.log(chunk)
  },
})
```

### `approveToolCallGenerate()` [Direct link to approvetoolcallgenerate](https://mastra.ai/reference/client-js/agents\#approvetoolcallgenerate "Direct link to approvetoolcallgenerate")

Approve a pending tool call when using `generate()` (non-streaming). Returns the complete response:

```typescript
const output = await agent.generate('Find user John', {
  requireToolApproval: true,
})

if (output.finishReason === 'suspended') {
  const result = await agent.approveToolCallGenerate({
    runId: output.runId,
    toolCallId: output.suspendPayload.toolCallId,
  })

  console.log(result.text)
}
```

### `declineToolCallGenerate()` [Direct link to declinetoolcallgenerate](https://mastra.ai/reference/client-js/agents\#declinetoolcallgenerate "Direct link to declinetoolcallgenerate")

Decline a pending tool call when using `generate()` (non-streaming). Returns the complete response:

```typescript
const output = await agent.generate('Find user John', {
  requireToolApproval: true,
})

if (output.finishReason === 'suspended') {
  const result = await agent.declineToolCallGenerate({
    runId: output.runId,
    toolCallId: output.suspendPayload.toolCallId,
  })

  console.log(result.text)
}
```

## Client tools [Direct link to Client tools](https://mastra.ai/reference/client-js/agents\#client-tools "Direct link to Client tools")

Client-side tools allow you to execute custom functions on the client side when the agent requests them.

```typescript
import { createTool } from '@mastra/client-js'
import { z } from 'zod'

const colorChangeTool = createTool({
  id: 'changeColor',
  description: 'Changes the background color',
  inputSchema: z.object({
    color: z.string(),
  }),
  execute: async inputData => {
    document.body.style.backgroundColor = inputData.color
    return { success: true }
  },
})

// Use with generate
const response = await agent.generate('Change the background to blue', {
  clientTools: { colorChangeTool },
})

// Use with stream
const response = await agent.stream('Tell me a story', {
  memory: {
    thread: 'thread-1',
    resource: 'resource-1',
  },
  clientTools: { colorChangeTool },
})

response.processDataStream({
  onChunk: async chunk => {
    if (chunk.type === 'text-delta') {
      console.log(chunk.payload.text)
    } else if (chunk.type === 'tool-call') {
      console.log(
        `calling tool ${chunk.payload.toolName} with args ${JSON.stringify(
          chunk.payload.args,
          null,
          2,
        )}`,
      )
    }
  },
})
```

## Stored agents [Direct link to Stored agents](https://mastra.ai/reference/client-js/agents\#stored-agents "Direct link to Stored agents")

Stored agents are agent configurations stored in a database that can be created, updated, and deleted at runtime. They reference primitives (tools, workflows, other agents, scorers) by key, which are resolved from the Mastra registry when the agent is instantiated. Memory is configured inline as a `SerializedMemoryConfig` object with options such as `lastMessages` and `semanticRecall`.

### `listStoredAgents()` [Direct link to liststoredagents](https://mastra.ai/reference/client-js/agents\#liststoredagents "Direct link to liststoredagents")

Retrieve a paginated list of all stored agents:

```typescript
const result = await mastraClient.listStoredAgents()
console.log(result.agents) // Array of stored agents
console.log(result.total) // Total count
```

With pagination and ordering:

```typescript
const result = await mastraClient.listStoredAgents({
  page: 0,
  perPage: 20,
  orderBy: {
    field: 'createdAt',
    direction: 'DESC',
  },
})
```

### `createStoredAgent()` [Direct link to createstoredagent](https://mastra.ai/reference/client-js/agents\#createstoredagent "Direct link to createstoredagent")

Create a new stored agent:

```typescript
const agent = await mastraClient.createStoredAgent({
  id: 'my-agent',
  name: 'My Assistant',
  instructions: 'You are a helpful assistant.',
  model: {
    provider: 'openai',
    name: 'gpt-5.4',
  },
})
```

With all options:

```typescript
const agent = await mastraClient.createStoredAgent({
  id: 'full-agent',
  name: 'Full Agent',
  description: 'A fully configured agent',
  instructions: 'You are a helpful assistant.',
  model: {
    provider: 'openai',
    name: 'gpt-5.4',
  },
  tools: { calculator: {}, weather: {} },
  workflows: { 'data-processing': {} },
  agents: { 'subagent-1': {} },
  memory: {
    options: {
      lastMessages: 20,
      semanticRecall: false,
    },
  },
  scorers: {
    'quality-scorer': {
      sampling: { type: 'ratio', rate: 0.1 },
    },
  },
  defaultOptions: {
    maxSteps: 10,
  },
  metadata: {
    version: '1.0',
    team: 'engineering',
  },
})
```

### `getStoredAgent()` [Direct link to getstoredagent](https://mastra.ai/reference/client-js/agents\#getstoredagent "Direct link to getstoredagent")

Get an instance of a specific stored agent:

```typescript
const storedAgent = mastraClient.getStoredAgent('my-agent')
```

## Stored agent methods [Direct link to Stored agent methods](https://mastra.ai/reference/client-js/agents\#stored-agent-methods "Direct link to Stored agent methods")

### `details()` [Direct link to details-1](https://mastra.ai/reference/client-js/agents\#details-1 "Direct link to details-1")

Retrieve the stored agent configuration:

```typescript
const details = await storedAgent.details()
console.log(details.name)
console.log(details.instructions)
console.log(details.model)
```

### `update()` [Direct link to update](https://mastra.ai/reference/client-js/agents\#update "Direct link to update")

Update specific fields of a stored agent. All fields are optional:

```typescript
const updated = await storedAgent.update({
  name: 'Updated Agent Name',
  instructions: 'New instructions for the agent.',
})
```

```typescript
// Update just the tools
await storedAgent.update({
  tools: { 'new-tool-1': {}, 'new-tool-2': {} },
})

// Update metadata
await storedAgent.update({
  metadata: {
    version: '2.0',
    lastModifiedBy: 'admin',
  },
})
```

### `delete()` [Direct link to delete](https://mastra.ai/reference/client-js/agents\#delete "Direct link to delete")

Delete a stored agent:

```typescript
const result = await storedAgent.delete()
console.log(result.success) // true
```

On this page

- [Getting all agents](https://mastra.ai/reference/client-js/agents#getting-all-agents)
- [Working with a specific agent](https://mastra.ai/reference/client-js/agents#working-with-a-specific-agent)
- [Agent methods](https://mastra.ai/reference/client-js/agents#agent-methods)
  - [`details()`](https://mastra.ai/reference/client-js/agents#details)
  - [`generate()`](https://mastra.ai/reference/client-js/agents#generate)
  - [`stream()`](https://mastra.ai/reference/client-js/agents#stream)
  - [`getTool()`](https://mastra.ai/reference/client-js/agents#gettool)
  - [`executeTool()`](https://mastra.ai/reference/client-js/agents#executetool)
  - [`network()`](https://mastra.ai/reference/client-js/agents#network)
  - [`approveToolCall()`](https://mastra.ai/reference/client-js/agents#approvetoolcall)
  - [`declineToolCall()`](https://mastra.ai/reference/client-js/agents#declinetoolcall)
  - [`approveToolCallGenerate()`](https://mastra.ai/reference/client-js/agents#approvetoolcallgenerate)
  - [`declineToolCallGenerate()`](https://mastra.ai/reference/client-js/agents#declinetoolcallgenerate)
- [Client tools](https://mastra.ai/reference/client-js/agents#client-tools)
- [Stored agents](https://mastra.ai/reference/client-js/agents#stored-agents)
  - [`listStoredAgents()`](https://mastra.ai/reference/client-js/agents#liststoredagents)
  - [`createStoredAgent()`](https://mastra.ai/reference/client-js/agents#createstoredagent)
  - [`getStoredAgent()`](https://mastra.ai/reference/client-js/agents#getstoredagent)
- [Stored agent methods](https://mastra.ai/reference/client-js/agents#stored-agent-methods)
  - [`details()`](https://mastra.ai/reference/client-js/agents#details-1)
  - [`update()`](https://mastra.ai/reference/client-js/agents#update)
  - [`delete()`](https://mastra.ai/reference/client-js/agents#delete)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)

protected by **reCAPTCHA**

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)