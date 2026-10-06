import { PromptInjectionDetector, type PromptInjectionDetectionEvent } from '@mastra/core/processors';
import { CLASSIFIER_DEADLINE_MS, CLASSIFIER_MODEL, openaiModel, withCallDeadline } from '../model.js';
import { log } from '../logger.js';
import { Sentry } from '../sentry.js';

/**
 * Mastra's detector fails OPEN: when its model call throws it prints a console
 * warning, allows the message, and reports this placeholder result. A real
 * verdict under the `block` strategy never has a `rewritten_content` key, so
 * its presence with every field null is the only failure signal the installed
 * detector exposes. tests/processors/injection-detector.test.ts pins it against
 * the real detector, so a Mastra upgrade that changes the shape fails there.
 */
export function isDetectorFailure({ detectionResult }: PromptInjectionDetectionEvent): boolean {
  return 'rewritten_content' in detectionResult
    && detectionResult.rewritten_content === null
    && detectionResult.categories === null
    && detectionResult.reason === null;
}

/** The one prompt-injection detector configuration, shared by the chat agent
 *  and the deep-research planner. The installed detector takes no deadline or
 *  abort signal, so the deadline is put on its model; a call that outlasts it
 *  fails open like any other detector error. Its internal agent already makes
 *  one attempt only. `lastMessageOnly` means one call, and so at most one
 *  failure report, per request. */
export function createInjectionDetector(): PromptInjectionDetector {
  return new PromptInjectionDetector({
    model: withCallDeadline(openaiModel(CLASSIFIER_MODEL), CLASSIFIER_DEADLINE_MS),
    threshold: 0.8,
    strategy: 'block',
    detectionTypes: ['injection', 'jailbreak', 'system-override'],
    // Recalled history was screened when it was sent; rescanning it costs one
    // call per message and lets an old answer block every later turn.
    lastMessageOnly: true,
    onDetection: (event) => {
      if (!isDetectorFailure(event)) return;
      log.error('prompt_injection.failed_open', { model: CLASSIFIER_MODEL, deadlineMs: CLASSIFIER_DEADLINE_MS });
      Sentry.captureException(new Error('Prompt-injection detector failed open'), { tags: { component: 'prompt-injection-detector' } });
    },
  });
}
