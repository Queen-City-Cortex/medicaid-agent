import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { expectNoNewViolations, type KnownViolation } from '../../helpers/axe';
import { ChatPage } from '../../helpers/chat-page';
import { holdChatStreamOpen } from '../../helpers/held-stream';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { AISdkStreamBuilder } from '../../helpers/stream-builder';

// Violations that exist today and are owned by an open card. Each entry
// excuses one rule on one selector; anything else fails the scan. Delete an
// entry when its card lands.
const KNOWN: KnownViolation[] = [
];

const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

const THREADS = [
  { id: 'thread-1', title: 'Does Medicaid cover dental?', updatedAt: new Date().toISOString() },
  { id: 'thread-2', title: 'EPSDT benefits for children', updatedAt: new Date(Date.now() - 86_400_000).toISOString() },
];

async function useTheme(context: BrowserContext, theme: Theme): Promise<void> {
  await context.addCookies([{ name: 'theme', value: theme, domain: 'localhost', path: '/' }]);
}

async function expectTheme(page: Page, theme: Theme): Promise<void> {
  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  expect(dark).toBe(theme === 'dark');
}

// An answer that cites the section a tool returned, so the Sources panel and
// an inline footnote marker both render.
function citedAnswer(): AISdkStreamBuilder {
  return new AISdkStreamBuilder()
    .start()
    .toolCall('getSection', 'tc-get-8c', {})
    .toolResult('tc-get-8c', {
      section: {
        id: 'sec:doc:clinical_policy:8C:3.2.1',
        title: 'Outpatient Behavioral Health Services',
        sectionNumber: '3.2.1',
        policyNumber: '8C',
        url: 'https://medicaid.ncdhhs.gov/8c/download',
      },
    })
    .textDelta(
      'Policy 8C covers outpatient behavioral health services under ' +
        '[Policy 8C § 3.2.1](https://medicaid.ncdhhs.gov/8c/download).',
    )
    .stepFinish()
    .finish();
}

const RESEARCH_PLAN = {
  brief: 'Compare how prior approval works for private duty nursing and personal care services.',
  subQuestions: [
    { question: 'What does Policy 3G-1 require for prior approval?', rationale: 'The governing clinical policy.', channels: ['keyword'], useWeb: false },
    { question: 'How do EPSDT exceptions change those limits?', rationale: 'Children can exceed adult limits.', channels: ['concept'], useWeb: false },
  ],
};

function researchRun(state: 'awaiting_approval' | 'completed') {
  const now = new Date().toISOString();
  const question = 'How does prior approval differ between nursing and personal care?';
  return {
    runId: 'run-a11y',
    state,
    question,
    plan: RESEARCH_PLAN,
    report: state === 'completed'
      ? {
          status: 'completed',
          question,
          brief: RESEARCH_PLAN.brief,
          reportMarkdown:
            '## Prior approval\n\nPrivate duty nursing needs prior approval under ' +
            '[Policy 3G-1](https://medicaid.ncdhhs.gov/3g-1/download).\n\n- Requests are reviewed before services start.',
          subQuestions: RESEARCH_PLAN.subQuestions,
          corpusSources: [{ key: 'doc:clinical_policy:3G-1', label: 'Policy 3G-1', link: 'https://medicaid.ncdhhs.gov/3g-1/download' }],
          webSources: [],
          workerFailures: [],
          citationProvenance: { checkedCitations: 1, retrievedCitations: 1, unknownCitations: 0 },
          stats: { reflectionRounds: 0, subQuestionCount: 2, corpusSourceCount: 1, webSourceCount: 0 },
        }
      : null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
}

// The chat page adopts the caller's active research run on load, which is the
// shortest route to the plan and report screens.
async function mockActiveResearchRun(page: Page, state: 'awaiting_approval' | 'completed'): Promise<void> {
  await page.route('**/research/runs/current', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(researchRun(state)) });
  });
}

async function failChat(page: Page): Promise<void> {
  await page.route('**/chat', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal server error' }) });
  });
}

for (const theme of THEMES) {
  test.describe(`Accessibility scan, ${theme} theme, public pages`, () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    for (const path of ['/', '/terms', '/privacy']) {
      test(`${path} has no new violations`, async ({ page, context }) => {
        await useTheme(context, theme);
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectTheme(page, theme);
        await expectNoNewViolations(page, KNOWN);
      });
    }
  });

  test.describe(`Accessibility scan, ${theme} theme, chat`, () => {
    test.beforeEach(async ({ context }) => {
      await useTheme(context, theme);
    });

    test('empty chat with no threads', async ({ page }) => {
      await mockMastraAPI(page);
      const chat = new ChatPage(page);
      await chat.goto();
      await expect(chat.emptyHeading).toBeVisible();
      await expect(page.getByText('No threads yet')).toBeVisible();
      await expectTheme(page, theme);
      await expectNoNewViolations(page, KNOWN);
    });

    test('answer with sources and a footnote, beside a sidebar of threads', async ({ page }) => {
      await mockMastraAPI(page, { streamResponse: citedAnswer(), threads: THREADS });
      const chat = new ChatPage(page);
      await chat.goto();
      await chat.sendMessage('What does Policy 8C cover?');
      await chat.waitForAssistantMessage('outpatient behavioral health services');
      await expect(page.getByTestId('citation-footnote').first()).toBeAttached();
      await expect(page.getByTestId('source-item')).toHaveCount(1);
      await expect(page.getByTestId('verification-badge')).toBeVisible();
      await expect(chat.threadItems()).toHaveCount(2);
      // The transcript is a list of turns inside the main landmark, each
      // under a heading that names the speaker.
      const transcript = page.getByRole('main').getByRole('list', { name: 'Conversation' });
      await expect(transcript.getByRole('heading', { name: 'You asked' })).toHaveCount(1);
      await expect(transcript.getByRole('heading', { name: 'Navigator answered' })).toHaveCount(1);
      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('contentinfo')).toHaveCount(1);
      // The copy, rerun and rating icons only paint while the answer is hovered.
      await page.getByTestId('assistant-message').last().hover();
      await expectNoNewViolations(page, KNOWN);
    });

    test('thread actions menu and delete confirmation', async ({ page }) => {
      await mockMastraAPI(page, { threads: THREADS });
      await new ChatPage(page).goto();
      await page.getByRole('button', { name: `Thread actions for ${THREADS[0].title}` }).click();
      await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
      await expectNoNewViolations(page, KNOWN);
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await expectNoNewViolations(page, KNOWN);
    });

    test('withheld answer', async ({ page }) => {
      const stream = new AISdkStreamBuilder().start().textDelta('Draft that must stay private.')
        .dataPart('data-verification-status', { status: 'withheld', reason: 'unavailable', passCount: 1 }).finish();
      await mockMastraAPI(page, { streamResponse: stream });
      const chat = new ChatPage(page);
      await chat.goto();
      await chat.sendMessage('What is covered?');
      await expect(page.getByTestId('verification-retry')).toBeVisible();
      await expectNoNewViolations(page, KNOWN);
    });

    test('blocked message', async ({ page }) => {
      const stream = new AISdkStreamBuilder().start()
        .dataPart('data-tripwire', {
          reason: 'off-topic request blocked',
          metadata: { code: 'off-topic', userMessage: 'I can only help with NC Medicaid and related public-benefits questions.' },
          processorId: 'scope-gate',
        })
        .finish('other');
      await mockMastraAPI(page, { streamResponse: stream });
      const chat = new ChatPage(page);
      await chat.goto();
      await chat.sendMessage('Write me a poem about pirates');
      await expect(page.getByTestId('blocked-message')).toBeVisible();
      await expectNoNewViolations(page, KNOWN);
    });

    test('chat error box', async ({ page }) => {
      await mockMastraAPI(page);
      await failChat(page);
      const chat = new ChatPage(page);
      await chat.goto();
      await chat.sendMessage('This should fail');
      await expect(page.getByTestId('chat-error')).toBeVisible();
      await expectNoNewViolations(page, KNOWN);
    });

    test('answer stopped during research', async ({ page }) => {
      await mockMastraAPI(page);
      await holdChatStreamOpen(page, new AISdkStreamBuilder().start()
        .toolCall('searchSections', 'tc-1', { query: 'dental' })
        .toolResult('tc-1', { sections: [] })
        .toolCall('getSection', 'tc-2', { sectionId: 'section-1' }));
      const chat = new ChatPage(page);
      await chat.goto();
      await chat.sendMessage('Is dental covered?');
      await expect(page.getByTestId('progress-narration')).toBeVisible();
      await page.getByTestId('stop-button').click();
      await expect(page.getByTestId('ended-without-answer')).toBeVisible();
      await expectNoNewViolations(page, KNOWN);
    });

    test('answer stopped before it began', async ({ page }) => {
      await mockMastraAPI(page);
      await holdChatStreamOpen(page, new AISdkStreamBuilder());
      const chat = new ChatPage(page);
      await chat.goto();
      await chat.sendMessage('Is dental covered?');
      await expect(chat.startingResearch).toBeVisible();
      await page.getByTestId('stop-button').click();
      await expect(page.getByTestId('stopped-before-answer')).toBeVisible();
      await expectNoNewViolations(page, KNOWN);
    });

    test('dropped connection', async ({ page }) => {
      await mockMastraAPI(page);
      await page.route('**/chat', async (route) => {
        const headers = route.request().headers();
        if (route.request().method() !== 'POST' || headers['next-action'] || headers['next-router-state-tree']) {
          await route.fallback();
          return;
        }
        await route.abort('connectionreset');
      });
      const chat = new ChatPage(page);
      await chat.goto();
      await chat.sendMessage('Is dental covered?');
      await expect(page.getByTestId('chat-error-disconnected')).toBeVisible();
      await expectNoNewViolations(page, KNOWN);
    });

    test('Deep Research plan awaiting approval', async ({ page }) => {
      await mockMastraAPI(page);
      await mockActiveResearchRun(page, 'awaiting_approval');
      await new ChatPage(page).goto();
      await expect(page.getByTestId('deep-research-plan')).toBeVisible();
      await expect(page.getByTestId('approve-plan')).toBeVisible();
      await expectNoNewViolations(page, KNOWN);
    });

    test('finished Deep Research report', async ({ page }) => {
      await mockMastraAPI(page);
      await mockActiveResearchRun(page, 'completed');
      await new ChatPage(page).goto();
      await expect(page.getByTestId('deep-research-report')).toBeVisible();
      await expect(page.getByTestId('deep-research-verification')).toBeVisible();
      await expectNoNewViolations(page, KNOWN);
    });
  });
}

// The scan above is only worth having if it can fail. Plant one contrast
// failure and check it is reported, excused only by an exclusion that names
// its own rule and selector.
test.describe('Accessibility scan helper', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('reports a planted violation unless that rule and selector are listed', async ({ page }) => {
    await page.goto('/terms');
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<p id="planted" style="color:#bbbbbb;background:#ffffff">Too faint to read</p>',
      );
    });
    await expect(expectNoNewViolations(page)).rejects.toThrow(/color-contrast.*#planted/);
    await expect(expectNoNewViolations(page, [{ rule: 'color-contrast', selector: 'footer' }]))
      .rejects.toThrow(/#planted/);
    await expect(expectNoNewViolations(page, [{ rule: 'link-name', selector: '#planted' }]))
      .rejects.toThrow(/#planted/);
    await expectNoNewViolations(page, [{ rule: 'color-contrast', selector: '#planted' }]);
  });
});
