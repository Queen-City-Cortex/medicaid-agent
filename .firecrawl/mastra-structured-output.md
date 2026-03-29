We use tracking cookies to understand how you use the product and help us improve it. Please accept cookies to help us improve.

Accept cookiesDecline cookies

[Skip to main content](https://mastra.ai/docs/agents/structured-output#__docusaurus_skipToContent_fallback)

Copy markdown

On this page

Structured output lets an agent return an object that matches the shape defined by a schema instead of returning text. The schema tells the model what fields to produce, and the model ensures the final result fits that shape.

## When to use structured output [Direct link to When to use structured output](https://mastra.ai/docs/agents/structured-output\#when-to-use-structured-output "Direct link to When to use structured output")

Use structured output when you need an agent to return a data object rather than text. Having well defined fields can make it simpler to pull out the values you need for API calls, UI rendering, or application logic.

## Define schemas [Direct link to Define schemas](https://mastra.ai/docs/agents/structured-output\#define-schemas "Direct link to Define schemas")

Agents can return structured data by defining the expected output with either [Zod](https://zod.dev/) or [JSON Schema](https://json-schema.org/). Zod is recommended because it provides TypeScript type inference and runtime validation, while JSON Schema is useful when you need a language agnostic format.

- Zod
- JSON Schema

Define the `output` shape using [Zod](https://zod.dev/):

```typescript
import { z } from 'zod'

const response = await testAgent.generate('Help me plan my day.', {
  structuredOutput: {
    schema: z.array(
      z.object({
        name: z.string(),
        activities: z.array(z.string()),
      }),
    ),
  },
})

console.log(response.object)
```

You can also use JSON Schema to define your output structure:

```typescript
const response = await testAgent.generate('Help me plan my day.', {
  structuredOutput: {
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          activities: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['name', 'activities'],
      },
    },
  },
})

console.log(response.object)
```

note

Visit [`.generate()`](https://mastra.ai/reference/agents/generate) for a full list of configuration options.

**Example output:** The `response.object` will contain the structured data as defined by the schema.

```json
[\
  {\
    "name": "Morning Routine",\
    "activities": ["Wake up at 7am", "Exercise", "Shower", "Breakfast"]\
  },\
  {\
    "name": "Work",\
    "activities": ["Check emails", "Team meeting", "Lunch break"]\
  },\
  {\
    "name": "Evening",\
    "activities": ["Dinner", "Relax", "Read a book", "Sleep by 10pm"]\
  }\
]
```

## Stream structured output [Direct link to Stream structured output](https://mastra.ai/docs/agents/structured-output\#stream-structured-output "Direct link to Stream structured output")

Streaming also supports structured output. The final structured object is available on `stream.fullStream` and after the stream completes on `stream.object`. Text stream chunks are still emitted, but they contain natural language text rather than structured data.

```typescript
import { z } from 'zod'

const stream = await testAgent.stream('Help me plan my day.', {
  structuredOutput: {
    schema: z.array(
      z.object({
        name: z.string(),
        activities: z.array(z.string()),
      }),
    ),
  },
})

for await (const chunk of stream.fullStream) {
  if (chunk.type === 'object-result') {
    console.log('\n', JSON.stringify(chunk, null, 2))
  }
  process.stdout.write(JSON.stringify(chunk))
}

console.log(await stream.object)

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk)
}
```

## Structuring agent [Direct link to Structuring agent](https://mastra.ai/docs/agents/structured-output\#structuring-agent "Direct link to Structuring agent")

When your main agent isn't proficient at creating structured output you can provide a `model` to `structuredOutput`. In this case, Mastra uses a second agent under the hood to extract structured data from the main agent's natural language response. This makes two LLM calls, one to generate the response and another to turn that response into the structured object, which adds some latency and cost but can improve accuracy for complex structuring tasks.

```typescript
import { z } from 'zod'

const response = await testAgent.generate('Analyze the TypeScript programming language.', {
  structuredOutput: {
    schema: z.object({
      overview: z.string(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      useCases: z.array(
        z.object({
          scenario: z.string(),
          reasoning: z.string(),
        }),
      ),
      comparison: z.object({
        similarTo: z.array(z.string()),
        differentiators: z.array(z.string()),
      }),
    }),
    model: 'openai/gpt-5.4',
  },
})

console.log(response.object)
```

## Combine tools and structured output [Direct link to Combine tools and structured output](https://mastra.ai/docs/agents/structured-output\#combine-tools-and-structured-output "Direct link to Combine tools and structured output")

When an agent has both tools and structured output configured, some models may not support using both features together. This is a limitation of the underlying model APIs, not Mastra itself.

If your tools aren't being called when structured output is enabled, or you receive an error when combining both features, try one of the workarounds below.

### Workaround options [Direct link to Workaround options](https://mastra.ai/docs/agents/structured-output\#workaround-options "Direct link to Workaround options")

When your model doesn't support tools and structured output together, you have three options:

1. **Use `jsonPromptInjection: true`** \- Injects the schema into the prompt instead of using the API's `response_format` parameter
2. **Use a separate structuring model** \- Pass a `model` to `structuredOutput` to use a second LLM for structuring
3. **Use `prepareStep`** \- Handle tools and structured output in separate steps

Each approach is detailed in the sections below.

## LLM structured output support [Direct link to LLM structured output support](https://mastra.ai/docs/agents/structured-output\#llm-structured-output-support "Direct link to LLM structured output support")

Structured output support varies across LLMs due to differences in their APIs. The sections below cover workarounds for models that don't fully support structured output or combining it with tools.

### `jsonPromptInjection` [Direct link to jsonpromptinjection](https://mastra.ai/docs/agents/structured-output\#jsonpromptinjection "Direct link to jsonpromptinjection")

By default, Mastra passes the schema to the model provider using the `response_format` API parameter. Most model providers have built-in support for this, which reliably enforces the schema.

If your model provider doesn't support `response_format`, you'll get an error from the API. When this happens, set `jsonPromptInjection: true`. This adds the schema to the system prompt instead, instructing the model to output JSON. This is less reliable than the API parameter approach.

```typescript
import { z } from 'zod'

const response = await testAgent.generate('Help me plan my day.', {
  structuredOutput: {
    schema: z.array(
      z.object({
        name: z.string(),
        activities: z.array(z.string()),
      }),
    ),
    jsonPromptInjection: true,
  },
})

console.log(response.object)
```

Gemini 2.5 with tools

Gemini 2.5 models don't support combining `response_format` (structured output) with function calling (tools) in the same API call. If your agent has tools and you're using `structuredOutput` with a Gemini 2.5 model, you must set `jsonPromptInjection: true` to avoid the error `Function calling with a response mime type: 'application/json' is unsupported`.

```typescript
const response = await agentWithTools.generate('Your prompt', {
  structuredOutput: {
    schema: yourSchema,
    jsonPromptInjection: true, // Required for Gemini 2.5 when tools are present
  },
})
```

### Use a separate structuring model [Direct link to Use a separate structuring model](https://mastra.ai/docs/agents/structured-output\#use-a-separate-structuring-model "Direct link to Use a separate structuring model")

When `model` is provided to the `structuredOutput` property, Mastra uses a separate internal agent to handle the structured output. The main agent will handle all of the steps (including tool calling) and the structured output model will handle only the generation of structured output.

```typescript
const response = await testAgent.generate('Tell me about TypeScript.', {
  structuredOutput: {
    schema: yourSchema,
    model: 'openai/gpt-5.4',
  },
})
```

### Multi-step approach with `prepareStep` [Direct link to multi-step-approach-with-preparestep](https://mastra.ai/docs/agents/structured-output\#multi-step-approach-with-preparestep "Direct link to multi-step-approach-with-preparestep")

For models that don't support tools and structured outputs together, you can use `prepareStep` to handle them in separate steps.

```typescript
const result = await agent.stream('weather in vancouver?', {
  prepareStep: async ({ stepNumber }) => {
    if (stepNumber === 0) {
      return {
        model: 'openai/gpt-5.4',
        tools: {
          weatherTool,
        },
        toolChoice: 'required',
      }
    }
    return {
      model: 'openai/gpt-5.4',
      tools: undefined,
      structuredOutput: {
        schema: z.object({
          temperature: z.number(),
          humidity: z.number(),
          windSpeed: z.number(),
        }),
      },
    }
  },
})
```

## Handle errors [Direct link to Handle errors](https://mastra.ai/docs/agents/structured-output\#handle-errors "Direct link to Handle errors")

When schema validation fails, you can control how errors are handled using `errorStrategy`. The default `strict` strategy throws an error, while `warn` logs a warning and continues. The `fallback` strategy returns the values provided using `fallbackValue`.

```typescript
const response = await testAgent.generate('Tell me about TypeScript.', {
  structuredOutput: {
    schema: z.object({
      summary: z.string(),
      keyFeatures: z.array(z.string()),
    }),
    errorStrategy: 'fallback',
    fallbackValue: {
      summary: 'TypeScript is a typed superset of JavaScript',
      keyFeatures: ['Static typing', 'Compiles to JavaScript', 'Better tooling'],
    },
  },
})

console.log(response.object)
```

On this page

- [When to use structured output](https://mastra.ai/docs/agents/structured-output#when-to-use-structured-output)
- [Define schemas](https://mastra.ai/docs/agents/structured-output#define-schemas)
- [Stream structured output](https://mastra.ai/docs/agents/structured-output#stream-structured-output)
- [Structuring agent](https://mastra.ai/docs/agents/structured-output#structuring-agent)
- [Combine tools and structured output](https://mastra.ai/docs/agents/structured-output#combine-tools-and-structured-output)
  - [Workaround options](https://mastra.ai/docs/agents/structured-output#workaround-options)
- [LLM structured output support](https://mastra.ai/docs/agents/structured-output#llm-structured-output-support)
  - [`jsonPromptInjection`](https://mastra.ai/docs/agents/structured-output#jsonpromptinjection)
  - [Use a separate structuring model](https://mastra.ai/docs/agents/structured-output#use-a-separate-structuring-model)
  - [Multi-step approach with `prepareStep`](https://mastra.ai/docs/agents/structured-output#multi-step-approach-with-preparestep)
- [Handle errors](https://mastra.ai/docs/agents/structured-output#handle-errors)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)

protected by **reCAPTCHA**

[Privacy](https://www.google.com/intl/en/policies/privacy/) \- [Terms](https://www.google.com/intl/en/policies/terms/)