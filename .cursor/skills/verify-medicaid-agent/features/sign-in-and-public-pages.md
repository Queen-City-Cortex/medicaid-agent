# Sign-in gate and public pages

Logged-out visitors can read the landing page, terms of use, privacy policy and the Get help page, which lists three contacts. Opening `/chat` while logged out sends them to sign in. The hermetic instance sends them to the local stub at `127.0.0.1:8719`, never to WorkOS.

## Sub-features

- `pub-landing` renders the landing page logged out, with the citation-footnote disclaimer.
- `pub-links` links the landing page to terms, privacy and sign-in.
- `pub-terms` renders terms with the draft banner and the core clauses.
- `pub-privacy` renders privacy with the retention and subprocessor sections.
- `pub-help` makes Get help reachable logged out from the footer, listing three contacts (testid `get-help`).
- `auth-gate` makes logged-out `/chat` redirect to sign-in.

## How to get to it (user POV)

- Visit `/`, then follow `Terms`, `Privacy` and the sign-in link.
- Choose `Get help` in the footer (also linked from the chat disclaimer).
- Open `/chat` without a session.

## Driving it with verify.sh

Preconditions:

- `$V doctor` prints `doctor: OK`. Its `auth:` line already proves the logged-out `/chat` redirect goes to the local stub.

- **Public pages and gate.** Run `$V drive e2e:tests/mocked/public-pages.spec.ts`. Six tests pass: `renders logged out with the citation-footnote disclaimer`, `links to terms, privacy, and sign-in`, `/chat still requires sign-in when logged out`, `terms page renders with the draft banner and core clauses`, `privacy page renders with retention and subprocessor sections` and `is reachable logged out from the footer and lists the three contacts`.
- **Proof.** `e2e-public-pages/report.json` lists the passed titles. The traces show each page and the redirect `Location`.

## Gotchas

- This proves the gate redirects. It doesn't prove the real WorkOS hosted login, which needs a WorkOS app and a test account (smoke project, unverified here).
- These specs clear the storage state for logged-out checks. Don't reuse the signed-in context from a recipe to test them.
