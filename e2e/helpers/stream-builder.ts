/**
 * Programmatic builder for AI SDK UIMessageStream responses.
 *
 * The AI SDK parses streams line-by-line. Each line has a single-character
 * prefix followed by a colon, then JSON:
 *   f: — format/start (contains messageId)
 *   0: — text delta (JSON-encoded string)
 *   b: — tool call begin (toolCallId, toolName, args)
 *   a: — tool result (toolCallId, result)
 *   e: — step finish (finishReason, usage, isContinued)
 *   d: — done/finish (finishReason, usage)
 */
export class AISdkStreamBuilder {
  private chunks: string[] = [];
  private messageId: string;

  constructor(messageId?: string) {
    this.messageId = messageId ?? 'msg-' + Math.random().toString(36).slice(2, 8);
  }

  /** Emit the format/start line with the messageId. */
  start(): this {
    this.chunks.push(`f:${JSON.stringify({ messageId: this.messageId })}\n`);
    return this;
  }

  /** Emit a text delta chunk. Text accumulates in the frontend. */
  textDelta(text: string): this {
    this.chunks.push(`0:${JSON.stringify(text)}\n`);
    return this;
  }

  /** Emit a tool call begin chunk. */
  toolCall(toolName: string, toolCallId: string, args?: unknown): this {
    this.chunks.push(`b:${JSON.stringify({ toolCallId, toolName, args: args ?? {} })}\n`);
    return this;
  }

  /** Emit a tool result chunk. */
  toolResult(toolCallId: string, result?: unknown): this {
    this.chunks.push(`a:${JSON.stringify({ toolCallId, result: result ?? {} })}\n`);
    return this;
  }

  /** Emit a step finish chunk. */
  stepFinish(finishReason?: string): this {
    this.chunks.push(`e:${JSON.stringify({
      finishReason: finishReason ?? 'stop',
      usage: { promptTokens: 100, completionTokens: 50 },
      isContinued: false,
    })}\n`);
    return this;
  }

  /** Emit the done/finish chunk that signals end of stream. */
  finish(): this {
    this.chunks.push(`d:${JSON.stringify({
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50 },
    })}\n`);
    return this;
  }

  /** Return the full stream body as a string. */
  toBody(): string {
    return this.chunks.join('');
  }

  /** Build a Playwright route.fulfill() options object. */
  toFulfill(): { status: number; headers: Record<string, string>; body: string } {
    return {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-vercel-ai-ui-message-stream': 'v1',
      },
      body: this.toBody(),
    };
  }
}
