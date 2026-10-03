import type { Processor, ProcessInputArgs, ProcessInputResult } from '@mastra/core/processors';
import { resolveCoverageScope } from '@nc-medicaid/policy-corpus';
import { contentText } from './message-utils.js';
import type { GateTripwireMetadata } from './message-length-guard.js';

export const COVERAGE_VERIFICATION_QUERY = 'coverage-verification-query';

export function coverageConversationQuery(messages: Array<{ role?: string; content?: unknown }>): string {
  const users = messages.filter(message => message.role === 'user').map(message => contentText(message.content).trim()).filter(Boolean);
  return users.reduce((previous, latest) => {
    const dateOnly = /^(?:(?:what|how) about|and(?: for)?|in|on|for)?\s*(?:(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+(?:\d{1,2}[,]?\s+)?)?20\d{2}(?:-\d{2}-\d{2})?\s*[?.!]*$/i.test(latest);
    const languageOnly = /^(?:(?:what|how) about|and(?: in)?|in)?\s*(english|spanish|gujarati|ગુજરાતી)\s*[?.!]*$/i.test(latest);
    if (resolveCoverageScope(latest) || (!dateOnly && !languageOnly && !/\b(it|that|those|same|instead)\b/i.test(latest))) return latest;
    // Explicitly named new policies change subject rather than inherit a scoped topic.
    if (!previous || !resolveCoverageScope(previous) || /\b(?:policy\s+\d[\w.-]*|ma[\s-]*\d{4}|hcwd|cap\/da|epsdt)\b/i.test(latest)) return latest;
    let subject = previous;
    if (/\b20\d{2}\b/.test(latest)) subject = subject.replace(/\b20\d{2}(?:-\d{2}-\d{2})?\b/g, '').replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, '');
    if (/\b(english|spanish)\b/i.test(latest)) subject = subject.replace(/gujarati|ગુજરાતી/gi, '');
    return `${subject}\nFollow-up: ${latest}`;
  }, '');
}

export class CoverageBoundaryProcessor implements Processor {
  readonly id = 'coverage-boundary';
  processInput({ messages, requestContext, abort }: ProcessInputArgs<GateTripwireMetadata>): ProcessInputResult {
    const query = coverageConversationQuery(messages);
    requestContext?.set(COVERAGE_VERIFICATION_QUERY, query);
    const scope = resolveCoverageScope(query);
    if (scope?.notice) abort('Evidence required by this request is outside the supported coverage scope', {
      metadata: { code: 'coverage-limitation', userMessage: scope.notice },
    });
    return messages;
  }
}
