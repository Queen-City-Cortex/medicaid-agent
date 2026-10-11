# Refused and withheld answers

When the app must not show an answer, the user sees a plain notice instead of draft text. Cases: a safety tripwire fired, the user hit a rate or size limit, the verifier could not confirm the answer against its sources, or the question contained a client identifier. Where it helps, the notice offers a retry, and the user's typed text is never silently lost.

## Sub-features

- `refuse-blocked` turns a guard tripwire stream into a friendly `blocked-message` notice.
- `refuse-429` shows the server's rate-limit message (`chat-error-rate-limited`) with no `Try again`.
- `refuse-413` shows the server's payload-too-large message.
- `verify-corrected` shows a corrected answer with `Corrected and verified against cited sources` (`data-outcome="corrected"`), live and after a history reload.
- `verify-withheld` shows `withheld-answer` with `verification-retry` and none of the draft prose.
- `verify-legacy` keeps unchecked legacy history withheld across thread switches and reloads.
- `id-guard-422` rejects a second turn containing a client identifier with a 422 and a reason, and posts only that turn.
- `id-guard-first` leaves no thread after a refused first message. The next question creates and titles the thread.
- `id-guard-phone` answers a question quoting a public notice phone number with no identifier error.

## How to get to it (user POV)

- Ask any question in `/chat` (`chat-input` and `Ask`). The outcome depends on the agent's response, which the specs mock.
- Reopen a thread from the sidebar (`thread-item`) to see stored outcomes.
- Choose `verification-retry` on a withheld answer.

## Driving it with verify.sh

Preconditions:

- `$V doctor` prints `doctor: OK`.
- Each spec mocks the agent's status codes and streams itself.

- **Blocked and limits.** Run `$V drive e2e:tests/mocked/abuse-ui.spec.ts`. Three tests pass: `renders a 429 rate-limit response as the server message without Try again`, `renders a 413 payload-too-large response with the server message` and `renders a guard tripwire stream as a friendly blocked-message notice`.
- **Verification outcomes.** Run `$V drive e2e:tests/mocked/verification-release.spec.ts`. Three tests pass: `corrected answers stay verified in the stream and after history reload`, `withheld output cannot reveal draft prose and provides retry` and `legacy unchecked history remains withheld after thread switching and reload`.
- **Identifier guard.** Run `$V drive e2e:tests/mocked/identifier-guard.spec.ts`. Three tests pass: `a second turn posts only its own message and shows the 422 rejection`, `a refused first message leaves no thread, and the next question creates and titles it` and `a question quoting a notice phone number is answered, with no identifier error`.
- **Proof.** For each target, `report.json` lists the titles as `passed`. `playwright-output/<test>/trace.zip` replays the action and the notice, and `test-finished-1.png` shows the final state.

## Gotchas

- These are the repo's own specs. They assert but don't write numbered step artifacts. If a review needs step screenshots, port the case to a `drive/<name>.verify.ts` recipe.
- Which inputs the real server refuses (identifier patterns, rate limits, tripwire prompts) is decided in `packages/agent`. Here those responses are fixtures, so this proves the UI's handling, not the server's detection.
- Don't type real client identifiers (Medicaid IDs, SSNs) into any fixture or recipe. Use the specs' synthetic values.
