[Skip to main content](https://docs.convex.dev/agents/threads#__docusaurus_skipToContent_fallback)

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

- [Home](https://docs.convex.dev/)
- [Agents](https://docs.convex.dev/agents)
- Threads

Copy as Markdown

Copied!

On this page

# Threads

Threads are a way to group messages together in a linear history. All messages
saved in the Agent component are associated with a thread. When a message is
generated based on a prompt, it saves the user message and generated agent
message(s) automatically.

Threads can be associated with a user, and messages can each individually be
associated with a user. By default, messages are associated with the thread's
user.

## Creating a thread [​](https://docs.convex.dev/agents/threads\#creating-a-thread "Direct link to Creating a thread")

You can create a thread in a mutation or action. If you create it in an action,
it will also return a `thread` (see below) and you can start calling LLMs and
generating messages. If you specify a userId, the thread will be associated with
that user and messages will be saved to the user's history.

```ts
import { createThread } from "@convex-dev/agent";

const threadId = await createThread(ctx, components.agent);
```

You may also pass in metadata to set on the thread:

```ts
const userId = await getAuthUserId(ctx);
const threadId = await createThread(ctx, components.agent, {
  userId,
  title: "My thread",
  summary: "This is a summary of the thread",
});
```

Metadata may be provided as context to the agent automatically in the future,
but for now it's a convenience that helps organize threads in the
[Playground](https://docs.convex.dev/agents/playground).

## Generating a message in a thread [​](https://docs.convex.dev/agents/threads\#generating-a-message-in-a-thread "Direct link to Generating a message in a thread")

You can generate a message in a thread via the agent functions:
`agent.generateText`, `agent.generateObject`, `agent.streamText`, and
`agent.streamObject`. Any agent can generate a message in a thread created by
any other agent.

```ts
const agent = new Agent(components.agent, { languageModel, instructions });

export const generateReplyToPrompt = action({
  args: { prompt: v.string(), threadId: v.string() },
  handler: async (ctx, { prompt, threadId }) => {
    // await authorizeThreadAccess(ctx, threadId);
    const result = await agent.generateText(ctx, { threadId }, { prompt });
    return result.text;
  },
});
```

See [Messages](https://docs.convex.dev/agents/messages) for more details on creating and saving messages.

## Continuing a thread using the `thread` object from `agent.continueThread` [​](https://docs.convex.dev/agents/threads\#continuing-a-thread-using-the-thread-object-from-agentcontinuethread "Direct link to continuing-a-thread-using-the-thread-object-from-agentcontinuethread")

You can also continue a thread by creating an agent-specific `thread` object,
either when calling `agent.createThread` or `agent.continueThread` from within
an action. This allows calling methods without specifying those parameters each
time.

```ts
const { thread } = await agent.continueThread(ctx, { threadId });
const result = await thread.generateText({ prompt });
```

The `thread` from `continueThread` or `createThread` (available in actions only)
is a `Thread` object, which has convenience methods that are thread-specific:

- `thread.getMetadata()` to get the `userId`, `title`, `summary` etc.
- `thread.updateMetadata({ patch: { title, summary, userId} })` to update the
metadata
- `thread.generateText({ prompt, ... })` \- equivalent to
`agent.generateText(ctx, { threadId }, { prompt, ... })`
- `thread.streamText({ prompt, ... })` \- equivalent to
`agent.streamText(ctx, { threadId }, { prompt, ... })`
- `thread.generateObject({ prompt, ... })` \- equivalent to
`agent.generateObject(ctx, { threadId }, { prompt, ... })`
- `thread.streamObject({ prompt, ... })` \- equivalent to
`agent.streamObject(ctx, { threadId }, { prompt, ... })`

See [Messages docs](https://docs.convex.dev/agents/messages) for more details on generating messages.

## Deleting threads [​](https://docs.convex.dev/agents/threads\#deleting-threads "Direct link to Deleting threads")

You can delete threads by their `threadId`.

Asynchronously (from a mutation or action):

```ts
await agent.deleteThreadAsync(ctx, { threadId });
```

Synchronously in batches (from an action):

```ts
await agent.deleteThreadSync(ctx, { threadId });
```

You can also delete all threads by a user by their `userId`.

```ts
await agent.deleteThreadsByUserId(ctx, { userId });
```

## Getting all threads owned by a user [​](https://docs.convex.dev/agents/threads\#getting-all-threads-owned-by-a-user "Direct link to Getting all threads owned by a user")

```ts
const threads = await ctx.runQuery(
  components.agent.threads.listThreadsByUserId,
  { userId, paginationOpts: args.paginationOpts },
);
```

## Deleting all threads and messages associated with a user [​](https://docs.convex.dev/agents/threads\#deleting-all-threads-and-messages-associated-with-a-user "Direct link to Deleting all threads and messages associated with a user")

Asynchronously (from a mutation or action):

```ts
await ctx.runMutation(components.agent.users.deleteAllForUserIdAsync, {
  userId,
});
```

Synchronously (from an action):

```ts
await ctx.runMutation(components.agent.users.deleteAllForUserId, { userId });
```

## Getting messages in a thread [​](https://docs.convex.dev/agents/threads\#getting-messages-in-a-thread "Direct link to Getting messages in a thread")

See [messages.mdx](https://docs.convex.dev/agents/messages) for more details.

```ts
import { listMessages } from "@convex-dev/agent";

const messages = await listMessages(ctx, components.agent, {
  threadId,
  excludeToolMessages: true,
  paginationOpts: { cursor: null, numItems: 10 }, // null means start from the beginning
});
```

Or for the UIMessage type (easier for rendering UIs):

```ts
import { listUIMessages } from "@convex-dev/agent";

const messages = await listUIMessages(ctx, components.agent, {
  threadId,
  paginationOpts: { cursor: null, numItems: 10 },
});
```

[Previous\\
\\
Agent Usage](https://docs.convex.dev/agents/agent-usage) [Next\\
\\
Messages](https://docs.convex.dev/agents/messages)

- [Creating a thread](https://docs.convex.dev/agents/threads#creating-a-thread)
- [Generating a message in a thread](https://docs.convex.dev/agents/threads#generating-a-message-in-a-thread)
- [Continuing a thread using the `thread` object from `agent.continueThread`](https://docs.convex.dev/agents/threads#continuing-a-thread-using-the-thread-object-from-agentcontinuethread)
- [Deleting threads](https://docs.convex.dev/agents/threads#deleting-threads)
- [Getting all threads owned by a user](https://docs.convex.dev/agents/threads#getting-all-threads-owned-by-a-user)
- [Deleting all threads and messages associated with a user](https://docs.convex.dev/agents/threads#deleting-all-threads-and-messages-associated-with-a-user)
- [Getting messages in a thread](https://docs.convex.dev/agents/threads#getting-messages-in-a-thread)

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept

reCAPTCHA

Recaptcha requires verification.

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)

protected by **reCAPTCHA**

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)