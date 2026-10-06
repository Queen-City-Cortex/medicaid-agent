import { getSourceFamily } from '../corpus-manifest.js';
import type { DiscoveredDocument, SourceModule } from './types.js';

const sourceFamily = getSourceFamily('nc_statute');

/** "108A-70.9A" from ".../GS_108A-70.9A.html"; null for any other URL. */
export function statuteSectionFromUrl(sourceUrl: string): string | null {
  return /\/GS_([0-9A-Za-z.-]+)\.html$/.exec(sourceUrl)?.[1] ?? null;
}

// A fixed seed list: there is no index page and the General Statutes are not
// crawled. The manifest is the listing, so each seed is its own
// `discovered_from` and only removing it from the manifest de-lists it.
export function discoverNcStatutes(): DiscoveredDocument[] {
  return sourceFamily.seed_urls.map((sourceUrl) => {
    const section = statuteSectionFromUrl(sourceUrl);
    if (!section) {
      throw new Error(`nc_statute seed is not a GS_<section>.html page: ${sourceUrl}`);
    }
    return {
      source_url: sourceUrl,
      discovered_from: sourceUrl,
      source_type: 'nc_statute',
      title: `N.C.G.S. ${section}`,
      policy_number: section,
      category: 'North Carolina General Statutes',
    };
  });
}

export const ncStatuteSource: SourceModule = {
  async discover() {
    return discoverNcStatutes();
  },
};
