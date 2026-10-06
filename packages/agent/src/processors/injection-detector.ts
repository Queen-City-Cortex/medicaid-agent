import { PromptInjectionDetector, type PromptInjectionDetectionEvent } from '@mastra/core/processors';
import { CLASSIFIER_MODEL, openaiModel } from '../model.js';
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
 *  and the deep-research planner. */
export function createInjectionDetector(): PromptInjectionDetector {
  return new PromptInjectionDetector({
    model: openaiModel(CLASSIFIER_MODEL),
    threshold: 0.8,
    strategy: 'block',
    detectionTypes: ['injection', 'jailbreak', 'system-override'],
    // Recalled history was screened when it was sent; rescanning it costs one
    // call per message and lets an old answer block every later turn.
    lastMessageOnly: true,
    onDetection: (event) => {
      if (!isDetectorFailure(event)) return;
      log.error('prompt_injection.failed_open', { model: CLASSIFIER_MODEL });
      Sentry.captureException(new Error('Prompt-injection detector failed open'), { tags: { component: 'prompt-injection-detector' } });
    },
  });
}
