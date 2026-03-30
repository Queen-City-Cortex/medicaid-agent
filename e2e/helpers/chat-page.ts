import type { Page, Locator } from '@playwright/test';

/**
 * Page object for the /chat page. Isolates selectors so UI changes
 * only need updating in one place.
 */
export class ChatPage {
  readonly input: Locator;
  readonly sendButton: Locator;
  readonly emptyHeading: Locator;
  readonly exampleCards: Locator;
  readonly startingResearch: Locator;

  constructor(private page: Page) {
    this.input = page.getByTestId('chat-input');
    this.sendButton = page.getByTestId('send-button');
    this.emptyHeading = page.getByTestId('empty-state');
    this.exampleCards = page.getByTestId('example-card');
    this.startingResearch = page.getByTestId('loading-indicator');
  }

  /** Navigate to the chat page. */
  async goto() {
    await this.page.goto('/chat');
  }

  /** Type a question and click Send. */
  async sendMessage(text: string) {
    await this.input.fill(text);
    await this.sendButton.click();
  }

  /** Wait for an assistant message to appear, optionally matching text. */
  async waitForAssistantMessage(match?: string | RegExp): Promise<Locator> {
    const msg = this.page.getByTestId('assistant-message').last();
    if (match) {
      await msg.filter({ hasText: match }).waitFor({ state: 'visible' });
    } else {
      await msg.waitFor({ state: 'visible' });
    }
    return msg;
  }

  /** Get all user message bubbles. */
  userMessages(): Locator {
    return this.page.getByTestId('user-message');
  }

  /** Get research trace entries (tool timeline items). */
  researchTraceEntries(): Locator {
    return this.page.getByTestId('research-trace').locator('.text-xs');
  }

  /** Get the thread sidebar's thread items. */
  threadItems(): Locator {
    return this.page.getByTestId('thread-item');
  }

  /** Click the "+ New" thread button. */
  async newThread() {
    await this.page.getByTestId('new-thread-button').click();
  }
}
