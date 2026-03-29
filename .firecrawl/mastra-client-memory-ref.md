[Skip to main content](https://mastra.ai/reference/client-js/memory#__docusaurus_skipToContent_fallback)

Copy markdown

On this page

The Memory API provides methods to manage conversation threads and message history in Mastra.

## Get all threads [Direct link to Get all threads](https://mastra.ai/reference/client-js/memory\#get-all-threads "Direct link to Get all threads")

Retrieve all memory threads for a specific resource:

```typescript
const threads = await mastraClient.listMemoryThreads({
  resourceId: 'resource-1',
  agentId: 'agent-1', // Optional - can be omitted if storage is configured
})
```

When `agentId` is omitted and storage is configured on the server, threads will be retrieved using storage directly. This is useful when multiple agents share the same threads (e.g., in workflows with multiple agent steps).

## Create a new thread [Direct link to Create a new thread](https://mastra.ai/reference/client-js/memory\#create-a-new-thread "Direct link to Create a new thread")

Create a new memory thread:

```typescript
const thread = await mastraClient.createMemoryThread({
  title: 'New Conversation',
  metadata: { category: 'support' },
  resourceId: 'resource-1',
  agentId: 'agent-1',
})
```

## Working with a specific thread [Direct link to Working with a specific thread](https://mastra.ai/reference/client-js/memory\#working-with-a-specific-thread "Direct link to Working with a specific thread")

Get an instance of a specific memory thread:

```typescript
const thread = mastraClient.getMemoryThread({ threadId: 'thread-id', agentId: 'agent-id' })
```

## Thread methods [Direct link to Thread methods](https://mastra.ai/reference/client-js/memory\#thread-methods "Direct link to Thread methods")

### Get Thread Details [Direct link to Get Thread Details](https://mastra.ai/reference/client-js/memory\#get-thread-details "Direct link to Get Thread Details")

Retrieve details about a specific thread:

```typescript
const details = await thread.get()
```

### Update Thread [Direct link to Update Thread](https://mastra.ai/reference/client-js/memory\#update-thread "Direct link to Update Thread")

Update thread properties:

```typescript
const updated = await thread.update({
  title: 'Updated Title',
  metadata: { status: 'resolved' },
  resourceId: 'resource-1',
})
```

### Delete Thread [Direct link to Delete Thread](https://mastra.ai/reference/client-js/memory\#delete-thread "Direct link to Delete Thread")

Delete a thread and its messages:

```typescript
await thread.delete()
```

### Clone Thread [Direct link to Clone Thread](https://mastra.ai/reference/client-js/memory\#clone-thread "Direct link to Clone Thread")

Create a copy of a thread with all its messages:

```typescript
const { thread: clonedThread, clonedMessages } = await thread.clone()
```

Clone with options:

```typescript
const { thread: clonedThread, clonedMessages } = await thread.clone({
  newThreadId: 'custom-clone-id',
  title: 'Cloned Conversation',
  metadata: { branch: 'experiment-1' },
  options: {
    messageLimit: 10, // Only clone last 10 messages
  },
})
```

Clone with message filtering:

```typescript
const { thread: clonedThread } = await thread.clone({
  options: {
    messageFilter: {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
    },
  },
})
```

The clone response includes:

- `thread`: The newly created cloned thread with clone metadata
- `clonedMessages`: Array of the cloned messages with new IDs

## Message operations [Direct link to Message operations](https://mastra.ai/reference/client-js/memory\#message-operations "Direct link to Message operations")

### Save Messages [Direct link to Save Messages](https://mastra.ai/reference/client-js/memory\#save-messages "Direct link to Save Messages")

Save messages to memory:

```typescript
const result = await mastraClient.saveMessageToMemory({
  messages: [\
    {\
      role: 'user',\
      content: 'Hello!',\
      id: '1',\
      threadId: 'thread-1',\
      resourceId: 'resource-1',\
      createdAt: new Date(),\
      format: 2,\
    },\
  ],
  agentId: 'agent-1',
})

// result.messages contains the saved messages
console.log(result.messages)
```

### Retrieve Thread Messages [Direct link to Retrieve Thread Messages](https://mastra.ai/reference/client-js/memory\#retrieve-thread-messages "Direct link to Retrieve Thread Messages")

Get messages associated with a memory thread:

```typescript
// Get all messages in the thread (paginated)
const result = await thread.listMessages()
console.log(result.messages) // Array of messages
console.log(result.total) // Total count
console.log(result.hasMore) // Whether more pages exist

// Get messages with pagination
const result = await thread.listMessages({
  page: 0,
  perPage: 20,
})

// Get messages with ordering
const result = await thread.listMessages({
  orderBy: { field: 'createdAt', direction: 'ASC' },
})
```

### Delete Messages [Direct link to Delete Messages](https://mastra.ai/reference/client-js/memory\#delete-messages "Direct link to Delete Messages")

Delete one or more messages from a thread:

```typescript
// Delete a single message
const result = await thread.deleteMessages('message-id')

// Delete multiple messages
const result = await thread.deleteMessages(['message-1', 'message-2', 'message-3'])

// Returns: { success: true, message: "Message deleted successfully" }
```

## Working memory [Direct link to Working memory](https://mastra.ai/reference/client-js/memory\#working-memory "Direct link to Working memory")

Working memory allows agents to maintain persistent information about users across interactions. It can be scoped to either a specific thread or across all threads for a resource (user).

### Get Working Memory [Direct link to Get Working Memory](https://mastra.ai/reference/client-js/memory\#get-working-memory "Direct link to Get Working Memory")

Retrieve the current working memory for a thread:

```typescript
const workingMemory = await mastraClient.getWorkingMemory({
  agentId: 'agent-1',
  threadId: 'thread-1',
  resourceId: 'user-123', // Optional, required for resource-scoped memory
})
```

The response includes:

- `workingMemory`: The current working memory content (string or null)
- `source`: Whether the memory is from `"thread"` or `"resource"` scope
- `workingMemoryTemplate`: The template used for working memory (if configured)
- `threadExists`: Whether the thread exists

### Update Working Memory [Direct link to Update Working Memory](https://mastra.ai/reference/client-js/memory\#update-working-memory "Direct link to Update Working Memory")

Update the working memory content for a thread:

```typescript
await mastraClient.updateWorkingMemory({
  agentId: 'agent-1',
  threadId: 'thread-1',
  workingMemory: `# User Profile
- Name: John Doe
- Location: New York
- Preferences: Prefers formal communication
`,
  resourceId: 'user-123', // Optional, required for resource-scoped memory
})

// Returns: { success: true }
```

**Note:** For resource-scoped working memory, you must provide the `resourceId` parameter. This allows the memory to persist across all conversation threads for that user.

### Get Memory Status [Direct link to Get Memory Status](https://mastra.ai/reference/client-js/memory\#get-memory-status "Direct link to Get Memory Status")

Check the status of the memory system:

```typescript
const status = await mastraClient.getMemoryStatus('agent-id')
```

On this page

- [Get all threads](https://mastra.ai/reference/client-js/memory#get-all-threads)
- [Create a new thread](https://mastra.ai/reference/client-js/memory#create-a-new-thread)
- [Working with a specific thread](https://mastra.ai/reference/client-js/memory#working-with-a-specific-thread)
- [Thread methods](https://mastra.ai/reference/client-js/memory#thread-methods)
  - [Get Thread Details](https://mastra.ai/reference/client-js/memory#get-thread-details)
  - [Update Thread](https://mastra.ai/reference/client-js/memory#update-thread)
  - [Delete Thread](https://mastra.ai/reference/client-js/memory#delete-thread)
  - [Clone Thread](https://mastra.ai/reference/client-js/memory#clone-thread)
- [Message operations](https://mastra.ai/reference/client-js/memory#message-operations)
  - [Save Messages](https://mastra.ai/reference/client-js/memory#save-messages)
  - [Retrieve Thread Messages](https://mastra.ai/reference/client-js/memory#retrieve-thread-messages)
  - [Delete Messages](https://mastra.ai/reference/client-js/memory#delete-messages)
- [Working memory](https://mastra.ai/reference/client-js/memory#working-memory)
  - [Get Working Memory](https://mastra.ai/reference/client-js/memory#get-working-memory)
  - [Update Working Memory](https://mastra.ai/reference/client-js/memory#update-working-memory)
  - [Get Memory Status](https://mastra.ai/reference/client-js/memory#get-memory-status)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)

protected by **reCAPTCHA**

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)