import { expect } from 'vitest';
import type { AnswerFrame } from '../../src/types.js';

/**
 * What every answer frame must hold whatever the question: evidence the plan
 * points at carries text, negative guidance carries none, and no section sits
 * in two slots.
 */
export function expectFrameContentInvariant(frame: AnswerFrame): void {
  const label = (section: { sectionNumber: string | null; title: string | null }) => section.sectionNumber ?? section.title;
  const textless = [...frame.primarySections, ...frame.supportingSections]
    .filter((section) => !section.content || section.content.trim().length === 0)
    .map(label);
  expect(textless, 'primary or supporting sections without text').toEqual([]);
  expect(
    frame.avoidSections.filter((section) => section.content !== null).map(label),
    'avoid sections that still carry text',
  ).toEqual([]);
  const ids = [...frame.primarySections, ...frame.supportingSections, ...frame.avoidSections].map((section) => section.id);
  expect(
    ids.filter((id, index) => ids.indexOf(id) !== index),
    'sections listed in two slots',
  ).toEqual([]);
}
