import { describe, it, expect } from 'vitest';
import { scrubUiBreadcrumb } from '../../src/instrumentation-client';

// Messages below are in the shape the SDK's htmlTreeAsString produces for the
// event target: `tag.class[attr="value"]` segments joined by ' > '.
describe('scrubUiBreadcrumb', () => {
  it('strips the thread title from a ui.input crumb on the rename input', () => {
    const crumb = scrubUiBreadcrumb({
      category: 'ui.input',
      message:
        'div.group > div.flex > input.flex-1.text-xs[aria-label="Rename Can my mother keep her house on Medicaid"]',
    });

    expect(crumb.message).toBe('div.group > div.flex > input.flex-1.text-xs[aria-label]');
    expect(crumb.message).not.toContain('mother');
    expect(crumb.category).toBe('ui.input');
  });

  it('cuts from the first labelled attribute, so later title, alt and name values go too', () => {
    const crumb = scrubUiBreadcrumb({
      category: 'ui.click',
      message:
        'nav.side > img[alt="SENTINEL_ALT"] > button[aria-label="Thread actions for SENTINEL_LABEL"][type="button"][name="SENTINEL_NAME"]',
    });

    expect(crumb.message).toBe('nav.side > img[alt]');
    expect(crumb.message).not.toContain('SENTINEL');
  });

  it.each([
    'Rename my "odd"] SENTINEL_TAIL title',
    'Rename a"] > SENTINEL_TAIL',
    'Rename a"][title="SENTINEL_TAIL',
  ])('removes the whole value when a title looks like selector syntax: %s', (label) => {
    const crumb = scrubUiBreadcrumb({
      category: 'ui.input',
      message: `div.group > input[aria-label="${label}"]`,
    });

    expect(crumb.message).toBe('div.group > input[aria-label]');
  });

  it('leaves non-ui crumbs and crumbs without a message untouched', () => {
    const consoleCrumb = { category: 'console', message: 'saw [title="kept"]' };
    const bare = { category: 'ui.click' };

    expect(scrubUiBreadcrumb(consoleCrumb)).toBe(consoleCrumb);
    expect(scrubUiBreadcrumb(bare)).toBe(bare);
  });
});
