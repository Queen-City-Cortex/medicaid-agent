export type SourceType =
  | 'clinical_policy'
  | 'bulletin'
  | 'state_plan_amendment'
  | 'waiver'
  | 'provider_manual'
  | 'dhhs_policy'
  | 'fee_schedule'
  | 'billing_guidance'
  | 'managed_care_guidance'
  | 'managed_care_contract';

export interface DiscoveredDocument {
  source_url: string;
  discovered_from: string;
  source_type: SourceType;
  title: string | null;
  policy_number: string | null;
  category: string | null;
}

export interface SourceModule {
  /**
   * Discover documents for this source. `sinceYear` is the inclusive lower
   * bound — sources that publish dated content (bulletins, state plan
   * amendments) must apply it; sources that only ever surface the current
   * policy set (clinical policies, fee schedules) accept it and may ignore it.
   */
  discover(fetcher: Fetcher, sinceYear: number): Promise<DiscoveredDocument[]>;
}

// Forward reference — defined in fetcher.ts, imported by source modules
export interface Fetcher {
  fetchHtml(
    url: string,
    isAllowedUrl?: (url: string) => boolean,
  ): Promise<{ body: string; statusCode: number; finalUrl?: string }>;
  fetchFile(
    url: string,
    destPath: string,
    options?: FetchFileOptions,
  ): Promise<FetchFileResult>;
}

export interface FetchFileOptions {
  etag?: string;
  lastModified?: string;
  isAllowedUrl?: (url: string) => boolean;
  maxBytes?: number;
}

export interface FetchFileResult {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  filePath: string | null; // null if 304
  downloaded: boolean;
  finalUrl?: string;
}
