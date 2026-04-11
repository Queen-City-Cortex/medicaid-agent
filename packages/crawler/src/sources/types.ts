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
  discover(fetcher: Fetcher, sinceYear?: number): Promise<DiscoveredDocument[]>;
}

// Forward reference — defined in fetcher.ts, imported by source modules
export interface Fetcher {
  fetchHtml(url: string): Promise<{ body: string; statusCode: number }>;
  fetchFile(
    url: string,
    destPath: string,
    conditionalHeaders?: { etag?: string; lastModified?: string },
  ): Promise<FetchFileResult>;
}

export interface FetchFileResult {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  filePath: string | null; // null if 304
  downloaded: boolean;
}
