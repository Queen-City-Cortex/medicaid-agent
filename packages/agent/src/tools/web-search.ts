import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import Exa from 'exa-js';
import { EXA_API_KEY, WEB_SEARCH_MAX_RESULTS } from '../deep-research/config.js';
import { log, errorFields } from '../logger.js';

// Supplementary live web search for Deep Research. Authoritative answers come
// from the NC Medicaid corpus; this tool exists only to surface context that is
// not in the corpus (e.g. recent federal guidance), and its results MUST be
// labelled as supplementary, never presented as governing policy.
//
// Feature-flagged: the tool is only added to the worker's toolset when
// EXA_API_KEY is set (see deep-research/agents.ts). It still guards here so a
// misconfiguration fails loudly rather than calling Exa with an empty key.

const exa = EXA_API_KEY ? new Exa(EXA_API_KEY) : null;

const WebResult = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
});

export const webSearch = createTool({
  id: 'web-search',
  description:
    'SUPPLEMENTARY live web search for context outside the NC Medicaid policy corpus ' +
    '(e.g. recent federal guidance, news, or definitions). Results are NOT authoritative ' +
    'NC Medicaid policy — cite them distinctly as web sources. Prefer the corpus tools first.',
  inputSchema: z.object({
    query: z.string().describe('Web search query'),
  }),
  outputSchema: z.object({
    results: z.array(WebResult),
  }),
  execute: async ({ query }: { query: string }) => {
    if (!exa) {
      log.warn('web_search.disabled', { query });
      return { results: [] };
    }
    try {
      const res = await exa.searchAndContents(query, {
        numResults: WEB_SEARCH_MAX_RESULTS,
        text: { maxCharacters: 800 },
      });
      const results = (res.results ?? []).map((r) => ({
        title: r.title ?? r.url,
        url: r.url,
        snippet: (r.text ?? '').slice(0, 800),
      }));
      log.debug('web_search.ok', { query, results: results.length });
      return { results };
    } catch (err) {
      // A web-search failure must not abort a research run — degrade to no
      // supplementary results and let the corpus carry the answer.
      log.error('web_search.failed', { query, ...errorFields(err) });
      return { results: [] };
    }
  },
});
