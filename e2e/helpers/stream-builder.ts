/**
 * Programmatic builder for Mastra SSE stream responses.
 *
 * The Mastra client SDK parses streams by splitting on `\n\n`,
 * stripping the `data: ` prefix, and JSON-parsing each frame.
 * The stream ends with `data: [DONE]\n\n`.
 */
export class MastraStreamBuilder {
  private chunks: string[] = [];
  private runId: string;

  constructor(runId?: string) {
    this.runId = runId ?? 'test-run-' + Math.random().toString(36).slice(2, 8);
  }

  /** Emit a text-delta chunk. Text accumulates in the frontend's streamText. */
  textDelta(text: string, id?: string): this {
    this.chunks.push(this.frame({
      type: 'text-delta',
      runId: this.runId,
      from: 'AGENT',
      metadata: {},
      payload: { id: id ?? 'text-1', text },
    }));
    return this;
  }

  /** Emit a tool-call-input-streaming-start chunk. Adds a "running" tool to the timeline. */
  toolStart(toolName: string, toolCallId?: string): this {
    this.chunks.push(this.frame({
      type: 'tool-call-input-streaming-start',
      runId: this.runId,
      from: 'AGENT',
      metadata: {},
      payload: {
        toolCallId: toolCallId ?? `tc-${toolName}`,
        toolName,
      },
    }));
    return this;
  }

  /** Emit a tool-result chunk. Marks the matching tool as "done" in the timeline. */
  toolResult(toolName: string, result: unknown = {}, toolCallId?: string): this {
    this.chunks.push(this.frame({
      type: 'tool-result',
      runId: this.runId,
      from: 'AGENT',
      metadata: {},
      payload: {
        toolCallId: toolCallId ?? `tc-${toolName}`,
        toolName,
        result,
      },
    }));
    return this;
  }

  /** Emit a finish chunk with usage stats. */
  finish(): this {
    this.chunks.push(this.frame({
      type: 'finish',
      runId: this.runId,
      from: 'AGENT',
      metadata: {},
      payload: {
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50 },
      },
    }));
    return this;
  }

  /** Emit the [DONE] marker that signals end of stream. */
  done(): this {
    this.chunks.push('data: [DONE]\n\n');
    return this;
  }

  private frame(obj: Record<string, unknown>): string {
    return `data: ${JSON.stringify(obj)}\n\n`;
  }

  /** Return the full SSE body as a string. */
  toBody(): string {
    return this.chunks.join('');
  }

  /** Build a Playwright route.fulfill() options object. */
  toFulfill(): { status: number; headers: Record<string, string>; body: string } {
    return {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
      },
      body: this.toBody(),
    };
  }
}
