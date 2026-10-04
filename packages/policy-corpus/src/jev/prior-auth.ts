import type { AnswerFrameSection } from '../types.js';
import { sectionRoleBonus } from './section-roles.js';
import { isPriorAuthProcessSection, isPriorAuthQuantitySection, isTitleOnlySection } from '../internal/shared.js';
/** Rank only within the same document and hard evidence lane. Preserve all
 * document/family slots, quantity precedence and process demotion. */
export function rankPriorAuthRoles(sections: AnswerFrameSection[], submission: boolean): AnswerFrameSection[] {
  if (process.env.JEV_SECTION_ROLES_ENABLED !== 'true') return sections;
  const groups = new Map<string, Array<{ section: AnswerFrameSection; score: number }>>();
  const key = (s: AnswerFrameSection) => `${s.documentId}\0${s.authorityTier}\0${s.status}\0${isPriorAuthQuantitySection(s)}\0${isPriorAuthProcessSection(s)}\0${isTitleOnlySection(s)}`;
  for (const section of sections) {
    const k = key(section);
    const group = groups.get(k) ?? [];
    // Existing ordinal evidence ordering becomes a bounded positional score.
    group.push({ section, score: -group.length * 0.25 + sectionRoleBonus(section, [submission ? 'pa_procedure' : 'pa_criteria']) });
    groups.set(k, group);
  }
  for (const group of groups.values()) group.sort((a, b) => b.score - a.score);
  return sections.map(s => groups.get(key(s))!.shift()!.section);
}
