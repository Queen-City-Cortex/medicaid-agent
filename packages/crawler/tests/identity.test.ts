import { describe, expect, it } from 'vitest';
import { canonicalizeSourceUrl } from '../src/identity.js';

describe('canonicalizeSourceUrl', () => {
  it('normalizes host, default port, query order, encoding, and fragment', () => {
    expect(
      canonicalizeSourceUrl(
        "https://EXAMPLE.com:443/policy.pdf?note=one two&b=!'()*~#page=3",
      ),
    ).toBe(
      'https://example.com/policy.pdf?b=%21%27%28%29%2A~&note=one%20two',
    );
  });
});
