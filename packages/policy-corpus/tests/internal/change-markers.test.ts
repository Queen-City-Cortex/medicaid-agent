// Change-number markers ("CHANGE NO. 04-26") read from section and document
// titles. One row per header family measured on the corpus, and the titles
// that used to yield a false marker.

import { describe, expect, it } from 'vitest';
import { changeMarkerValueForHit, extractChangeMarkerValue } from '../../src/internal/change-markers.js';
import { makeHit } from '../helpers/objects.js';

const NEXT_YEAR = 2027;

describe('extractChangeMarkerValue', () => {
  it.each([
    ['REVISED 05/01/11 - CHANGE NO. 04-11', 201104],
    ['REVISED 03/16/2026 -CHANGE NO. 04-26', 202604],
    ['REVISED EFFECTIVE 04/01/10 - CHANGE NO. 04-10', 201004],
    ['REVISED 04/01/10 - CHANGE NOTICE 04-10', 201004],
    ['CHANGE NOTICE FOR MANUAL NO. 09-21, TRIBAL MEMBERSHIP AND AMERICAN INDIAN HEALTH SERVICES (IHS)', 202109],
    ['CHANGE NOTICE FOR MANUAL, NO: 07-15, MA-2270', 201507],
    ['CHANGE NOTICE FOR MANUALS NO. 22-08, MA-3300', 200822],
    ['DMA CHANGE NOTICE FOR MANUAL 01-14', 201401],
    ['Current Change Notice: 06-24', 202406],
    ['Change No. 02-24:', 202402],
    ['ISSUED 01/01/11-CHANGE 24-10', 201024],
  ])('reads %s as %i', (title, expected) => {
    expect(extractChangeMarkerValue(title, NEXT_YEAR)).toBe(expected);
  });

  it.each([
    ['Ages 18-64 Service Limits'],
    ['Individuals Ages 19-64'],
    ['SPA 25-0026'],
    ['REVISED PUBLIC NOTICE (SPA #22-0033)'],
    ['SPA 25-0006 Revised 1-Day Public Notice (Targeted Case Management Services)'],
    ['First Revised and Restated RFA 30-2020-052-DHB'],
    ['DHB ADMINISTRATIVE LETTER NO: 01-24'],
    ['Policy 8C Revision — 2025-04-15'],
    ['ATTACHMENT II (REVISED 09-07)'],
    ['Table 4-21'],
    // A bare number names no change; the manual's header is the recency signal.
    ['02-26'],
    // Two known misprints in real headers, accepted as misses.
    ['REVISED 01/01/11 - CHANGE NO. 0111'],
    ['REVISED 11/01/11 - CHANGE NO. 17X-11'],
  ])('reads no marker from %s', (title) => {
    expect(extractChangeMarkerValue(title, NEXT_YEAR)).toBeNull();
  });

  it('rejects a year beyond next year', () => {
    expect(extractChangeMarkerValue('CHANGE NO. 04-27', NEXT_YEAR)).toBe(202704);
    expect(extractChangeMarkerValue('CHANGE NO. 04-28', NEXT_YEAR)).toBeNull();
    expect(extractChangeMarkerValue('CHANGE NO. 04-99', NEXT_YEAR)).toBeNull();
  });

  it('bounds the year by the current date when none is given', () => {
    const twoYearsOut = String((new Date().getFullYear() + 2) % 100).padStart(2, '0');
    const thisYear = String(new Date().getFullYear() % 100).padStart(2, '0');
    expect(extractChangeMarkerValue(`CHANGE NO. 01-${thisYear}`)).not.toBeNull();
    expect(extractChangeMarkerValue(`CHANGE NO. 01-${twoYearsOut}`)).toBeNull();
  });
});

describe('changeMarkerValueForHit', () => {
  it('falls back to the document title only when it names a change', () => {
    expect(
      changeMarkerValueForHit(
        makeHit({ sectionTitle: 'Content of Change', documentTitle: 'CHANGE NOTICE FOR MANUAL NO. 04-26, NEMT' }),
      ),
    ).toBe(202604);
    expect(
      changeMarkerValueForHit(makeHit({ sectionTitle: 'Background', documentTitle: 'SPA 25-0026 Public Notice' })),
    ).toBeNull();
    expect(
      changeMarkerValueForHit(makeHit({ sectionTitle: 'Background', documentTitle: 'Policy 8C Revision — 2025-04-15 (All)' })),
    ).toBeNull();
  });
});
