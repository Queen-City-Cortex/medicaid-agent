import type { ValidationError } from '@mastra/core/tools';

/**
 * Invokes a Mastra tool's `execute` in tests with proper typing.
 *
 * `createTool` types `execute` as optional and its result as
 * `TOutput | ValidationError | void` (the `void` arm covers tools that
 * suspend instead of returning). Every tool in this package defines `execute`,
 * and these tests always pass schema-valid input, so this helper narrows all
 * three: it throws if `execute` is missing, if it returned nothing, or if input
 * validation failed, and returns the plain output type. Keeping `| void` in the
 * accepted signature is what lets TS infer `TOutput` as the concrete output
 * rather than collapsing it to `void | TOutput`.
 */
export async function runTool<TInput, TOutput, TContext = Record<string, never>>(
  tool: {
    id?: string;
    execute?: (input: TInput, context: TContext) => Promise<TOutput | ValidationError<unknown> | void>;
  },
  input: TInput,
): Promise<TOutput> {
  if (!tool.execute) {
    throw new Error(`Tool ${tool.id ?? '<unknown>'} has no execute function`);
  }
  const result = await tool.execute(input, {} as TContext);
  if (result === undefined) {
    throw new Error(`Tool ${tool.id ?? '<unknown>'} returned no result`);
  }
  if (isValidationError(result)) {
    throw new Error(`Tool ${tool.id ?? '<unknown>'} rejected input: ${result.message}`);
  }
  return result;
}

function isValidationError(value: unknown): value is ValidationError<unknown> {
  return (
    typeof value === 'object'
    && value !== null
    && (value as { error?: unknown }).error === true
    && 'validationErrors' in value
  );
}
