import type { Processor, ProcessInputArgs, ProcessInputResult } from '@mastra/core/processors';
import { resolveCoverageScope } from '@nc-medicaid/policy-corpus';
import { log } from '../logger.js';
import { contentText } from './message-utils.js';
import type { GateTripwireMetadata } from './message-length-guard.js';
import { withPriorTurns } from './prior-turns.js';

export const COVERAGE_VERIFICATION_QUERY = 'coverage-verification-query';

const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december';
// The period forms the scope code's own date reading understands: a year, an ISO
// or month-name date, and the relative phrases it treats as an unstated period.
const PERIOD = new RegExp(`\\b20\\d{2}(?:-\\d{2}-\\d{2})?\\b|\\b(?:${MONTHS})\\b|\\b(?:last year|next year|previous year|back then)\\b`, 'gi');
const HAS_PERIOD = /\b20\d{2}\b|\b(?:last year|next year|previous year|back then)\b/i;
const HAS_LANGUAGE = /\b(?:english|spanish|gujarati|translat\w*)\b|ગુજરાતી/i;
// How a continuation opens: a connective, or a request for the document itself.
const CONTINUES = /^(?:(?:please|(?:can|could|will|would) you)\s+)?(?:and|ok(?:ay)?|then|what about|how about|for|in|on|as of|same|translate|provide|supply|show|give|generate|reproduce|download|quote)\b/i;
// The longest dated follow-up seen in review had nine words; past that a message
// carries a clause of its own. Three words is a date and at most one particle.
const CONTINUATION_WORDS = 9;
const BARE_WORDS = 3;
const NAMED_POLICY = /\b(?:policy\s+\d[\w.-]*|ma[\s-]*\d{4}|hcwd|cap\/da|epsdt)\b/i;

/**
 * The question the coverage boundary judges. A turn with a scoped subject of its
 * own, or that names another policy, stands alone and replaces any earlier
 * subject. Otherwise a turn inherits the most recent scoped subject when it is
 * a continuation (at most nine words opening with a continuation cue, or at most
 * three words) and either states a period while that subject is date-bound, or
 * names a language or translation while that subject is not date-bound. Every
 * other turn stands alone and leaves the earlier subject in place for a later
 * continuation. A translation of a dated answer therefore restates a released
 * answer and carries no dated-source requirement.
 */
export function coverageConversationQuery(messages: Array<{ role?: string; content?: unknown }>): string {
  const users = messages.filter(message => message.role === 'user').map(message => contentText(message.content).trim()).filter(Boolean);
  let subject = '';
  let query = '';
  for (const latest of users) {
    query = latest;
    if (resolveCoverageScope(latest)) { subject = latest; continue; }
    if (NAMED_POLICY.test(latest)) { subject = ''; continue; }
    const scope = subject ? resolveCoverageScope(subject) : null;
    const words = latest.split(/\s+/).length;
    if (!scope || words > CONTINUATION_WORDS || (words > BARE_WORDS && !CONTINUES.test(latest))) continue;
    // A dated table or a dated payment change, including one whose period is unsupported.
    const dateBound = scope.requestedDate !== null || (!!scope.notice && !scope.limitationIds.length);
    const period = HAS_PERIOD.test(latest);
    if (dateBound ? !period : !HAS_LANGUAGE.test(latest)) continue;
    let inherited = dateBound ? subject.replace(PERIOD, '') : subject;
    if (/\b(english|spanish)\b/i.test(latest)) inherited = inherited.replace(/gujarati|ગુજરાતી/gi, '');
    subject = query = `${inherited}\nFollow-up: ${latest}`;
  }
  return query;
}

export class CoverageBoundaryProcessor implements Processor {
  readonly id = 'coverage-boundary';
  processInput({ messages, requestContext, abort }: ProcessInputArgs<GateTripwireMetadata>): ProcessInputResult {
    // Earlier turns come from the stored thread, not the in-flight message list.
    const query = coverageConversationQuery(withPriorTurns(requestContext, messages));
    requestContext?.set(COVERAGE_VERIFICATION_QUERY, query);
    const scope = resolveCoverageScope(query);
    if (scope?.notice) {
      // Identifiers only: the question, its date and the notice stay out of the log.
      log.info('coverage_boundary.blocked', { policyId: scope.policyId, limitationIds: scope.limitationIds, reason: scope.limitationIds.length ? 'unavailable_original' : 'unsupported_period' });
      abort('Evidence required by this request is outside the supported coverage scope', {
        metadata: { code: 'coverage-limitation', userMessage: scope.notice },
      });
    }
    return messages;
  }
}
