# Ask a question

A signed-in user types an NC Medicaid policy question in the chat composer and sends it. Their message appears, the answer streams in, and only an answer the verifier passed is shown. It carries a `Verified against cited sources` badge, numbered footnotes and a Sources panel linking the policy section. A new thread appears in the sidebar and can be reopened after a reload.

## Sub-features

- `ask-send` sends the typed question with the `Ask` button.
- `ask-enter` sends with Enter. Enter on an empty input does nothing.
- `ask-example` fills the input from an empty-state example card.
- `ask-answer` renders the user message, then the streamed assistant answer, and re-enables the input.
- `ask-verified` shows the verification badge with `data-outcome="passed"`.
- `ask-cite` shows a footnote `[1]` and a Sources row whose link is the cited policy URL.
- `ask-request` makes the browser post exactly the new turn to the agent, with bearer auth and the user's resource id.
- `ask-reopen` lets the user reopen the titled thread from the sidebar after a reload and see the answer and badge again.

## How to get to it (user POV)

- Sign in, open `/chat`, type in the box (testid `chat-input`), and choose `Ask` (testid `send-button`).
- Same, but press Enter in the box.
- On an empty thread, click an example card (testid `example-card`) to fill the box, then send.
- Reopen a past question from the sidebar (testid `thread-item`).

## Driving it with verify.sh

Preconditions:

- `$V doctor` prints `doctor: OK`.
- The recipe mocks the agent. The answer, its tool step (policy 8C § 3.2.1), the `passed` verification status and the stored history are fixtures in `drive/ask-question.verify.ts`.

- **Open chat signed in.** Run `$V drive ask-question`. Step 1 (`1-signed-in-empty-state.png`) shows `/chat` with `empty-state` visible and no redirect to sign-in. After fast-forwarding to the 60 s corpus poll, `empty-state-corpus-status` reads `1,234 documents · last updated October 1, 2026` (fixture) and the masthead reads `Corpus updated Oct 1, 2026`.
- **Type the question.** The recipe fills `chat-input` with `Does NC Medicaid cover outpatient behavioral health services?`. Step 2 shows the text in the composer.
- **Send.** The recipe clicks `send-button`. `user-message` shows the question, then `assistant-message` shows the answer. `verification-badge` reads `Verified against cited sources` with `data-outcome="passed"`. `citation-footnote` has `data-source-number="1"`. The Sources row links `https://medicaid.ncdhhs.gov/8c/download`, and `chat-input` is enabled again. Step 3 is `3-verified-answer.png` / `.aria.yml`.
- **Agent boundary.** `artifacts/agent-boundary.json` lists every request to :4111. All are `recipe-mock`, except one `GET /corpus-status` labelled `corpus-status-mock`, and none are `aborted-unmocked`.
- **Side effect.** `artifacts/agent-request.json` records exactly one `POST /chat` with `authorization: bearer`. `messages` holds only the question, `memory.resource` is `user_e2e_test`, and `memory.thread` is the new thread id.
- **Reopen after reload.** The recipe reloads and clicks the `thread-item` titled `Outpatient behavioral health coverage`. The question and badge render again from history. Step 4 is `4-reopened-after-reload.png`.
- **Enter key and example cards.** Run `$V drive e2e:tests/mocked/keyboard.spec.ts -- -g "Enter"` and `$V drive e2e:tests/mocked/empty-state.spec.ts`. The tests `Enter key sends the message`, `Enter with empty input does nothing` and `clicking an example card fills the input` pass.
- **Proof.** `artifacts/summary.json` has `"result": "passed"`, `"agentPosts": 1` and the four steps. Run `$V evidence` to hash them.

## Gotchas

- The reopened thread is rebuilt from the recipe's `threadMessages` fixture, not from what streamed. It proves the reopen UI, not agent persistence. The fixture has no tool parts, so the reopened view has no Sources panel.
- A badge only renders once the stream sends `data-verification-status`. An answer without it is withheld, not shown unverified (see refused-answers).
- The first `/chat` hit after launch can take a few seconds to compile. `launch` warms it, but don't shorten timeouts.
- The disclaimer banner (`I understand`) overlaps the lower page in screenshots. That is expected first-visit UI.
- Real answers, real citations and real verification need the agent with `OPENAI_API_KEY`, `VOYAGE_API_KEY` and Neo4j. That path is unverified here (see `SKILL.md`).
