// Structural section picks for yes/no coverage frames. NC clinical coverage
// policies share one template, so the sections a yes/no answer rests on are
// found by section number and heading, never by words in a section's body.
//
// A document listing carries no section text and the graph's parent links are
// unreliable (an unnumbered heading can adopt later numbered sections), so
// "child of" is read from the dotted number and "has text" is decided by the
// caller after reading the section.

import type { DocumentSectionView } from '../../types.js';
import {
  CONTAINER_NOTE_LEAD,
  combineText,
  compareSectionListing,
  includesPhrase,
  normalizeSearchText,
  normalizeTitleKey,
} from '../../internal/shared.js';

// A section as a listing entry (`number`), a search hit or a hydrated section
// (`sectionNumber`).
interface NumberedSection {
  sectionNumber?: string | null;
  number?: string | null;
}

interface NumberedHeading extends NumberedSection {
  title: string | null;
}

/** Template sections that support a yes/no answer, in the order they are offered. */
export const YES_NO_SUPPORTING_SECTION_NUMBERS = ['4.1', '4.2.1', '3.2.1'] as const;

const DESCRIPTION_SECTION_NUMBER = '1.0';
const DESCRIPTION_HEADING = 'description of the procedure, product';

function sectionNumberOf(section: NumberedSection): string {
  return normalizeSearchText(section.sectionNumber ?? section.number).trim();
}

export function hasSectionText(section: { content: string | null }): boolean {
  return section.content != null && section.content.trim().length > 0;
}

/**
 * Text a slot can be filled with. Three bodies read as text and say nothing:
 * the "### title" lines of a heading read through the sections under it, a
 * "None Apply." placeholder, and a lone list stem ending in a colon
 * ("Medicaid shall not cover the following:") whose items are stored in other
 * sections.
 */
export function hasSubstantiveText(section: { content: string | null }): boolean {
  const lines = (section.content ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('### ') && !/^none appl(y|ies)\.?$/i.test(line));
  return lines.length > 0 && !(lines.length === 1 && lines[0].endsWith(':'));
}

/** A heading with no text of its own, read as the text of the sections under it. */
export function isContainerRead(section: { contentNote?: string | null }): boolean {
  return section.contentNote?.startsWith(CONTAINER_NOTE_LEAD) ?? false;
}

// "3.2.1" is [3, 2, 1]; a trailing ".0" marks a top-level section, so "3.0" is [3].
function numberPath(section: NumberedSection): string[] | null {
  const number = sectionNumberOf(section);
  if (!/^\d+(\.\d+)+$/.test(number)) return null;
  const parts = number.split('.');
  if (parts[parts.length - 1] === '0') parts.pop();
  return parts;
}

/** True when `inner` is numbered under `outer` (4.2.1 under 4.2, 3.1 under 3.0). */
export function isNumberedUnder(inner: NumberedSection, outer: NumberedSection): boolean {
  const innerPath = numberPath(inner);
  const outerPath = numberPath(outer);
  return (
    innerPath != null &&
    outerPath != null &&
    outerPath.length < innerPath.length &&
    outerPath.every((part, index) => part === innerPath[index])
  );
}

/**
 * The policy's description section: section 1.0, or the unnumbered
 * "Description of the Procedure, Product, or Service" heading in the few
 * policies whose first section lost its number.
 */
export function isPolicyDescriptionSection(section: NumberedHeading): boolean {
  const number = sectionNumberOf(section);
  if (number === DESCRIPTION_SECTION_NUMBER) return true;
  return number.length === 0 && normalizeTitleKey(section.title).startsWith(DESCRIPTION_HEADING);
}

/** A numbered section under 1.0 (1.1, 1.1.2, ...), by dotted number alone. */
export function isPolicyDescriptionChild(section: NumberedSection): boolean {
  return /^1\.\d+(\.\d+)*$/.test(sectionNumberOf(section)) && sectionNumberOf(section) !== DESCRIPTION_SECTION_NUMBER;
}

/**
 * Sections to read, in order, for the description slot: the description
 * section, then its numbered children in listing order. The caller takes the
 * first one that has text and leaves the slot empty when none does.
 */
export function pickDescriptionSectionIds(sections: readonly DocumentSectionView[]): string[] {
  const listed = [...sections].sort(compareSectionListing);
  return [
    ...listed.filter((section) => isPolicyDescriptionSection(section)),
    ...listed.filter((section) => isPolicyDescriptionChild(section)),
  ].map((section) => section.id);
}

/** Listed sections with exactly these numbers, in the order the numbers are given. */
export function pickSectionIdsByNumber(sections: readonly DocumentSectionView[], numbers: readonly string[]): string[] {
  return numbers.flatMap((number) =>
    [...sections]
      .sort(compareSectionListing)
      .filter((section) => sectionNumberOf(section) === number)
      .slice(0, 1)
      .map((section) => section.id),
  );
}

// Sections 3.0, 4.0, 5.0 and 7.0 of the template open with a one-line note
// ("Note: Refer to Subsection 2.2.1 regarding EPSDT Exception to Policy
// Limitations for a Medicaid Beneficiary under 21 Years of Age."), which
// search matches readily for an "is it covered" question and which answers
// nothing. The pattern covers the wordings in the parsed policies: with or
// without "Note:", subsection 2.2, 2.2.1, 2.2.2 or 2.3.1 with stray spaces,
// "Beneficiary", "Beneficiaries" or "Recipients", and a trailing amendment date.
const EPSDT_CROSS_REFERENCE_NOTE =
  /^(note:\s*)?refer to subsection [\d. ]+regarding epsdt exception to policy limitations for (a )?medicaid (beneficiary|beneficiaries|recipients) under 21 years of age\.*( amended date: [a-z]+ \d{1,2}, \d{4})?$/;

/** A search hit whose whole text is that note. Decided by what it says, not by its length or number. */
export function isEpsdtCrossReferenceNote(hit: { content: string | null }): boolean {
  return EPSDT_CROSS_REFERENCE_NOTE.test(normalizeSearchText(hit.content).replace(/\s+/g, ' ').trim());
}

// Where a template slot's text is when the section itself reads "None
// Apply.": the "Medicaid Additional Criteria" section beside it (4.2.2 for
// 4.2.1, 3.2.2 for 3.2.1).
const TEMPLATE_SLOT_ALTERNATES: Record<string, string> = { '4.2.1': '4.2.2', '3.2.1': '3.2.2' };

/**
 * Sections to read, in order, for one template slot: the section with that
 * number, the sections numbered under it, then its alternate. The caller
 * takes the first with substantive text, so a 4.2.1 that is only a list stem
 * gives way to its first numbered item and a "None Apply." 4.2.1 to 4.2.2.
 */
export function pickTemplateSlotSectionIds(sections: readonly DocumentSectionView[], number: string): string[] {
  const listed = [...sections].sort(compareSectionListing);
  const withNumber = (wanted: string | undefined) => listed.filter((section) => sectionNumberOf(section) === wanted).slice(0, 1);
  const own = withNumber(number);
  return [
    ...own,
    ...listed.filter((section) => own.length > 0 && isNumberedUnder(section, own[0])),
    ...withNumber(TEMPLATE_SLOT_ALTERNATES[number]),
  ].map((section) => section.id);
}

export function isYesNoSupportingTemplateSection(section: NumberedSection): boolean {
  return (YES_NO_SUPPORTING_SECTION_NUMBERS as readonly string[]).includes(sectionNumberOf(section));
}

/** True when a document listing has the clinical coverage template's description or criteria sections. */
export function hasPolicyTemplateSections(sections: readonly DocumentSectionView[]): boolean {
  return (
    sections.some((section) => isPolicyDescriptionSection(section)) ||
    pickSectionIdsByNumber(sections, YES_NO_SUPPORTING_SECTION_NUMBERS).length > 0
  );
}

// --- The under-21 EPSDT provision -------------------------------------------

// The template heading of section 2.2.1, "EPSDT Special Provision: Exception
// to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age".
const EPSDT_PROVISION_HEADING_PHRASES = ['epsdt special provision', 'exception to policy limitations'];
// In 40 of 174 parsed clinical policies section 2.2.1 is a bare heading and
// the provision's text sits under this unnumbered heading that follows it.
const EPSDT_PROVISION_STATUTE_HEADING = /^a\.\s*42 u\.s\.c\. ?§ ?1396d\(r\)/;

function isEpsdtProvisionNumberedHeading(section: { sectionNumber?: string | null; number?: string | null; title: string | null }): boolean {
  return includesPhrase(combineText(section.sectionNumber ?? section.number, section.title), EPSDT_PROVISION_HEADING_PHRASES);
}

function isEpsdtProvisionStatuteHeading(section: { title: string | null }): boolean {
  return EPSDT_PROVISION_STATUTE_HEADING.test(normalizeTitleKey(section.title));
}

/**
 * A heading under which a policy states the EPSDT exception for beneficiaries
 * under 21. Decided on section number and title alone: the 3.0, 4.0, 5.0 and
 * 7.0 sections of the template carry a one-line note that names the
 * provision in their body, and they are not it.
 */
export function isEpsdtProvisionHeading(section: {
  sectionNumber?: string | null;
  number?: string | null;
  title: string | null;
}): boolean {
  return isEpsdtProvisionNumberedHeading(section) || isEpsdtProvisionStatuteHeading(section);
}

// In three parsed policies (12B, 13B, 3K-1) the 2.2.1 heading and the statute
// line were read as list items, so the provision is the opening of the body
// of "2.2 Special Provisions" and no section has its heading. This is the one
// place a body is read to find the provision, and only for section 2.2's own
// text: a 2.2 read through the sections under it is not the provision.
const SPECIAL_PROVISIONS_NUMBER = '2.2';
const EPSDT_PROVISION_BODY_OPENING = /^2\.2\.1 epsdt special provision: exception to policy limitations/;

function isSpecialProvisionsSectionHoldingEpsdt(section: {
  sectionNumber?: string | null;
  number?: string | null;
  content?: string | null;
  contentNote?: string | null;
}): boolean {
  return (
    sectionNumberOf(section) === SPECIAL_PROVISIONS_NUMBER &&
    !isContainerRead(section) &&
    EPSDT_PROVISION_BODY_OPENING.test(normalizeSearchText(section.content).trim())
  );
}

/**
 * The one test for "this section is the under-21 EPSDT provision and can be
 * cited": its heading is the provision's and it has text. Selection and the
 * agent's answer plan both use it.
 */
export function isEpsdtSpecialProvisionSection(section: {
  sectionNumber: string | null;
  title: string | null;
  content: string | null;
  contentNote?: string | null;
}): boolean {
  return (isEpsdtProvisionHeading(section) && hasSectionText(section)) || isSpecialProvisionsSectionHoldingEpsdt(section);
}

/**
 * Sections to read, in order, for the provision: the numbered heading, the
 * statute heading that holds the text when the numbered one is empty, then
 * section 2.2 for the policies where neither heading was parsed.
 */
export function pickEpsdtProvisionSectionIds(sections: readonly DocumentSectionView[]): string[] {
  const listed = [...sections].sort(compareSectionListing);
  return [
    ...listed.filter(isEpsdtProvisionNumberedHeading),
    ...listed.filter(isEpsdtProvisionStatuteHeading),
    ...listed.filter((section) => sectionNumberOf(section) === SPECIAL_PROVISIONS_NUMBER),
  ].map((section) => section.id);
}

/** Numbered provision first, so it is preferred when both headings carry text. */
export function orderEpsdtProvisionSections<T extends { sectionNumber: string | null; title: string | null }>(sections: T[]): T[] {
  return [...sections.filter(isEpsdtProvisionNumberedHeading), ...sections.filter((section) => !isEpsdtProvisionNumberedHeading(section))];
}
