# Rate an answer

Under each answer the user can rate it helpful or unhelpful. Choosing unhelpful opens a `What went wrong?` box with `Submit comment`. A comment containing a client identifier is refused with the reason, and the text stays in the box. Ratings come back when the thread is reopened.

## Sub-features

- `fb-up` fills `Rate helpful`, and the rating persists.
- `fb-down` opens the comment box from `Rate unhelpful`.
- `fb-comment-refused` keeps a comment refused for a client identifier in the box and shows the reason.
- `fb-rehydrate` shows the stored rating when an existing thread is reopened.
- `fb-trace` renders the research trace from stored V2-format messages on reopen.

## How to get to it (user POV)

- After any answer in `/chat`, use the thumbs buttons labelled `Rate helpful` and `Rate unhelpful` below it.
- After `Rate unhelpful`, type in `What went wrong?` and choose `Submit comment`.
- Reopen a rated thread from the sidebar (`thread-item`).

## Driving it with verify.sh

Preconditions:

- `$V doctor` prints `doctor: OK`.
- The spec mocks the agent's feedback endpoints and stored feedback.

- **All feedback paths.** Run `$V drive e2e:tests/mocked/feedback.spec.ts`. Five tests pass: `thumbs-up fills button and persists`, `thumbs-down shows comment input`, `a comment refused for a client identifier stays in the box with the reason`, `feedback rehydrates when selecting an existing thread` and `research trace renders from V2 format messages on thread reload`.
- **One path.** Add a filter, for example `$V drive e2e:tests/mocked/feedback.spec.ts -- -g "thumbs-up"`.
- **Proof.** `e2e-feedback/report.json` lists the passed titles. Each test's `trace.zip` shows the click, the filled or pressed button and the request to the feedback endpoint.

## Gotchas

- Stored feedback is a fixture (`feedbackEntries`), so rehydration proves the UI reads and renders it, not that the agent stored it.
- Feedback buttons appear only on a completed answer. Wait for the input to re-enable before clicking.
