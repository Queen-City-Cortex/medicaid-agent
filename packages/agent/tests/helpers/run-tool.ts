import type { ValidationError } from '@mastra/core/tools';

/**
 * Invokes a Mastra tool's `execute` in tests with proper typing.
 *
 * `createTool` types `execute` as optional and its result as
 * `TOutput | ValidationError`. Every tool in this package defines `execute`,
 * and these tests always pass schema-valid input, so this helper narrows both:
 * it throws if `execute` is missing or if input validation failed, and returns
 * the plain output type.
 */
export async function runTool<TInput, TOutput, TContext = Record<string, never>>(
  tool: {
    id?: string;
    execute?: (input: TInput, context: TContext) => Promise<TOutput | ValidationError<unknown>>;
  },
  input: TInput,
): Promise<TOutput> {
  if (!tool.execute) {
    throw new Error(`Tool ${tool.id ?? '<unknown>'} has no execute function`);
  }
  const result = await tool.execute(input, {} as TContext);
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
