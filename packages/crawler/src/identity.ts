/**
 * Stable source identity shared by crawler discovery and the registry.
 *
 * Fragments identify a location inside a document, not a distinct artifact.
 * Query parameters are retained because some publishers use them to select
 * which attachment is downloaded.
 */
export function canonicalizeSourceUrl(sourceUrl: string): string {
  const value = sourceUrl.trim();
  if (!value) {
    throw new Error('source URL cannot be empty');
  }

  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`source URL must use http or https: ${sourceUrl}`);
  }

  url.hash = '';
  const encode = (value: string) =>
    encodeURIComponent(value).replace(
      /[!'()*]/g,
      (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  const query = [...url.searchParams.entries()]
    .sort(([aKey, aValue], [bKey, bValue]) => {
      if (aKey !== bKey) return aKey < bKey ? -1 : 1;
      if (aValue !== bValue) return aValue < bValue ? -1 : 1;
      return 0;
    })
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .join('&');
  url.search = query ? `?${query}` : '';
  return url.toString();
}
