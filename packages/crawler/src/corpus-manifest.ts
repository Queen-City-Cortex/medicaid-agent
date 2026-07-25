import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourceType } from './sources/types.js';

export type AuthorityTier = 'authoritative' | 'supporting' | 'operational' | 'form';

export interface SourceFamilyManifest {
  source_type: SourceType;
  directory_name: string;
  authority_tier: AuthorityTier;
  answer_role: string;
  required_for_answering: boolean;
  freshness_expectation: string;
  discovery_interval_hours: number;
  freshness_sla_days: number;
  allowed_domains: string[];
  allowed_file_formats: string[];
  landing_pages: string[];
  seed_urls: string[];
}

export interface CorpusManifest {
  source_families: SourceFamilyManifest[];
  federal_sources: Array<{
    source_type: 'federal_regulation' | 'federal_statute';
    authority_tier: AuthorityTier;
    answer_role: string;
    required_for_answering: boolean;
    freshness_expectation: string;
    refresh_interval_hours: number;
    freshness_sla_days: number;
    source_url: string;
  }>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(__dirname, '../../../corpus-manifest.json');

function assertManifest(manifest: CorpusManifest): CorpusManifest {
  if (!manifest || !Array.isArray(manifest.source_families)) {
    throw new Error('Corpus manifest must contain a source_families array.');
  }

  const seen = new Set<string>();
  for (const family of manifest.source_families) {
    if (seen.has(family.source_type)) {
      throw new Error(`Duplicate source family in corpus manifest: ${family.source_type}`);
    }
    seen.add(family.source_type);

    if (!family.directory_name) {
      throw new Error(`Corpus manifest missing directory_name for ${family.source_type}`);
    }
    if (!Array.isArray(family.allowed_domains) || family.allowed_domains.length === 0) {
      throw new Error(`Corpus manifest missing allowed_domains for ${family.source_type}`);
    }
    if (!Array.isArray(family.allowed_file_formats) || family.allowed_file_formats.length === 0) {
      throw new Error(`Corpus manifest missing allowed_file_formats for ${family.source_type}`);
    }
    if (!Array.isArray(family.landing_pages)) {
      throw new Error(`Corpus manifest missing landing_pages for ${family.source_type}`);
    }
    if (!Array.isArray(family.seed_urls)) {
      throw new Error(`Corpus manifest missing seed_urls for ${family.source_type}`);
    }
    if (
      !Number.isInteger(family.discovery_interval_hours)
      || family.discovery_interval_hours < 1
      || !Number.isInteger(family.freshness_sla_days)
      || family.freshness_sla_days < 1
    ) {
      throw new Error(`Corpus manifest has invalid freshness metadata for ${family.source_type}`);
    }
  }
  if (!Array.isArray(manifest.federal_sources) || manifest.federal_sources.length === 0) {
    throw new Error('Corpus manifest must contain federal_sources.');
  }
  for (const source of manifest.federal_sources) {
    if (
      !Number.isInteger(source.refresh_interval_hours)
      || source.refresh_interval_hours < 1
      || !Number.isInteger(source.freshness_sla_days)
      || source.freshness_sla_days < 1
    ) {
      throw new Error(`Corpus manifest has invalid freshness metadata for ${source.source_type}`);
    }
  }

  return manifest;
}

export function loadCorpusManifest(): CorpusManifest {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  return assertManifest(JSON.parse(raw) as CorpusManifest);
}

export const CORPUS_MANIFEST = loadCorpusManifest();

const SOURCE_FAMILY_MAP = new Map(
  CORPUS_MANIFEST.source_families.map((family) => [family.source_type, family]),
);

export function getSourceFamily(sourceType: SourceType): SourceFamilyManifest {
  const family = SOURCE_FAMILY_MAP.get(sourceType);
  if (!family) {
    throw new Error(`Unknown source type in manifest: ${sourceType}`);
  }
  return family;
}

export function isAllowedSourceUrl(
  sourceType: SourceType,
  value: string,
): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    return getSourceFamily(sourceType).allowed_domains.some((allowed) => {
      const domain = allowed.toLowerCase().replace(/^\./, '');
      return hostname === domain || hostname.endsWith(`.${domain}`);
    });
  } catch {
    return false;
  }
}

export function isAllowedCorpusUrl(value: string): boolean {
  return CORPUS_MANIFEST.source_families.some((family) =>
    isAllowedSourceUrl(family.source_type, value),
  );
}

export const MANIFEST_SOURCE_TYPES = CORPUS_MANIFEST.source_families.map(
  (family) => family.source_type,
);
