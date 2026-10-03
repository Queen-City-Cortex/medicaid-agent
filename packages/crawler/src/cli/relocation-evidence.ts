import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { isAllowedSourceUrl } from '../corpus-manifest.js';
import type { DocumentRecord } from '../db/registry.js';
import type { Fetcher, SourceType } from '../sources/types.js';
import { atomicJson, digest, stableJson } from './source-audit.js';

interface Capture {
  url: string;
  final_url: string;
  status_code: number;
  capture_path: string;
  sha256: string;
}
interface IdentityEvidence {
  schema_version: 1;
  source_url: string;
  payload_url: string;
  expected_payload_sha256: string;
  reviewed_identity_finding: string;
  captures: Capture[];
}

export function readRelocationEvidence(file: string, doc: DocumentRecord, payloadUrl: string) {
  const evidence: IdentityEvidence = JSON.parse(fs.readFileSync(file, 'utf8'));
  const family = doc.source_type as SourceType;
  const official = (url: string) => isAllowedSourceUrl(family, url);
  if (evidence.schema_version !== 1 || evidence.source_url !== doc.source_url
    || evidence.payload_url !== payloadUrl || !official(doc.source_url) || !official(payloadUrl)
    || !/^[a-f0-9]{64}$/.test(evidence.expected_payload_sha256)
    || typeof evidence.reviewed_identity_finding !== 'string' || !evidence.reviewed_identity_finding.trim()
    || !Array.isArray(evidence.captures) || !evidence.captures.length) {
    throw new Error('Invalid reviewed relocation identity evidence');
  }
  const root = fs.realpathSync(path.dirname(file));
  let originalLinked = false;
  let payloadLinked = false;
  const captures = evidence.captures.map(capture => {
    if (capture.status_code !== 200 || !official(capture.url) || capture.final_url !== capture.url
      || typeof capture.capture_path !== 'string' || path.isAbsolute(capture.capture_path)
      || ['identity-evidence.json', 'identity-evidence.json.pending'].includes(path.normalize(capture.capture_path))
      || capture.capture_path.split(/[\\/]/).includes('..') || !/^[a-f0-9]{64}$/.test(capture.sha256)) {
      throw new Error('Invalid official identity capture');
    }
    const source = fs.realpathSync(path.join(root, capture.capture_path));
    if (!source.startsWith(root + path.sep)) throw new Error('Identity capture escapes evidence directory');
    const bytes = fs.readFileSync(source);
    if (digest(bytes) !== capture.sha256) throw new Error('Identity capture hash changed');
    const $ = cheerio.load(bytes.toString('utf8'));
    for (const element of $('a[href]').toArray()) {
      try {
        const url = new URL($(element).attr('href')!, capture.url).href;
        originalLinked ||= url === doc.source_url;
        payloadLinked ||= url === payloadUrl;
      } catch { /* Ignore malformed unrelated links. */ }
    }
    return { capture, bytes };
  });
  if (!originalLinked || !payloadLinked) throw new Error('Official captures must link both original identity and payload');
  return { evidence, captures, fingerprint: digest(stableJson(evidence)) };
}

export function relocationFetcher(fetcher: Fetcher, payloadUrl: string): Fetcher {
  return {
    fetchHtml: (...args) => fetcher.fetchHtml(...args),
    fetchFile: async (url, destination, options) => {
      // A family-approved redirect is still a different, unreviewed payload.
      if (url !== payloadUrl) throw new Error('Unreviewed relocation URL');
      const result = await fetcher.fetchFile(url, destination, {
        ...options, isAllowedUrl: candidate => candidate === payloadUrl && (options?.isAllowedUrl?.(candidate) ?? false),
      });
      if (result.finalUrl && result.finalUrl !== payloadUrl) throw new Error('Unreviewed relocation redirect');
      return result;
    },
  };
}

export function retainRelocationEvidence(root: string, proof: ReturnType<typeof readRelocationEvidence>): void {
  const destination = path.join(root, proof.fingerprint);
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  const realRoot = fs.realpathSync(root);
  if (!fs.realpathSync(destination).startsWith(realRoot + path.sep)) throw new Error('Retained identity evidence escapes directory');
  for (const { capture, bytes } of proof.captures) {
    const file = path.join(destination, capture.capture_path);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const parent = fs.realpathSync(path.dirname(file));
    const realDestination = fs.realpathSync(destination);
    if (parent !== realDestination && !parent.startsWith(realDestination + path.sep)) throw new Error('Retained capture escapes directory');
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('Retained capture is a symlink');
    if (fs.existsSync(file) && digest(fs.readFileSync(file)) !== capture.sha256) throw new Error('Retained identity capture changed');
    fs.writeFileSync(file, bytes, { mode: 0o600 });
  }
  const manifest = path.join(destination, 'identity-evidence.json');
  if (fs.existsSync(manifest) && fs.lstatSync(manifest).isSymbolicLink()) throw new Error('Retained identity manifest is a symlink');
  if (fs.existsSync(manifest) && digest(stableJson(JSON.parse(fs.readFileSync(manifest, 'utf8')))) !== proof.fingerprint) {
    throw new Error('Retained identity evidence changed');
  }
  atomicJson(manifest, proof.evidence);
}
