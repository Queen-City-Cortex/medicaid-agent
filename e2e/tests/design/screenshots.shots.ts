import { test } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChatPage } from '../../helpers/chat-page';
import { mockMastraAPI } from '../../helpers/mock-routes';
import { AISdkStreamBuilder } from '../../helpers/stream-builder';

/**
 * Design screenshots — NOT assertions. Drives the REAL `/chat` (real WorkOS
 * session via storageState, real components) with the Mastra/Neo4j backend
 * fully mocked, then writes PNGs for visual review. This is the faithful
 * counterpart to the `/preview` component gallery: use it when a change needs
 * to be seen in the actually-wired app (streaming, sidebar, citations).
 *
 * Run (the project is gated behind DESIGN_SHOTS so it's never in a default run;
 * `setup` mints the auth cookie automatically as a dependency):
 *   DESIGN_SHOTS=1 npx playwright test --project=design
 *
 * Output lands in `e2e/design-shots/` (gitignored).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, '../../design-shots');

const THREADS = [
  { id: 't-1', title: 'Therapeutic leave limits for nursing facility residents' },
  { id: 't-2', title: 'Prior approval for private duty nursing' },
  { id: 't-3', title: 'HCWD earned income limit' },
];

// A rich answer: two tool calls whose outputs carry policy URLs (so the Sources
// panel populates), then a final answer that cites those same URLs (so inline
// [n] footnote markers render).
function richStream() {
  return new AISdkStreamBuilder()
    .start()
    .textDelta('Planning the evidence needed to answer this.')
    .toolCall('searchSections', 'tc-search', { query: 'therapeutic leave nursing facility days', topK: 6 })
    .toolResult('tc-search', { sections: [{ id: 'sec-ma2240', title: 'Therapeutic Leave', policyNumber: 'MA-2240' }] })
    .toolCall('getSection', 'tc-get', {})
    .toolResult('tc-get', {
      section: {
        id: 'sec:doc:adult_medicaid:MA-2240:2.1',
        title: 'Therapeutic Leave',
        sectionNumber: '2.1',
        policyNumber: 'MA-2240',
        url: 'https://medicaid.ncdhhs.gov/ma-2240/download',
        content:
          'A nursing facility resident may be absent for therapeutic leave for up to 60 days per calendar year without loss of Medicaid payment for bed reservation, provided the absence is part of the plan of care.',
      },
    })
    .textDelta(
      'Nursing facility residents are allowed up to **60 days** of therapeutic leave per calendar year ' +
        'without loss of Medicaid payment for bed reservation. The absence must be part of the resident’s ' +
        '[plan of care](https://medicaid.ncdhhs.gov/ma-2240/download).\n\n' +
        '- Leave is counted **per calendar year**, not per admission.\n' +
        '- Days beyond the 60-day limit are not reimbursable for bed-hold.',
    )
    .stepFinish()
    .finish();
}

for (const theme of ['light', 'dark'] as const) {
  test(`design shots — ${theme}`, async ({ page, context }) => {
    await context.addCookies([
      { name: 'theme', value: theme, domain: 'localhost', path: '/' },
    ]);
    await mockMastraAPI(page, { streamResponse: richStream(), threads: THREADS });

    const chat = new ChatPage(page);
    await chat.goto();

    // Empty state.
    await chat.emptyHeading.waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(SHOTS, `chat-empty-${theme}.png`), fullPage: true });

    // Full conversation with research trail + sources.
    await chat.sendMessage('How many days of therapeutic leave are allowed for nursing facility residents?');
    await chat.waitForAssistantMessage('60 days');
    await page.getByTestId('sources-panel').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(SHOTS, `chat-conversation-${theme}.png`), fullPage: true });
  });
}
