import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseFeeScheduleDetailPage,
  parseFeeScheduleListingPage,
} from '../../src/sources/fee-schedules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const listingHtml = readFileSync(
  path.join(__dirname, '../fixtures/fee-schedules-listing.html'),
  'utf8',
);
const detailHtml = readFileSync(
  path.join(__dirname, '../fixtures/fee-schedules-detail.html'),
  'utf8',
);

describe('parseFeeScheduleListingPage', () => {
  it('discovers fee-schedule detail URLs and the next listing page', () => {
    const result = parseFeeScheduleListingPage(
      listingHtml,
      'https://medicaid.ncdhhs.gov/document-collection/fee-schedules?page=0',
    );

    expect(result.detailUrls).toEqual([
      'https://medicaid.ncdhhs.gov/ambulatory-surgical-center-fee-schedule-aug-24-2022-pdf',
      'https://medicaid.ncdhhs.gov/physician-administered-drug-fee-schedule',
    ]);
    expect(result.nextPageUrl).toBe(
      'https://medicaid.ncdhhs.gov/document-collection/fee-schedules?page=1',
    );
  });
});

describe('parseFeeScheduleDetailPage', () => {
  it('discovers the underlying downloadable file', () => {
    const docs = parseFeeScheduleDetailPage(
      detailHtml,
      'https://medicaid.ncdhhs.gov/ambulatory-surgical-center-fee-schedule-aug-24-2022-pdf',
    );

    expect(docs).toHaveLength(1);
    expect(docs[0].source_type).toBe('fee_schedule');
    expect(docs[0].source_url).toBe(
      'https://medicaid.ncdhhs.gov/documents/files/asc-fee-schedule/open',
    );
    expect(docs[0].title).toBe('ASC Fee Schedule PDF');
  });
});
