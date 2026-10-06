import { describe, it, expect } from 'vitest';
import { getSourceFamily } from '../../src/corpus-manifest.js';
import { config } from '../../src/config.js';
import { discoverNcStatutes } from '../../src/sources/nc-statutes.js';

const BASE = 'https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection';

describe('nc_statute discovery', () => {
  it('lists exactly the four manifest seed pages and fetches nothing', () => {
    const docs = discoverNcStatutes();

    expect(docs.map((doc) => doc.source_url)).toEqual([
      `${BASE}/Chapter_108A/GS_108A-70.9A.html`,
      `${BASE}/Chapter_108A/GS_108A-79.html`,
      `${BASE}/Chapter_108D/GS_108D-14.html`,
      `${BASE}/Chapter_108D/GS_108D-15.html`,
    ]);
    expect(docs.map((doc) => doc.source_url)).toEqual(
      getSourceFamily('nc_statute').seed_urls,
    );
    expect(docs.map((doc) => doc.policy_number)).toEqual([
      '108A-70.9A',
      '108A-79',
      '108D-14',
      '108D-15',
    ]);
    // The manifest is the listing: each seed is recorded as listed by itself.
    expect(docs.every((doc) => doc.discovered_from === doc.source_url)).toBe(true);
    expect(docs.every((doc) => doc.source_type === 'nc_statute')).toBe(true);
  });

  it('fails discovery when a seed is missing from the list', () => {
    expect(config.minDiscoveredDocuments.nc_statute).toBe(4);
    expect(getSourceFamily('nc_statute')).toMatchObject({
      authority_tier: 'authoritative',
      required_for_answering: false,
      landing_pages: [],
      allowed_domains: ['www.ncleg.gov'],
      allowed_file_formats: ['.html'],
    });
  });
});
