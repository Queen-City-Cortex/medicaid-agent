/** Private, resumable evidence collection. It never changes the registry. */
import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { buildFetcher } from './shared.js';
import { createRobotsChecker } from '../crawl/robots.js';
import { getSourceFamily, isAllowedSourceUrl } from '../corpus-manifest.js';
import { canonicalizeSourceUrl } from '../identity.js';
import type { DocumentRecord } from '../db/registry.js';
import type { SourceType } from '../sources/types.js';

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => JSON.stringify(k) + ':' + stableJson(v)).join(',') + '}';
  return JSON.stringify(value);
}
export const digest = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
export function atomicJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.pending', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(file + '.pending', file);
}
interface Capture {
  url: string; checked_at: string; status_code?: number; final_url?: string;
  redirects?: Array<{ url: string; statusCode: number; location: string }>;
  headers?: Record<string, string | string[] | undefined>;
  sha256?: string; capture_path?: string; links?: Array<{ url: string; text: string }>;
  error?: string; blocked_by?: string;
}
interface Audit {
  schema_version: 1; input_hash: string; created_at: string;
  entries: Array<{ source_url: string; registry: DocumentRecord; registry_hash: string; requests: string[]; disposition: 'unresolved' }>;
  captures: Record<string, Capture>;
}

export function validateCapture(directory: string, capture: Capture): void {
  if (capture.error) return; // A failed request remains unresolved until explicitly refreshed.
  const relative = capture.capture_path ?? '';
  const target = path.resolve(directory, relative);
  if (fs.existsSync(target) && !fs.realpathSync(target).startsWith(fs.realpathSync(directory) + path.sep)) throw new Error('Audit capture escapes its private directory');
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..') || digest(fs.readFileSync(path.join(directory, relative))) !== capture.sha256) throw new Error('Audit capture is missing or has changed');
}

/**
 * True for the Internet Archive's capture index of exactly this address. It is
 * the one request outside a family's hosts that evidence collection makes:
 * a relocation to an archive capture needs it, and it carries no document.
 * Captures are keyed by address across the whole selection, so collection
 * allows the index of any selected source, whichever entry asks first.
 */
export function isArchiveIndexFor(url: string, sourceUrl: string): boolean {
  try {
    const query = new URL(url);
    return query.origin === 'https://web.archive.org' && query.pathname === '/cdx/search/cdx'
      && query.searchParams.get('output') === 'json' && query.searchParams.getAll('url').length === 1
      && canonicalizeSourceUrl(query.searchParams.get('url')!) === canonicalizeSourceUrl(sourceUrl);
  } catch { return false; }
}

export async function collectAudit(input: { documents: DocumentRecord[]; urls?: string[] }, directory: string): Promise<Audit> {
  const manifest = path.join(directory, 'audit.json');
  const inputHash = digest(stableJson(input));
  const audit: Audit = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')) as Audit : {
    schema_version: 1, input_hash: inputHash, created_at: new Date().toISOString(), captures: {},
    entries: input.documents.map(row => ({ source_url: canonicalizeSourceUrl(row.source_url), registry: row, registry_hash: digest(stableJson(row)), disposition: 'unresolved', requests: [...new Set([row.source_url, row.discovered_from, ...getSourceFamily(row.source_type as SourceType).landing_pages, ...(input.urls ?? [])].filter(Boolean).map(canonicalizeSourceUrl))] })),
  };
  if (audit.schema_version !== 1 || audit.input_hash !== inputHash) throw new Error('Audit inputs changed; start a new audit directory');
  for (const capture of Object.values(audit.captures)) validateCapture(directory, capture);
  atomicJson(manifest, audit);
  const fetcher = buildFetcher();
  const robots = createRobotsChecker(config.userAgent);
  const hosts = new Set<string>();
  // One fully exhausted DNS request establishes host unavailability. Retain
  // explicit unvisited records instead of spending the same retry window for
  // every link. A new audit directory performs a deliberate fresh observation.
  const unavailableHosts = new Map<string, string>();
  for (const capture of Object.values(audit.captures)) {
    if (capture.error?.includes('ENOTFOUND') && !capture.blocked_by) unavailableHosts.set(new URL(capture.url).hostname, capture.url);
  }
  async function beforeRequest(url: string) {
    const host = new URL(url).hostname;
    if (!hosts.has(host)) {
      await robots.fetchAndCache(host, fetcher);
      hosts.add(host);
      const delay = robots.getCrawlDelay(host);
      if (delay !== null) fetcher.setCrawlDelay(host, delay * 1000);
    }
    if (!robots.isAllowed(url)) throw new Error('robots.txt disallows this evidence request');
  }
  for (const entry of audit.entries) {
    for (const url of entry.requests) {
      if (audit.captures[url]) continue;
      const capture: Capture = { url, checked_at: new Date().toISOString() };
      try {
        const blockedBy = unavailableHosts.get(new URL(url).hostname);
        if (blockedBy) {
          capture.blocked_by = blockedBy;
          throw new Error('Not requested: host DNS lookup exhausted retries; see ' + blockedBy);
        }
        const response = await fetcher.fetchEvidence(url, config.maxFileSizeBytes, candidate => isAllowedSourceUrl(entry.registry.source_type as SourceType, candidate) || (candidate === url && audit.entries.some(selected => isArchiveIndexFor(url, selected.source_url))), beforeRequest);
        capture.status_code = response.statusCode;
        capture.final_url = response.finalUrl;
        capture.redirects = response.redirects;
        // Do not persist cookies or other unrelated headers.
        capture.headers = Object.fromEntries(Object.entries(response.headers).filter(([key]) => ['content-type', 'content-length', 'etag', 'last-modified', 'content-disposition'].includes(key)));
        capture.sha256 = digest(response.body);
        capture.capture_path = `captures/${capture.sha256}.bin`;
        fs.mkdirSync(path.join(directory, 'captures'), { recursive: true });
        fs.writeFileSync(path.join(directory, capture.capture_path), response.body, { mode: 0o600 });
        const contentType = String(response.headers['content-type'] ?? '');
        if (contentType.includes('html')) {
          const $ = cheerio.load(response.body.toString('utf8'));
          capture.links = $('a[href]').toArray().flatMap(element => {
            try { return [{ url: canonicalizeSourceUrl(new URL($(element).attr('href')!, response.finalUrl).toString()), text: $(element).text().trim().replace(/\s+/g, ' ') }]; } catch { return []; }
          });
        }
      } catch (error) {
        capture.error = (error as Error).message;
        if (capture.error.includes('ENOTFOUND') && capture.error.includes(new URL(url).hostname)) unavailableHosts.set(new URL(url).hostname, url);
      }
      audit.captures[url] = capture;
      atomicJson(manifest, audit);
      console.log(JSON.stringify({ source_url: entry.source_url, url, status: capture.status_code ?? 'unresolved', collected: Object.keys(audit.captures).length }));
    }
  }
  return audit;
}

export function registerSourceAuditCommand(program: Command): void {
  program.command('source-audit-collect')
    .requiredOption('--input <path>', 'Reviewed source selection and locked registry snapshot JSON')
    .requiredOption('--output <directory>', 'Private evidence directory; matching input resumes automatically')
    .action(async (opts: { input: string; output: string }) => {
      await collectAudit(JSON.parse(fs.readFileSync(opts.input, 'utf8')), opts.output);
    });
}
