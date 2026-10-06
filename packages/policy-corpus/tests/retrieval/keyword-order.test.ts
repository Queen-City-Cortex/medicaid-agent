// Which documents the document keyword backend keeps when title scores tie.
// The session is a stub, so the sort itself is pinned on the statement text.

import { describe, expect, it, vi } from 'vitest';
import { documentKeywordBackend } from '../../src/retrieval/backends/keyword.js';
import type { RetrievalBackend } from '../../src/contracts.js';

type RetrieveInput = Parameters<RetrievalBackend['retrieve']>[0];

describe('document keyword backend', () => {
  it('ranks tied manuals ahead of change notices before it looks at dates', async () => {
    const run = vi.fn(async () => ({ records: [] }));

    await documentKeywordBackend.retrieve({
      session: { run },
      analysis: { searchTerms: ['transportation', 'dialysis'] },
      profile: { typeGroups: [['dhhs_policy']], perGroupK: 12 },
    } as unknown as RetrieveInput);

    const [query] = run.mock.calls[0] as unknown as [string];
    const documentOrder = query.replace(/\s+/g, ' ').match(/WHERE docScore > 0 ORDER BY (.+?) LIMIT toInteger\(\$docLimit\)/)?.[1];
    expect(documentOrder).toBe(
      'docScore DESC, ' +
        "CASE WHEN coalesce(d.status, '') IN ['amendment', 'proposed'] THEN 1 ELSE 0 END, " +
        'coalesce(d.change_year, toInteger(substring(d.effective_date, 0, 4)), 0) DESC, ' +
        'coalesce(d.change_sequence, 0) DESC, ' +
        "coalesce(d.effective_date, '') DESC, " +
        'd.id ASC',
    );
  });
});
