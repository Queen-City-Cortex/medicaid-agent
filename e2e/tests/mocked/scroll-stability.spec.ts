import { test, expect } from '@playwright/test';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { AISdkStreamBuilder } from '../../helpers/stream-builder';

/**
 * Regression tests for scroll stability.
 *
 * Root cause: scrollIntoView() and focus() were scrolling the overflow:hidden
 * layout root, pushing the sidebar off-screen. Long content also couldn't
 * scroll because the ScrollArea lacked min-h-0 in the flex column.
 */
test.describe('Scroll stability', () => {
  test('sidebar stays in place after loading a long conversation', async ({ page }) => {
    // Build a stream with enough content to overflow the viewport
    const stream = new AISdkStreamBuilder()
      .start()
      .toolCall('searchSections', 'tc-searchSections', {})
      .toolResult('tc-searchSections')
      .toolCall('getSection', 'tc-getSection', {})
      .toolResult('tc-getSection');

    for (let i = 0; i < 20; i++) {
      stream.textDelta(`Paragraph ${i}: NC Medicaid policy requires detailed documentation. `);
    }
    stream.stepFinish().finish();

    await mockMastraAPI(page, { streamResponse: stream });
    const chat = new ChatPage(page);
    await chat.goto();

    await chat.sendMessage('Tell me everything about therapeutic leave');
    await chat.waitForAssistantMessage('Paragraph 19');

    // The outer layout root must NOT have scrolled
    const outerScrollTop = await page.evaluate(() => {
      return document.querySelector('.flex.h-screen')?.scrollTop ?? -1;
    });
    expect(outerScrollTop).toBe(0);

    // Sidebar should be visible at the top of the viewport
    const sidebarTop = await page.evaluate(() => {
      return document.querySelector('[class*="bg-sidebar"]')?.getBoundingClientRect().top ?? -999;
    });
    expect(sidebarTop).toBeGreaterThanOrEqual(0);
  });

  test('main content area is scrollable when content overflows', async ({ page }) => {
    const stream = new AISdkStreamBuilder().start();
    for (let i = 0; i < 30; i++) {
      stream.textDelta(`Line ${i}: This is a long policy explanation that takes up space. `);
    }
    stream.stepFinish().finish();

    await mockMastraAPI(page, { streamResponse: stream });
    const chat = new ChatPage(page);
    await chat.goto();

    await chat.sendMessage('Give me a very long answer');
    await chat.waitForAssistantMessage('Line 29');

    // The scroll area viewport should have overflow (scrollHeight > clientHeight)
    const scrollState = await page.evaluate(() => {
      const viewports = document.querySelectorAll('[data-slot="scroll-area-viewport"]');
      // Main content viewport is the second one (first is sidebar)
      const vp = viewports[viewports.length - 1];
      if (!vp) return null;
      return {
        scrollHeight: vp.scrollHeight,
        clientHeight: vp.clientHeight,
      };
    });

    expect(scrollState).not.toBeNull();
    expect(scrollState!.scrollHeight).toBeGreaterThan(scrollState!.clientHeight);
  });

  test('sidebar stays in place after switching threads', async ({ page }) => {
    const stream = new AISdkStreamBuilder().start();
    for (let i = 0; i < 20; i++) {
      stream.textDelta(`Content line ${i}. `);
    }
    stream.stepFinish().finish();

    await mockMastraAPI(page, {
      streamResponse: stream,
      threads: [
        { id: 'thread-1', title: 'Previous conversation', updatedAt: new Date().toISOString() },
      ],
      threadMessages: [
        { role: 'user', content: 'Old question' },
        { role: 'assistant', content: 'Old answer that is moderately long and has some detail to it.' },
      ],
    });

    const chat = new ChatPage(page);
    await chat.goto();

    // Send a message to create content
    await chat.sendMessage('New question');
    await chat.waitForAssistantMessage('Content line 19');

    // Click a thread in the sidebar
    await chat.threadItems().first().click();

    // Sidebar must not scroll off-screen
    const outerScrollTop = await page.evaluate(() => {
      return document.querySelector('.flex.h-screen')?.scrollTop ?? -1;
    });
    expect(outerScrollTop).toBe(0);
  });

  test('thread list scrolls and keeps Sign out in view once it outgrows the sidebar', async ({ page }) => {
    await mockMastraAPI(page, {
      threads: Array.from({ length: 40 }, (_, i) => ({
        id: `thread-${i}`,
        title: `Conversation ${i}`,
        updatedAt: new Date(Date.UTC(2026, 0, 1) - i * 86_400_000).toISOString(),
      })),
    });
    const chat = new ChatPage(page);
    await chat.goto();
    await expect(chat.threadItems()).toHaveCount(40);

    // The list must scroll inside the sidebar instead of growing with its content.
    const scrollState = await page.evaluate(() => {
      const vp = document.querySelector('#thread-sidebar [data-slot="scroll-area-viewport"]');
      if (!vp) return null;
      return { scrollHeight: vp.scrollHeight, clientHeight: vp.clientHeight };
    });
    expect(scrollState).not.toBeNull();
    expect(scrollState!.scrollHeight).toBeGreaterThan(scrollState!.clientHeight);

    // toBeInViewport also fails when the footer is clipped by the sidebar wrapper.
    const signOut = page.getByRole('button', { name: 'Sign out' });
    await expect(signOut).toBeInViewport({ ratio: 1 });
    const box = await signOut.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

    await chat.threadItems().last().scrollIntoViewIfNeeded();
    await expect(chat.threadItems().last()).toBeInViewport();
    await expect(signOut).toBeInViewport({ ratio: 1 });
  });
});
