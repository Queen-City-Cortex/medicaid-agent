// Frame hydration reads each section through getSection's default window, so
// a long section enters the frame as its first window and must say so.

import { describe, expect, it } from 'vitest';
import { createFrameHydrationHelpers } from '../../src/frame/context/hydration.js';
import { createSectionTextCorpus } from '../helpers/graph-fixtures.js';

describe('frame hydration of a long section', () => {
  it('keeps the first window and the fields that say more text remains', async () => {
    const { corpus, session } = createSectionTextCorpus([
      { id: 'sec-long', title: 'Medical loss ratio', sectionNumber: '438.8', text: 'm'.repeat(18400) },
    ]);
    const hydration = createFrameHydrationHelpers({ getSection: corpus.getSection, getDocument: corpus.getDocument });

    const [hydrated] = await hydration.hydrateSectionCandidates([{ sectionId: 'sec-long', reason: 'Matched.' }], 1);

    expect(session.run.mock.calls[0][1]).toMatchObject({ offset: 0, length: 6000 });
    expect(hydrated.section.content).toHaveLength(6000);
    expect(hydrated.section).toMatchObject({ contentOffset: 0, totalChars: 18400, nextOffset: 6000, reason: 'Matched.' });
    expect(hydrated.section.contentNote).toContain('Call getSection with offset=6000 to read on.');
  });
});
