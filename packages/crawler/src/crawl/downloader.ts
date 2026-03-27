import fs from 'node:fs';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { hashFile } from '../utils/hash.js';
import { buildFilename } from '../utils/naming.js';
import { logger } from '../utils/logger.js';
import { config, SOURCE_TYPE_DIRS } from '../config.js';
import type { DocumentRecord, DownloadedInfo } from '../db/registry.js';
import type { Fetcher, FetchFileResult } from '../sources/types.js';

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

export async function detectContentType(
  filePath: string,
): Promise<string | null> {
  try {
    // Read a small header chunk — file-type only needs a few KB to detect magic bytes
    const HEADER_BYTES = 4100;
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(HEADER_BYTES);
    const bytesRead = fs.readSync(fd, buffer, 0, HEADER_BYTES, 0);
    fs.closeSync(fd);
    const result = await fileTypeFromBuffer(buffer.subarray(0, bytesRead));
    return result?.mime ?? null;
  } catch {
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
}

export async function downloadDocument(
  doc: DocumentRecord,
  fetcher: Fetcher,
  existingFilenames: Set<string>,
): Promise<DownloadResult> {
  const sourceDir = path.join(
    config.documentsDir,
    SOURCE_TYPE_DIRS[doc.source_type] ?? doc.source_type,
  );
  fs.mkdirSync(sourceDir, { recursive: true });

  // Build a temporary path for the download
  const tmpPath = path.join(sourceDir, `.download-${doc.id}.tmp`);

  try {
    // Prepare conditional headers
    const conditionalHeaders =
      doc.etag || doc.last_modified
        ? { etag: doc.etag ?? undefined, lastModified: doc.last_modified ?? undefined }
        : undefined;

    const result: FetchFileResult = await fetcher.fetchFile(
      doc.source_url,
      tmpPath,
      conditionalHeaders,
    );

    // 304 Not Modified
    if (result.statusCode === 304) {
      return { action: 'unchanged' };
    }

    // Non-200 responses
    if (result.statusCode === 404) {
      return { action: 'error', error: '404 Not Found (removed)' };
    }
    if (result.statusCode !== 200 || !result.filePath) {
      return {
        action: 'error',
        error: `HTTP ${result.statusCode}`,
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

    // Compute hash
    const fileHash = await hashFile(tmpPath);

    // Check if content actually changed (for servers that don't support conditional requests)
    if (doc.file_hash && fileHash === doc.file_hash) {
      fs.unlinkSync(tmpPath);
      return { action: 'unchanged' };
    }

    // Detect content type from magic bytes
    const detectedContentType = await detectContentType(tmpPath);

    // Parse Content-Disposition
    const contentDisposition = parseContentDisposition(
      result.headers['content-disposition'] as string | undefined,
    );

    // Determine file extension
    const ext = detectedContentType?.includes('pdf')
      ? '.pdf'
      : path.extname(
          contentDisposition ?? new URL(doc.source_url).pathname,
        ) || '.pdf';

    // Archive old version BEFORE building filename so the old name
    // is freed from the collision set
    if (doc.local_path && doc.file_hash && fileHash !== doc.file_hash) {
      const oldFullPath = path.join(config.documentsDir, doc.local_path);
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

    const mimeType = (result.headers['content-type'] as string)
      ?.split(';')[0]
      ?.trim() ?? null;

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
    return { action: 'error', error: (err as Error).message };
  }
}
