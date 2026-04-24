/**
 * Programmatic builder for AI SDK v6 UIMessageStream (SSE) responses.
 *
 * AI SDK v6 uses Server-Sent Events where each `data:` line contains a JSON
 * object with a `type` field matching the UIMessageChunk schema:
 *
 *   start         — begins a message (contains messageId)
 *   start-step    — begins a step
 *   text-start    — begins a text block (requires id)
 *   text-delta    — text content delta (requires id + delta)
 *   text-end      — ends a text block (requires id)
 *   tool-input-available  — tool call with input ready
 *   tool-output-available — tool result
 *   finish-step   — ends a step
 *   finish        — ends the message
 */
export class AISdkStreamBuilder {
  private events: string[] = [];
  private messageId: string;
  private textCounter = 0;
  private inTextBlock = false;
  private currentTextId = '';

  constructor(messageId?: string) {
    this.messageId = messageId ?? 'msg-' + Math.random().toString(36).slice(2, 8);
  }

  private sse(data: object): void {
    this.events.push(`data: ${JSON.stringify(data)}\n\n`);
  }

  private endTextBlock(): void {
    if (this.inTextBlock) {
      this.sse({ type: 'text-end', id: this.currentTextId });
      this.inTextBlock = false;
    }
  }

  private ensureTextBlock(): void {
    if (!this.inTextBlock) {
      this.textCounter++;
      this.currentTextId = `text-${this.textCounter}`;
      this.sse({ type: 'text-start', id: this.currentTextId });
      this.inTextBlock = true;
    }
  }

  /** Emit the start event with messageId, plus start-step. */
  start(): this {
    this.sse({ type: 'start', messageId: this.messageId });
    this.sse({ type: 'start-step' });
    return this;
  }

  /** Emit a text delta chunk. Automatically wraps in text-start/text-end. */
  textDelta(text: string): this {
    this.ensureTextBlock();
    this.sse({ type: 'text-delta', id: this.currentTextId, delta: text });
    return this;
  }

  /** Emit a tool call (input available). Ends any open text block first. */
  toolCall(toolName: string, toolCallId: string, args?: unknown): this {
    this.endTextBlock();
    this.sse({
      type: 'tool-input-available',
      toolCallId,
      toolName,
      input: args ?? {},
    });
    return this;
  }

  /** Emit a tool result (output available). */
  toolResult(toolCallId: string, result?: unknown): this {
    this.sse({
      type: 'tool-output-available',
      toolCallId,
      output: result ?? {},
    });
    return this;
  }

  /** Emit finish-step. Ends any open text block first. */
  stepFinish(): this {
    this.endTextBlock();
    this.sse({ type: 'finish-step' });
    return this;
  }

  /** Emit the finish event that signals end of stream. */
  finish(): this {
    this.sse({ type: 'finish', finishReason: 'stop' });
    return this;
  }

  /** Return the full SSE body as a string. */
  toBody(): string {
    return this.events.join('');
  }

  /** Build a Playwright route.fulfill() options object. */
  toFulfill(): { status: number; headers: Record<string, string>; body: string } {
    return {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'x-vercel-ai-ui-message-stream': 'v1',
      },
      body: this.toBody(),
    };
  }
}
