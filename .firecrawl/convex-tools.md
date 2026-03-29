[Skip to main content](https://docs.convex.dev/agents/tools#__docusaurus_skipToContent_fallback)

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
- Tools

Copy as Markdown

Copied!

On this page

# Tools

The Agent component supports tool calls, which are a way to allow an LLM to call
out to external services or functions. This can be useful for:

- Retrieving data from the database
- Writing or updating data in the database
- Searching the web for more context
- Calling an external API
- Requesting that a user takes an action before proceeding (human-in-the-loop)

## Defining tools [​](https://docs.convex.dev/agents/tools\#defining-tools "Direct link to Defining tools")

You can provide tools at different times:

- Agent constructor: (`new Agent(components.agent, { tools: {...} })`)
- Creating a thread: `createThread(ctx, { tools: {...} })`
- Continuing a thread: `continueThread(ctx, { tools: {...} })`
- On thread functions: `thread.generateText({ tools: {...} })`
- Outside of a thread: `supportAgent.generateText(ctx, {}, { tools: {...} })`

Specifying tools at each layer will overwrite the defaults. The tools will be
`args.tools ?? thread.tools ?? agent.options.tools`. This allows you to create
tools in a context that is convenient.

## Using tools [​](https://docs.convex.dev/agents/tools\#using-tools "Direct link to Using tools")

The Agent component will automatically handle passing tool call results back in
and re-generating if you pass `stopWhen: stepCountIs(num)` where `num > 1` to
`generateText` or `streamText`.

The tool call and result will be stored as messages in the thread associated
with the source message. See [Messages](https://docs.convex.dev/agents/messages) for more details.

## Creating a tool with a Convex context [​](https://docs.convex.dev/agents/tools\#creating-a-tool-with-a-convex-context "Direct link to Creating a tool with a Convex context")

There are two ways to create a tool that has access to the Convex context.

1. Use the `createTool` function, which is a wrapper around the AI SDK's `tool`
function.

```ts
export const ideaSearch = createTool({
  description: "Search for ideas in the database",
  args: z.object({ query: z.string().describe("The query to search for") }),
  handler: async (ctx, args, options): Promise<Array<Idea>> => {
    // ctx has agent, userId, threadId, messageId
    // as well as ActionCtx properties like auth, storage, runMutation, and runAction
    const ideas = await ctx.runQuery(api.ideas.searchIdeas, {
      query: args.query,
    });
    console.log("found ideas", ideas);
    return ideas;
  },
});
```

2. Define tools at runtime in a context with the variables you want to use.

```ts
async function createTool(ctx: ActionCtx, teamId: Id<"teams">) {
  const myTool = tool({
    description: "My tool",
    parameters: z.object({...}).describe("The arguments for the tool"),
    execute: async (args, options): Promise<BarReturnType> => {
      return await ctx.runQuery(internal.foo.bar, args);
    },
  });
}
```

In both cases, the args and options match the underlying AI SDK's `tool`
function.

If you run into type errors, ensure you're annotating the return type of the
execute function, and if necessary, the return type of the `handler`s of any
functions you call with `ctx.run*`.

Note: it's highly recommended to use zod with `.describe` to provide details
about each parameter. This will be used to provide a description of the tool to
the LLM.

### Adding custom context to tools [​](https://docs.convex.dev/agents/tools\#adding-custom-context-to-tools "Direct link to Adding custom context to tools")

It's often useful to have extra metadata in the context of a tool.

By default, the context passed to a tool is a `ToolCtx` with:

- `agent` \- the Agent instance calling it
- `userId` \- the user ID associated with the call, if any
- `threadId` \- the thread ID, if any
- `messageId` \- the message ID of the prompt message passed to generate/stream.
- Everything in `ActionCtx`, such as `auth`, `storage`, `runQuery`, etc. Note:
in scheduled functions, workflows, etc, the auth user will be `null`.

To add more fields to the context, you can pass a custom context to the call,
such as `agent.generateText({ ...ctx, orgId: "123" })`.

You can enforce the type of the context by passing a type when constructing the
Agent.

```ts
const myAgent = new Agent<{ orgId: string }>(...);
```

Then, in your tools, you can use the `orgId` field.

```ts
type MyCtx = ToolCtx & { orgId: string };

const myTool = createTool({
  args: z.object({ ... }),
  description: "...",
  handler: async (ctx: MyCtx, args) => {
    // use ctx.orgId
  },
});
```

## Using an LLM or Agent as a tool [​](https://docs.convex.dev/agents/tools\#using-an-llm-or-agent-as-a-tool "Direct link to Using an LLM or Agent as a tool")

You can do generation within a tool call, for instance if you wanted one Agent
to ask another Agent a question.

Note: you don't have to structure agents calling each other as tool calls. You
could instead decide which Agent should respond next based on other context and
have many Agents contributing in the same thread.

The simplest way to model Agents as tool calls is to have each tool call work in
an independent thread, or do generation without a thread at all. Then, the
output is returned as the tool call result for the next LLM step to use. When
you do it this way, you **don't** need to explicitly save the tool call result
to the parent thread.

### Direct LLM generation without a thread: [​](https://docs.convex.dev/agents/tools\#direct-llm-generation-without-a-thread "Direct link to Direct LLM generation without a thread:")

```ts
const llmTool = createTool({
  description: "Ask a question to some LLM",
  args: z.object({
    message: z.string().describe("The message to ask the LLM"),
  }),
  handler: async (ctx, args): Promise<string> => {
    const result = await generateText({
      system: "You are a helpful assistant.",
      // Pass through all messages from the current generation
      prompt: [...options.messages, { role: "user", content: args.message }],
      model: myLanguageModel,
    });
    return result.text;
  },
});
```

### Using an Agent as a tool [​](https://docs.convex.dev/agents/tools\#using-an-agent-as-a-tool "Direct link to Using an Agent as a tool")

```ts
const agentTool = createTool({
  description: `Ask a question to agent ${agent.name}`,
  args: z.object({
    message: z.string().describe("The message to ask the agent"),
  }),
  handler: async (ctx, args, options): Promise<string> => {
    const { userId } = ctx;
    const { thread } = await agent.createThread(ctx, { userId });
    const result = await thread.generateText(
      {
        // Pass through all messages from the current generation
        prompt: [...options.messages, { role: "user", content: args.message }],
      },
      // Save all the messages from the current generation to this thread.
      { storageOptions: { saveMessages: "all" } },
    );
    // Optionally associate the child thread with the parent thread in your own
    // tables.
    await saveThreadAsChild(ctx, ctx.threadId, thread.threadId);
    return result.text;
  },
});
```

[Previous\\
\\
Playground](https://docs.convex.dev/agents/playground) [Next\\
\\
LLM Context](https://docs.convex.dev/agents/context)

- [Defining tools](https://docs.convex.dev/agents/tools#defining-tools)
- [Using tools](https://docs.convex.dev/agents/tools#using-tools)
- [Creating a tool with a Convex context](https://docs.convex.dev/agents/tools#creating-a-tool-with-a-convex-context)
  - [Adding custom context to tools](https://docs.convex.dev/agents/tools#adding-custom-context-to-tools)
- [Using an LLM or Agent as a tool](https://docs.convex.dev/agents/tools#using-an-llm-or-agent-as-a-tool)
  - [Direct LLM generation without a thread:](https://docs.convex.dev/agents/tools#direct-llm-generation-without-a-thread)
  - [Using an Agent as a tool](https://docs.convex.dev/agents/tools#using-an-agent-as-a-tool)

We use third-party cookies to understand how people interact with our site.

See our [Privacy Policy](https://www.convex.dev/legal/privacy/) to learn more.

DeclineAccept

reCAPTCHA

Recaptcha requires verification.

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)

protected by **reCAPTCHA**

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)