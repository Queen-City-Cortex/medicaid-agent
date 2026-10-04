import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { fileTypeFromBuffer } from 'file-type';
import {
  FileTooLargeError,
  HttpStatusError,
  UrlRejectedError,
} from './fetcher.js';
import { hashFile } from '../utils/hash.js';
import { buildFilename } from '../utils/naming.js';
import { logger } from '../utils/logger.js';
import { config, SOURCE_TYPE_DIRS } from '../config.js';
import {
  getSourceFamily,
  isAllowedSourceUrl,
} from '../corpus-manifest.js';
import type { DocumentRecord, DownloadedInfo } from '../db/registry.js';
import type { Fetcher, FetchFileResult, SourceType } from '../sources/types.js';

// Map the MIME types `file-type` returns to the file extensions listed in
// corpus-manifest.json#allowed_file_formats. Keep both the `.ext` and bare
// `ext` forms since the manifest uses leading-dot form.
const MIME_TO_EXTENSIONS: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'text/html': ['.html'],
  'text/plain': ['.txt'],
};

// Extensions that denote text-based formats. If a source family allows any of
// these, a text-looking payload is legitimate; otherwise it is almost
// certainly an HTML soft-404 or maintenance page.
const TEXT_FORMAT_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.txt',
  '.xml',
  '.csv',
  '.json',
  '.md',
]);

const HTML_FORMAT_EXTENSIONS = new Set(['.html', '.htm']);

export function requiresSemanticArticleHtml(allowedFormats: readonly string[]): boolean {
  return allowedFormats.length > 0 && allowedFormats.every((format) =>
    HTML_FORMAT_EXTENSIONS.has(format.toLowerCase()),
  );
}

export function detectedTypeMatchesAllowedFormats(
  detectedMime: string | null,
  allowedFormats: readonly string[],
): boolean {
  if (!detectedMime) {
    // No magic-byte detection. Be permissive — `looksLikeTextPayload` handles
    // the dangerous case (text masquerading as a binary document), and the
    // extension check at file-save time still filters the common cases.
    return true;
  }
  const candidates = MIME_TO_EXTENSIONS[detectedMime] ?? [];
  if (candidates.length === 0) {
    // Unknown MIME — permissive; fallback to extension-only path.
    return true;
  }
  const allowed = new Set(allowedFormats.map((format) => format.toLowerCase()));
  return candidates.some((ext) => allowed.has(ext.toLowerCase()));
}

export function allowsTextFormats(allowedFormats: readonly string[]): boolean {
  return allowedFormats.some((format) =>
    TEXT_FORMAT_EXTENSIONS.has(format.toLowerCase()),
  );
}

// Leading markers that identify HTML/XML even when `file-type` (which only
// detects binary signatures) returns null.
const MARKUP_MARKERS = [
  '<!doctype',
  '<html',
  '<?xml',
  '<head',
  '<body',
  '<script',
  '<!--',
];

/**
 * Heuristic for "this payload is HTML/text, not a binary document". `file-type`
 * cannot detect text formats, so a null magic-byte detection is ambiguous —
 * this disambiguates by looking for markup markers and, failing that, checking
 * whether the header bytes are overwhelmingly printable text.
 */
export function looksLikeTextPayload(header: Buffer): boolean {
  if (header.length === 0) return false;

  // Strip a UTF-8 BOM if present
  let bytes = header;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bytes = bytes.subarray(3);
  }

  const leading = bytes.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
  if (MARKUP_MARKERS.some((marker) => leading.startsWith(marker))) {
    return true;
  }

  // Mostly-printable check: any NUL byte means binary; otherwise require an
  // overwhelmingly printable header (tab/LF/CR, printable ASCII, and bytes
  // >= 0x80 for UTF-8 multibyte sequences).
  let printable = 0;
  for (const byte of bytes) {
    if (byte === 0x00) return false;
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte !== 0x7f)) {
      printable++;
    }
  }
  return printable / bytes.length >= 0.97;
}

function normalizeHtmlText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Validate the semantic contract consumed by the HTML parser. MIME alone is
 * insufficient because Drupal can return a branded maintenance page or soft
 * 404 with HTTP 200 and `text/html`.
 */
export function validateSemanticArticleHtml(
  filePath: string,
  expectedTitle: string | null,
  requiredText: readonly string[] = [],
): string | null {
  const html = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(html);
  const article = $('article').first();
  if (article.length === 0) {
    return 'HTML payload is missing the required semantic article';
  }

  // Mirror the downstream parser's ignored-tag contract so navigation or
  // form boilerplate cannot make an otherwise empty article look substantive.
  const semanticArticle = article.clone();
  semanticArticle.find('script, style, nav, aside, form').remove();

  let heading = normalizeHtmlText(semanticArticle.find('h1').first().text());
  if (!heading) {
    // Drupal blog pages put the page heading before the article and explicitly
    // associate it with the enclosing main landmark. Do not borrow an arbitrary
    // page heading for an unrelated or ambiguous article.
    const main = article.closest('main[aria-labelledby]');
    const labelIds = (main.attr('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
    const labels = main.find('h1').filter((_i, element) =>
      labelIds.includes($(element).attr('id') ?? ''),
    );
    if (main.find('article').length === 1 && labels.length === 1) {
      heading = normalizeHtmlText(labels.text());
    }
  }
  const normalizedExpectedTitle = normalizeHtmlText(expectedTitle ?? '');
  if (
    normalizedExpectedTitle
    && (!heading || !heading.includes(normalizedExpectedTitle))
  ) {
    return 'HTML semantic article does not match the expected document title';
  }

  const body = normalizeHtmlText(semanticArticle.find('p, li').text());
  if (body.length < 50) {
    return 'HTML semantic article lacks substantive body content';
  }
  const articleText = normalizeHtmlText(semanticArticle.text());
  if (requiredText.some((text) => !articleText.includes(normalizeHtmlText(text)))) {
    return 'HTML semantic article lacks the required dated bulletin content';
  }

  return null;
}

export function parseContentDisposition(
  header: string | undefined | null,
): string | null {
  if (!header) return null;

  // Try filename*= first (RFC 5987)
  const encodedMatch = header.match(/filename\*=(?:UTF-8''|utf-8'')(.+)/i);
  if (encodedMatch) {
    return decodeURIComponent(encodedMatch[1]);
  }

  // Try filename= (with or without quotes)
  const match = header.match(/filename="?([^";\n]+)"?/i);
  if (match) {
    return match[1].trim();
  }

  return null;
}

// file-type only needs a few KB to detect magic bytes, and the text heuristic
// only needs enough to see past leading whitespace/comments.
const HEADER_BYTES = 4100;

export function readFileHeader(filePath: string): Buffer {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    const bytesRead = fs.readSync(fd, buffer, 0, HEADER_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

export async function detectContentType(
  filePath: string,
): Promise<string | null> {
  try {
    const result = await fileTypeFromBuffer(readFileHeader(filePath));
    return result?.mime ?? null;
  } catch (err) {
    // Best-effort sniff: a thrown error (e.g. the file vanished or is
    // unreadable) is treated as "unknown type", but log it at debug so an I/O
    // problem isn't indistinguishable from a genuinely unrecognized format.
    logger.debug('content-type detection failed', {
      filePath,
      error: err instanceof Error ? (err.stack ?? err.message) : String(err),
    });
    return null;
  }
}

export function archiveOldVersion(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const dir = path.dirname(filePath);
  const versionsDir = path.join(dir, '.versions');
  fs.mkdirSync(versionsDir, { recursive: true });

  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const archiveName = `${base}.${timestamp}${ext}`;

  fs.renameSync(filePath, path.join(versionsDir, archiveName));
  logger.debug(`Archived old version: ${archiveName}`);
}

export interface DownloadResult {
  action: 'downloaded' | 'updated' | 'unchanged' | 'error';
  info?: DownloadedInfo;
  error?: string;
  /**
   * HTTP status code when the error came from an HTTP response (e.g. 404).
   * Undefined for non-HTTP failures (network errors, rejected payloads).
   */
  statusCode?: number;
  rejectedUrl?: string;
  rejectionReason?: string;
}

function isDhhsDocumentPage(sourceType: string, url: string): boolean {
  const parsed = new URL(url);
  return sourceType === 'dhhs_policy'
    && parsed.hostname === 'policies.ncdhhs.gov'
    && parsed.pathname.startsWith('/document/');
}

/** Follow one unambiguous attachment in the official WordPress document body. */
function dhhsDocumentAttachment(
  filePath: string,
  pageUrl: string,
  expectedTitle: string | null,
  allowedFormats: readonly string[],
): string {
  const $ = cheerio.load(fs.readFileSync(filePath, 'utf8'));
  const title = $('main .wp-block-post-title').first().text();
  if (!title || (expectedTitle && normalizeHtmlText(title) !== normalizeHtmlText(expectedTitle))) {
    throw new Error('DHHS document page title does not match the registered document');
  }
  const candidates = new Set<string>();
  $('main .wp-block-post-content a[href]').each((_index, anchor) => {
    const url = new URL($(anchor).attr('href')!, pageUrl);
    const extension = path.extname(url.pathname).toLowerCase();
    if (allowedFormats.includes(extension) && !TEXT_FORMAT_EXTENSIONS.has(extension)) {
      if (!isAllowedSourceUrl('dhhs_policy', url.href)) throw new UrlRejectedError(url.href);
      url.hash = '';
      candidates.add(url.href);
    }
  });
  if (candidates.size !== 1) {
    throw new Error(`DHHS document page has ${candidates.size} attachments; expected exactly one`);
  }
  return [...candidates][0]!;
}

export async function downloadDocument(
  doc: DocumentRecord,
  fetcher: Fetcher,
  existingFilenames: Set<string>,
  documentsDir: string = config.documentsDir,
): Promise<DownloadResult> {
  const sourceDir = path.join(
    documentsDir,
    SOURCE_TYPE_DIRS[doc.source_type] ?? doc.source_type,
  );
  fs.mkdirSync(sourceDir, { recursive: true });

  // Build a temporary path for the download
  const tmpPath = path.join(sourceDir, `.download-${doc.id}.tmp`);
  const sourceType = doc.source_type as SourceType;
  const sourceFamily = getSourceFamily(sourceType);
  const semanticHtmlRequired = requiresSemanticArticleHtml(
    sourceFamily.allowed_file_formats,
  ) || (sourceFamily.allowed_file_formats.includes('.html') && sourceFamily.seed_urls.includes(doc.source_url));
  const requiredHtmlText = doc.source_type === 'bulletin'
    && doc.source_url === 'https://medicaid.ncdhhs.gov/blog/2024/09/25/reminder-key-covid-19-changes-effective-oct-1-2024'
    ? ['Over-the-Counter Tests for Home Use Coverage for COVID-19', 'ends Sept. 30, 2024']
    : [];
  const isAllowedUrl = (value: string): boolean =>
    isAllowedSourceUrl(sourceType, value);
  const dhhsDocumentPage = isDhhsDocumentPage(sourceType, doc.source_url);

  try {
    // Prepare conditional headers
    let result: FetchFileResult = await fetcher.fetchFile(
      doc.source_url,
      tmpPath,
      {
        // HTML-only guidance is tiny and must be checked against the current
        // semantic contract on every crawl, not trusted through stale 304s.
        etag: semanticHtmlRequired || dhhsDocumentPage ? undefined : (doc.etag ?? undefined),
        lastModified: semanticHtmlRequired || dhhsDocumentPage ? undefined : (doc.last_modified ?? undefined),
        isAllowedUrl,
        maxBytes: config.maxFileSizeBytes,
      },
    );

    let finalUrl = result.finalUrl ?? doc.source_url;
    if (!isAllowedUrl(finalUrl)) {
      throw new UrlRejectedError(finalUrl);
    }

    if (
      dhhsDocumentPage && result.statusCode === 200 && result.filePath
      && looksLikeTextPayload(readFileHeader(tmpPath))
    ) {
      if (!isDhhsDocumentPage(sourceType, finalUrl)) {
        throw new Error('DHHS document page redirected away from the document repository');
      }
      const attachmentUrl = dhhsDocumentAttachment(
        tmpPath, finalUrl, doc.title, sourceFamily.allowed_file_formats,
      );
      fs.unlinkSync(tmpPath);
      // Attachment validators cannot validate the wrapper, or vice versa.
      // Fetch both without conditional headers and never recurse into HTML.
      result = await fetcher.fetchFile(attachmentUrl, tmpPath, {
        isAllowedUrl,
        maxBytes: config.maxFileSizeBytes,
      });
      finalUrl = result.finalUrl ?? attachmentUrl;
      if (!isAllowedUrl(finalUrl)) throw new UrlRejectedError(finalUrl);
    }
    if (dhhsDocumentPage && result.statusCode === 304) {
      throw new Error('Cannot validate a 304 DHHS document page or attachment');
    }

    // 304 Not Modified
    if (result.statusCode === 304) {
      if (semanticHtmlRequired) {
        const existingPath = doc.local_path
          ? path.join(documentsDir, doc.local_path)
          : null;
        if (!existingPath || !fs.existsSync(existingPath)) {
          return {
            action: 'error',
            error: 'Cannot validate a 304 HTML response without a stored document',
          };
        }
        const validationError = validateSemanticArticleHtml(existingPath, doc.title, requiredHtmlText);
        if (validationError) {
          return { action: 'error', error: validationError };
        }
      }
      return { action: 'unchanged' };
    }

    // Non-200 responses
    if (result.statusCode !== 200 || !result.filePath) {
      return {
        action: 'error',
        error: `HTTP ${result.statusCode}`,
        statusCode: result.statusCode,
      };
    }

    // Check file size against limit
    const tmpStats = fs.statSync(tmpPath);
    if (tmpStats.size > config.maxFileSizeBytes) {
      logger.warn(
        `${doc.source_url} exceeds max file size (${Math.round(tmpStats.size / 1024 / 1024)} MB) — skipping`,
      );
      fs.unlinkSync(tmpPath);
      return {
        action: 'error',
        error: `File too large: ${Math.round(tmpStats.size / 1024 / 1024)} MB exceeds ${config.maxFileSizeBytes / 1024 / 1024} MB limit`,
      };
    }

    // Text formats have no magic bytes. For an HTML-only source family, infer
    // text/html from the markup itself rather than trusting a missing, generic,
    // or differently-cased response MIME.
    const responseContentType = (result.headers['content-type'] as string | undefined)
      ?.split(';')[0]
      ?.trim()
      ?.toLowerCase() ?? null;
    const header = readFileHeader(tmpPath);
    const textLikePayload = looksLikeTextPayload(header);
    const magicContentType = await detectContentType(tmpPath);
    const detectedContentType =
      magicContentType
      ?? (
        textLikePayload && semanticHtmlRequired
          ? 'text/html'
          : textLikePayload && allowsTextFormats(sourceFamily.allowed_file_formats)
            ? responseContentType
            : null
      );

    // Reject files whose detected magic bytes don't match the source family's
    // allowed_file_formats. Catches HTML error pages masquerading as PDFs and
    // the occasional surprise binary (see RUNBOOK troubleshooting note).
    if (!detectedTypeMatchesAllowedFormats(detectedContentType, sourceFamily.allowed_file_formats)) {
      fs.unlinkSync(tmpPath);
      logger.warn(
        `${doc.source_url} content-type ${detectedContentType ?? 'unknown'} not in ` +
          `${doc.source_type}.allowed_file_formats (${sourceFamily.allowed_file_formats.join(', ')}) — rejected`,
      );
      return {
        action: 'error',
        error: `Content-type ${detectedContentType ?? 'unknown'} not allowed for source_type ${doc.source_type}`,
      };
    }

    if (detectedContentType === 'text/html' && sourceType === 'bulletin' && !sourceFamily.seed_urls.includes(doc.source_url)) {
      fs.unlinkSync(tmpPath);
      return { action: 'error', error: 'Full-text bulletin HTML is allowed only for explicitly declared seed URLs' };
    }
    if (semanticHtmlRequired || detectedContentType === 'text/html') {
      const validationError = validateSemanticArticleHtml(tmpPath, doc.title, requiredHtmlText);
      if (validationError) {
        fs.unlinkSync(tmpPath);
        logger.warn(`${doc.source_url} ${validationError.toLowerCase()} — rejected`);
        return {
          action: 'error',
          error: validationError,
        };
      }
    }

    // file-type cannot detect text formats, so a null detection may be an HTML
    // soft-404 or maintenance page served with a 200. If the source family
    // only allows binary document formats, reject text-looking payloads
    // instead of poisoning the corpus with HTML saved as .pdf.
    if (
      detectedContentType === null &&
      !allowsTextFormats(sourceFamily.allowed_file_formats) &&
      textLikePayload
    ) {
      fs.unlinkSync(tmpPath);
      logger.warn(
        `${doc.source_url} payload looks like HTML/text but ${doc.source_type} ` +
          `only allows binary formats (${sourceFamily.allowed_file_formats.join(', ')}) — rejected`,
      );
      return {
        action: 'error',
        error: `Payload looks like HTML/text, not allowed for source_type ${doc.source_type}`,
      };
    }

    // Hash short-circuit only after semantic/type validation. This revalidates
    // payloads accepted by older crawler versions even when bytes are identical.
    const fileHash = await hashFile(tmpPath);
    const detectedExtension = MIME_TO_EXTENSIONS[detectedContentType ?? '']?.[0] ?? null;
    const needsExtensionMigration = Boolean(
      doc.local_path
      && detectedExtension
      && path.extname(doc.local_path).toLowerCase() !== detectedExtension,
    );
    if (doc.file_hash && fileHash === doc.file_hash && !needsExtensionMigration) {
      fs.unlinkSync(tmpPath);
      return { action: 'unchanged' };
    }

    // Parse Content-Disposition
    const contentDisposition = parseContentDisposition(
      result.headers['content-disposition'] as string | undefined,
    );

    // Determine file extension
    const ext =
      MIME_TO_EXTENSIONS[detectedContentType ?? '']?.[0]
      ?? (path.extname(contentDisposition ?? new URL(finalUrl).pathname) || '.pdf');

    // Archive old version BEFORE building filename so the old name
    // is freed from the collision set. This also migrates HTML payloads that
    // older crawlers saved with a fallback .pdf extension.
    if (
      doc.local_path
      && doc.file_hash
      && (fileHash !== doc.file_hash || needsExtensionMigration)
    ) {
      const oldFullPath = path.join(documentsDir, doc.local_path);
      const oldFilename = path.basename(doc.local_path);
      archiveOldVersion(oldFullPath);
      existingFilenames.delete(oldFilename);
    }

    // Build final filename (old name is now available for reuse)
    const filename = buildFilename({
      policyNumber: doc.policy_number,
      title: doc.title,
      extension: ext,
      existingNames: existingFilenames,
    });

    const finalPath = path.join(sourceDir, filename);

    // Move tmp file to final location
    fs.renameSync(tmpPath, finalPath);
    existingFilenames.add(filename);

    const stats = fs.statSync(finalPath);
    const relativePath = path.join(
      SOURCE_TYPE_DIRS[doc.source_type] ?? doc.source_type,
      filename,
    );

    const mimeType = responseContentType;

    const info: DownloadedInfo = {
      local_path: relativePath,
      file_hash: fileHash,
      file_size: stats.size,
      mime_type: mimeType,
      detected_content_type: detectedContentType,
      content_disposition_filename: contentDisposition,
      etag: (result.headers['etag'] as string) ?? null,
      last_modified: (result.headers['last-modified'] as string) ?? null,
    };

    const action = doc.file_hash ? 'updated' : 'downloaded';
    return { action, info };
  } catch (err) {
    // Clean up tmp file on error
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
    return {
      action: 'error',
      error: (err as Error).message,
      statusCode: err instanceof HttpStatusError ? err.statusCode : undefined,
      rejectedUrl: err instanceof UrlRejectedError ? err.url : undefined,
      rejectionReason:
        err instanceof UrlRejectedError
          ? 'redirect target outside source-family allowlist'
          : err instanceof FileTooLargeError
            ? `download exceeded ${err.maxBytes} byte limit`
            : undefined,
    };
  }
}
