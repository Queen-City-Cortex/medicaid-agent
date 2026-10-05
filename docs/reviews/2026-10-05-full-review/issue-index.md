# Index of all issues

Each issue is tracked as a GitHub issue on the [review board](https://github.com/orgs/Queen-City-Cortex/projects/1); the Card column gives its number.

| Id | Severity | Effort | Issue | Findings | Card |
| --- | --- | --- | --- | --- | --- |
| SAFE-1 | high | M | Appeal answers give the federal 90-day ceiling where North Carolina's shorter limit applies | 1 | #222 |
| SAFE-2 | high | S | Verifier evidence budget drops cited section text and keeps section listings | 1 | #223 |
| SAFE-3 | high | M | Under-21 EPSDT exception often fails to reach adult yes/no coverage answers | 1 | #266 |
| SAFE-4 | high | M | Amendment lookup names the newest change notice as authoritative, and retrieval ignores document status | 2 | #267 |
| SAFE-5 | high | M | Questions about a past date are answered from current policy text | 1 | #326 |
| SAFE-6 | high | M | Release depends on one low-effort model call whose catch rate is unmeasured | 4 | #268 |
| SAFE-7 | high | M | Citation section labels are model-written, and no check ties them to evidence | 3 | #269 |
| SAFE-8 | high | S | Stream gate forwards unverified observer text, classifier reasons and raw tool errors | 1 | #224 |
| SAFE-9 | medium | S | Deterministic evidence guard is satisfied by the routing hint alone | 1 | #240 |
| SAFE-10 | medium | S | Planner injects a '60-day review cycle' directive whenever federal text contains '60 days' | 1 | #309 |
| SAFE-11 | medium | M | Keyword-only fallback retrieval is invisible to the answer frame, release record and evaluations | 2 | #393 |
| SAFE-12 | medium | S | Product tells people to seek local help but names no contact anywhere | 1 | #241 |
| SAFE-13 | medium | S | No path shows 988 or 911 to a user in crisis | 1 | #242 |
| SAFE-14 | medium | S | Verifier evidence omits the supersession details that `lookupPolicy` tells the model to relay | 1 | #394 |
| SAFE-15 | medium | S | Verifier keeps the retired rewrite design, and its confidence dot can contradict the badge | 1 | #310 |
| SAFE-16 | low | S | Verifier outages withhold finished answers under the same notice as grounding failures | 2 | #447 |
| SAFE-17 | low | S | Deep-research plan card shows unchecked planner statements before approval | 1 | #448 |
| SAFE-18 | low | S | A question can imitate the verifier's evidence block | 1 | #449 |
| SAFE-19 | low | S | Step-limit forced synthesis stores a spurious 'not verified' notice in history | 1 | #450 |
| SAFE-20 | low | S | Threads whose observational memory predates the release gate never rebuild it | 2 | #451 |
| SAFE-21 | low | S | Client disconnect cannot cancel verification because Mastra never passes the abort signal | 1 | #452 |
| SAFE-22 | low | S | Verifier prompt order makes the recheck pass re-bill all evidence uncached | 1 | #453 |
| SEC-1 | high | S | The production Neo4j password is committed in two tracked files and Git history | 1 | #216 |
| SEC-2 | high | M | A signed-in user can seize or read another user's conversation given its id | 3 | #225 |
| SEC-3 | medium | S | Client-written thread metadata reaches the model as system messages, bypassing the input guards | 1 | #311 |
| SEC-4 | medium | S | The production smoke-test account's email and password are committed in a plan document | 1 | #218 |
| SEC-5 | medium | S | No secret scanning runs, and default gitleaks would miss both live committed passwords | 2 | #395 |
| SEC-6 | medium | S | Nine GitHub Apps and the Claude workflows can write to unprotected, auto-deploying main | 2 | #243 |
| SEC-7 | medium | M | Production appears to authenticate through a WorkOS staging environment shared with the workstation | 1 | #312 |
| SEC-8 | medium | M | Open self-registration with only per-user limits leaves the shared model budget uncapped | 2 | #244 |
| SEC-9 | medium | M | Mastra parses request bodies of any size before authentication and the 2 MB cap | 1 | #396 |
| SEC-10 | medium | S | Ignore rules for secrets and databases miss nested and variant file names | 2 | #397 |
| SEC-11 | low | M | Token checks call WorkOS on every request yet pin no issuer or algorithm | 2 | #454 |
| SEC-12 | low | S | The deep-research web-search tool ignores the plan's corpus-only flag once Exa is enabled | 1 | #455 |
| SEC-13 | low | S | Feedback routes take the user's identity from a different source than every other route | 1 | #400 |
| SEC-14 | low | M | The web app sets no security headers while page scripts hold the access token | 1 | #456 |
| PRIV-1 | medium | S | Identifier screen rejects quoted notices and ordinary wording while missing spoken-form identifiers | 2 | #293 |
| PRIV-2 | medium | S | Conversation retention leaves each expired thread's AI summary, which a reused thread id inherits | 3 | #234 |
| PRIV-3 | medium | M | A refused question's first 60 characters are already stored as the thread title | 1 | #294 |
| PRIV-4 | medium | S | Sentry defaults send request bodies and thread titles to Sentry | 2 | #235 |
| PRIV-5 | medium | M | Every OpenAI call leaves prompts stored at OpenAI under the vendor default | 1 | #236 |
| PRIV-6 | medium | S | Privacy page and runbook say conversations persist until deleted; the server purges them | 2 | #295 |
| PRIV-7 | medium | S | Documented account-deletion procedure leaves user data; the complete routine has no caller | 2 | #296 |
| PRIV-8 | medium | S | Failed backups leave full plaintext database copies on the agent volume indefinitely | 1 | #297 |
| PRIV-9 | medium | M | Exported answers lack case-file provenance; Deep Research reports cannot be exported or reopened | 1 | #375 |
| PRIV-10 | medium | M | Feedback is stored but never read, and comments skip the identifier screen | 1 | #298 |
| PRIV-11 | low | S | Privacy page overstates vendor limits: unpinned regions, Voyage training licence, unlisted processors | 2 | #438 |
| PRIV-12 | low | S | Printed and copied answers carry no disclaimer; professional eligibility requests are unevaluated | 1 | #439 |
| PRIV-13 | low | L | No organisation model: any account is authorised and every setting is deployment-wide | 1 | #440 |
| CHAT-1 | high | S | Identifier screen rejects ordinary Medicaid questions and follow-ups, and the UI hides why | 5 | #219 |
| CHAT-2 | high | M | Coverage boundary and scope gate never see earlier turns under default observational memory | 3 | #249 |
| CHAT-3 | medium | M | Follow-up turns are retrieved, planned and verified from the bare last message | 4 | #272 |
| CHAT-4 | medium | S | Six-item checklist cap drops the under-21 EPSDT directive on adult-exclusion questions | 1 | #273 |
| CHAT-5 | medium | S | A failed frame lookup makes the planner reuse the previous turn's frame | 1 | #329 |
| CHAT-6 | medium | M | Prompt, planner and verifier require citing template boilerplate as scope and exclusion evidence | 1 | #274 |
| CHAT-7 | medium | M | Coverage-scope regexes refuse unrelated questions, and every undated MAGI question from 2027-01-01 | 3 | #275 |
| CHAT-8 | medium | M | Long research turns evict the question, frame and evidence from the generating model | 1 | #330 |
| CHAT-9 | medium | S | Web chat strips the model's reasoning items between tool steps; evaluation runs keep them | 1 | #331 |
| CHAT-10 | medium | S | A chat run has no deadline, and its step ceiling is 99 | 2 | #332 |
| CHAT-11 | medium | S | Scope and injection classifiers run without deadlines, and injection-detector failures go unreported | 3 | #227 |
| CHAT-12 | low | S | `lookupPolicy` hands the model and verifier sibling policies and synthetic rows first | 1 | #415 |
| CHAT-13 | low | S | System prompt contradicts the tools and runtime and duplicates the citation block | 1 | #416 |
| CHAT-14 | low | S | Pinned `@mastra/libsql` 1.14.0 leaves a thread-title race and deferred native connection cleanup | 2 | #417 |
| CHAT-15 | low | S | Deploys cut in-flight chat streams within five seconds | 1 | #418 |
| RSRCH-1 | high | S | Reflection prompts over 10,000 characters trip the planner's chat-input guard and fail the run | 1 | #220 |
| RSRCH-2 | high | M | Abandoned plans lock users out of deep research for up to 90 days | 2 | #221 |
| RSRCH-3 | medium | M | The final report is verified under chat limits and may not fit in 30 seconds | 2 | #238 |
| RSRCH-4 | medium | S | Reflection can research sub-questions the user removed from the plan | 1 | #239 |
| RSRCH-5 | medium | S | Edited sub-questions on plan approval skip the identifier screen applied to the question | 2 | #305 |
| RSRCH-6 | medium | M | One withheld worker finding fails the whole run, and transient errors share two recoveries | 1 | #306 |
| RSRCH-7 | medium | S | Declined, cancelled and failed runs each consume one of two daily starts | 1 | #307 |
| RSRCH-8 | medium | M | Leaving Deep Research cancels the run; plan exclusions carry into the next plan | 1 | #308 |
| RSRCH-9 | medium | S | One source with an empty link makes a research run unreadable and uncancellable | 1 | #389 |
| RSRCH-10 | medium | S | Step budgets cover one attempt, so an interrupted report synthesis can never be recovered | 1 | #390 |
| RSRCH-11 | medium | S | After a restart, in-flight research waits about 15 minutes on a dead lease | 2 | #391 |
| RSRCH-12 | medium | L | Deep research persists progress twice and carries code that nothing reads or reaches | 1 | #392 |
| RSRCH-13 | low | S | Retry and failure decisions rest on substring matches against error messages | 1 | #443 |
| RSRCH-14 | low | S | Upgrading Mastra core past 1.72 turns a transient synthesis failure into an empty report | 1 | #444 |
| RSRCH-15 | low | S | Finished runs keep unverified drafts and duplicated source text for 90 days | 2 | #445 |
| RSRCH-16 | low | S | Hand-written workflow types are too loose to catch some Mastra result-shape changes | 1 | #446 |
| RETR-1 | high | M | Policy numbers are extracted and looked up loosely, anchoring frames on the wrong policy | 6 | #260 |
| RETR-2 | high | S | Alias rules force the wrong policy for over-the-counter, outpatient therapy and CAP/Choice questions | 2 | #261 |
| RETR-3 | high | M | Coverage frames fill slots with template sections and strip the answering section's text | 6 | #262 |
| RETR-4 | high | M | Substring intent and care-setting rules misroute common questions and are unstable under paraphrase | 3 | #263 |
| RETR-5 | high | M | Section text beyond the first 6,000 characters cannot be read by any tool | 2 | #264 |
| RETR-6 | high | M | Amendment recency is unreliable: synthetic dates tie and markers are parsed from unrelated titles | 5 | #265 |
| RETR-7 | high | L | Retrieval and frame heuristics are tuned to the same questions that gate releases | 2 | #325 |
| RETR-8 | medium | S | Hit-inferred coverage routing keeps one policy, dropping a second service or the top-ranked document | 2 | #299 |
| RETR-9 | medium | S | Prior-authorisation frames fill with tied template headings and demote the Prior Approval section | 1 | #300 |
| RETR-10 | medium | S | Waiver scoring ranks age-65 waiver regulations above the governing 1915(c) sections | 1 | #376 |
| RETR-11 | medium | M | Archived and companion fee schedules stay searchable; `retrieval_ready` is only a rerank penalty | 1 | #377 |
| RETR-12 | medium | S | Frame composition depends on Neo4j's unordered section listing | 1 | #301 |
| RETR-13 | medium | M | Spanish questions bypass the English-only coverage boundary, determinism hints and tokeniser | 1 | #302 |
| RETR-14 | medium | S | Policy-variant frames contain only template boilerplate and no search evidence | 1 | #378 |
| RETR-15 | medium | S | Amendment frames list synthetic revision rows as authoritative and omit the named policy | 2 | #303 |
| RETR-16 | medium | S | The beneficiary_guidance document family is unreachable by default search and every answer frame | 1 | #304 |
| RETR-17 | medium | M | Keyword backends scan every section body per search and return whole bodies | 2 | #379 |
| RETR-18 | medium | S | Four lookup tools return unbounded results, up to about 260,000 tokens | 1 | #237 |
| RETR-19 | medium | M | Hits carry no document id, so expansion and boosts key on non-unique titles | 2 | #380 |
| RETR-20 | medium | M | Vector search per group draws from one global top-200 pool, starving federal groups | 1 | #381 |
| RETR-21 | medium | S | Full-text recovery favours the first type group and passes operators through to Lucene | 1 | #382 |
| RETR-22 | medium | S | Ten retrieval catch blocks turn any Neo4j error into an empty result without logging | 2 | #383 |
| RETR-23 | medium | L | The agent's planning processor re-derives question intent and injects policy-specific directives | 2 | #384 |
| RETR-24 | medium | M | The model's optional question-type hint overrides the router, and frame tests bypass it | 2 | #385 |
| RETR-25 | medium | M | The concept backend matches aliases as substrings and returns the five longest tagged sections | 2 | #386 |
| RETR-26 | medium | M | Nothing checks that the agent's query embeddings match the corpus model and dimensions | 4 | #387 |
| RETR-27 | medium | L | Specialised frame selection is not shown to surface the right section better than search | 1 | #388 |
| RETR-28 | low | S | An empty frame still tells the model to finalize from existing evidence | 1 | #441 |
| RETR-29 | low | M | The frame layer carries unread flags, unreachable branches and repeated section fetches | 1 | #442 |
| DATA-1 | high | M | Statute text includes editorial notes and future amendments, and its only source is down | 3 | #255 |
| DATA-2 | high | M | Policy effective dates are wrong, impossible or fabricated, and revision chains are incomplete | 6 | #256 |
| DATA-3 | high | M | Fee schedules frozen since November 2022 are labelled primary and current for rate questions | 1 | #257 |
| DATA-4 | medium | S | Two current MA-2180 manuals tie in lookup, and document id order picks one | 1 | #340 |
| DATA-5 | medium | S | Territory-only 42 CFR Part 436 is loaded as authoritative and ranks beside Part 435 | 1 | #341 |
| DATA-6 | medium | M | Over half of Document nodes are synthetic revision rows that crowd lookups and counts | 1 | #278 |
| DATA-7 | medium | S | Regulation last-revised dates are wrong or missing where the citation says 'Sept.' | 1 | #342 |
| DATA-8 | medium | M | Unnumbered headings capture the numbered sections that follow, so container reads are silently partial | 1 | #279 |
| DATA-9 | medium | S | List letters and numbers are dropped from every PDF section body | 1 | #343 |
| DATA-10 | medium | S | Mentions in change notices and revised public notices are recorded as amendments | 1 | #344 |
| DATA-11 | medium | M | Reference resolver links citations to the wrong documents, including every '1915(c)' to one waiver | 3 | #280 |
| DATA-12 | medium | S | Padded tables push sections past the 6,000-character read cap, hiding the newest rows | 2 | #345 |
| DATA-13 | medium | S | Fee-schedule dates are misread from titles, so wrong files become the primary schedule | 1 | #346 |
| DATA-14 | medium | M | XLS, DOCX and HTML parsers drop or misplace content while reporting answer-ready | 1 | #347 |
| DATA-15 | medium | S | Federal statute and regulation text carries no as-of date in the graph | 1 | #348 |
| DATA-16 | medium | M | Concept links are keyword mentions labelled COVERS and feed every hybrid search | 2 | #349 |
| DATA-17 | medium | M | Citation extraction misses most federal cross-references and discards statute subsections | 1 | #350 |
| DATA-18 | medium | S | `parse --force` reports crashed re-parses as success; `load` and `run-all` exit 0 on errors | 1 | #351 |
| DATA-19 | medium | M | The no-OCR gate accepts no real PDF, so every PDF is converted twice | 1 | #352 |
| DATA-20 | medium | M | Every release re-embeds the whole corpus, with thin retry and no spend ceiling | 2 | #353 |
| DATA-21 | low | S | Notice-stage plan amendments reach verifier evidence labelled 'Status: current' | 1 | #421 |
| DATA-22 | low | S | The eCFR primary fetch cannot succeed, and its 406 is documented as an outage | 2 | #422 |
| DATA-23 | low | M | Parse sidecars record no parser versions, and each run re-reads every artifact several times | 1 | #423 |
| DATA-24 | low | S | Model-assisted reference extraction is unused in releases and would misattribute references if enabled | 1 | #424 |
| CRAWL-1 | high | M | The agency's Archived tag is discarded, so superseded income tables load as current | 1 | #250 |
| CRAWL-2 | high | M | Documents dropped from the agency index stay active and answerable as current | 1 | #251 |
| CRAWL-3 | high | M | A failed crawl check removes a document from the release and no gate fails | 2 | #252 |
| CRAWL-4 | high | S | Bulletin listing parser matches no posts on the live site | 1 | #253 |
| CRAWL-5 | high | M | A discovery that finds nothing counts as success and stamps the family fresh | 1 | #254 |
| CRAWL-6 | medium | M | Unapproved State Plan proposals are loaded as authoritative, current policy | 1 | #276 |
| CRAWL-7 | medium | S | Crawler title parsers drop or split policy numbers, breaking lookup by number | 2 | #277 |
| CRAWL-8 | medium | M | Bulletin pagination stops at 50 pages, so older posts are never reached | 1 | #333 |
| CRAWL-9 | medium | S | Crawler tombstones documents after three 404s, and each tombstone blocks every release | 2 | #334 |
| CRAWL-10 | medium | S | Download guards accept empty and wrong-type payloads and buffer oversized bodies in memory | 1 | #335 |
| CRAWL-11 | medium | S | A document can be marked unchanged when its stored file is missing | 1 | #336 |
| CRAWL-12 | medium | S | A third URL canonicalizer disagrees with the registry key on attachment links | 1 | #337 |
| CRAWL-13 | medium | S | Registry writes wait until a phase ends, so a killed crawl loses its bookkeeping | 1 | #338 |
| CRAWL-14 | medium | S | Stored ETag and Last-Modified values go stale, so daily checks re-download unchanged files | 1 | #339 |
| CRAWL-15 | low | S | Fee-schedule variant selection can prefer a file that cannot be loaded | 1 | #419 |
| CRAWL-16 | low | S | robots.txt is checked for three of seven hosts and the contact URL is dead | 2 | #420 |
| EVAL-1 | high | M | Golden reference answers assert facts their cited sections do not contain | 1 | #258 |
| EVAL-2 | high | M | Release floors have never been met and one noisy run decides | 4 | #259 |
| EVAL-3 | medium | S | Agent reasoning effort is never set, so it changes silently with the model | 2 | #229 |
| EVAL-4 | medium | S | Withheld answers are judged and score a perfect 3 on hallucination | 1 | #230 |
| EVAL-5 | medium | S | Hallucination judge sees the reference answer and accepts any fetched text as support | 1 | #231 |
| EVAL-6 | medium | S | Judge evidence budget drops all agent evidence for three questions | 1 | #232 |
| EVAL-7 | medium | S | Mandatory scope acceptance does not check what two pass cases actually say | 1 | #359 |
| EVAL-8 | medium | M | The held-out set is a tuned paraphrase set with retired section identifiers | 2 | #360 |
| EVAL-9 | medium | L | Answer evaluation runs a reduced agent and never calibrates the verifier | 3 | #361 |
| EVAL-10 | medium | M | No benchmark question exercises section truncation, sibling policy lookup or fee schedules | 1 | #282 |
| EVAL-11 | medium | M | The model comparison script cannot resolve the differences it decides on | 5 | #362 |
| EVAL-12 | medium | S | Scope gate and injection detector depend on a model retiring 11 December 2026 | 1 | #233 |
| EVAL-13 | medium | M | Judge call has no retry, scores parse failures as zero, and its credentials failed | 4 | #283 |
| EVAL-14 | medium | S | The weekly gate before the production data push cannot fail closed | 1 | #363 |
| EVAL-15 | medium | M | Evaluation harness parses agent output loosely and its real subprocess path is untested | 2 | #364 |
| EVAL-16 | medium | M | Unknown model identifiers route to Anthropic, and the advertised Claude path cannot run | 3 | #365 |
| EVAL-17 | medium | M | Chat cost reporting omits the verifier and classifiers and cannot price cache writes | 5 | #366 |
| EVAL-18 | medium | M | Jev experiment gates cannot answer the questions they are meant to decide | 3 | #367 |
| EVAL-19 | low | S | Model documentation and two comparison-script gates have drifted from code defaults | 2 | #432 |
| OPS-1 | high | S | Installed Saturday laptop job ends in an unattended wipe of the production graph | 2 | #215 |
| OPS-2 | medium | M | Neither retrieval floor in the release gate can be met on the 55-question benchmark | 2 | #284 |
| OPS-3 | medium | M | No stored golden-set run reaches the 2.75 answer floor, and one run decides | 2 | #285 |
| OPS-4 | medium | S | A release-gate override file stays in force for every later unattended release | 1 | #286 |
| OPS-5 | medium | M | Interrupted cutover is unfenced, and the seven-day lock makes deferral a daily failure | 6 | #287 |
| OPS-6 | medium | M | Cutover, rollback and scope acceptance each hinge on single unrepeated verifier outcomes | 1 | #368 |
| OPS-7 | medium | M | Release inputs are checked only after a full-cost wipe and rebuild, retried daily | 4 | #288 |
| OPS-8 | medium | M | Answer-scope approvals are voided by any crawl change, stopping the scheduled job daily | 1 | #369 |
| OPS-9 | medium | M | First-release prerequisites invalidate one another, and bootstrap cannot override the freshness gate | 1 | #289 |
| OPS-10 | medium | S | The first corpus release cannot build while uscode.house.gov is under maintenance | 1 | #370 |
| OPS-11 | medium | M | Production chat-store backup has failed every day since 22 September 2026 | 1 | #217 |
| OPS-12 | medium | M | Chat-store backups are plaintext in the same Railway account; no restore is rehearsed | 1 | #290 |
| OPS-13 | medium | M | Railway stops reading the checked-in `railway.json` files on 1 December 2026 | 1 | #291 |
| OPS-14 | medium | M | Runbook emergency commands are wrong: rollback does not roll back, chat-store restore is unsafe | 2 | #292 |
| OPS-15 | medium | S | Volume restore treats a failed bucket listing as absent and restores the legacy layout | 1 | #371 |
| OPS-16 | medium | S | Corpus job has no drain time and parses downloads as root with every credential | 1 | #372 |
| OPS-17 | medium | S | Local graphs never pass readiness, so real-agent smoke suites skip as 'Agent not reachable' | 1 | #373 |
| OPS-18 | medium | M | Corpus-job image ships unused CUDA libraries and downloads parser models at run time | 2 | #374 |
| OPS-19 | low | S | The graph reset is never confirmed before a release build proceeds | 1 | #433 |
| OPS-20 | low | S | After bootstrap, the first scheduled run always starts a new release | 1 | #434 |
| OPS-21 | low | S | Bootstrap activation rewrites the agent's entire variable set with `replace: True` | 1 | #435 |
| OPS-22 | low | S | `parse-import` reads manifest and sidecar fields only after replacing the first artifact | 1 | #436 |
| OPS-23 | low | M | Release code carries a dead fee-schedule report and write-only marker state | 1 | #437 |
| WEB-1 | high | M | Citation footnotes fall back to the document URL and highlight the wrong section | 3 | #226 |
| WEB-2 | medium | M | Withheld answers look like ordinary answers, and the Sources dot says checks passed | 2 | #247 |
| WEB-3 | medium | S | Markdown export drops citation links and the source list; print output is faint | 2 | #317 |
| WEB-4 | medium | M | Thread restore and export load only the newest 40 stored messages | 1 | #318 |
| WEB-5 | medium | M | Re-running an earlier answer hides every later turn while the server appends | 1 | #319 |
| WEB-6 | medium | M | Switching threads mid-answer orphans the run and shows a false failure on return | 1 | #320 |
| WEB-7 | medium | S | Stopped or dropped answers keep showing progress and blame an API error | 1 | #321 |
| WEB-8 | medium | S | Feedback on a live answer can detach after reload because message ids differ | 1 | #398 |
| WEB-9 | medium | S | Sidebar thread list cannot scroll once full and pushes Sign out off-screen | 1 | #322 |
| WEB-10 | medium | M | Keyboard and screen-reader users lose focus on footnotes and miss errors and research phases | 1 | #323 |
| WEB-11 | medium | S | Accent text, thinned labels and focus rings fall below accessibility contrast minimums | 1 | #324 |
| WEB-12 | medium | S | A 60-second status poll from any open chat tab keeps the agent awake | 1 | #399 |
| WEB-13 | low | S | Released answers show a green verified badge but no not-a-case-decision caution | 1 | #467 |
| WEB-14 | low | S | Block notices read at college level and the prompt never requests plain language | 1 | #468 |
| WEB-15 | low | M | Six groups from the June quality-assurance handoff remain open and untracked | 1 | #469 |
| WEB-16 | low | S | Every keystroke in the composer re-renders and re-parses the whole transcript | 1 | #470 |
| DEPS-1 | medium | M | Mastra packages span two release trains, and the single-core override does not hold | 4 | #228 |
| DEPS-2 | medium | M | Agent image ships a second dependency tree outside the lockfile and audit | 1 | #354 |
| DEPS-3 | medium | M | Parser model weights are fetched unpinned at run time and never recorded | 1 | #355 |
| DEPS-4 | medium | S | Installed AI SDK providers mishandle GPT-6 and Claude 5.5 model identifiers | 2 | #356 |
| DEPS-5 | medium | S | Node and Python pins disagree and are unenforced; laptop scheduled jobs now fail | 2 | #281 |
| DEPS-6 | medium | M | Nothing watches for vulnerable dependencies outside the npm production tree | 1 | #357 |
| DEPS-7 | medium | S | Dependabot groups split coupled package families across separate pull requests | 1 | #358 |
| DEPS-8 | low | M | Memory release gate patches nine methods by name and cannot notice new ones | 2 | #248 |
| DEPS-9 | low | S | Unlogged duplicate-item workaround runs every model step but changed nothing in replays | 2 | #425 |
| DEPS-10 | low | S | Production has no tracing; enabling it would export user identity and questions unredacted | 1 | #426 |
| DEPS-11 | low | S | Internal packages use an npm scope nobody has registered | 1 | #427 |
| DEPS-12 | low | S | Audit gate accepts exceptions with a missing or malformed expiry date | 1 | #428 |
| DEPS-13 | low | S | Root npm overrides are mostly redundant, and one forces an undeclared major version | 1 | #429 |
| DEPS-14 | low | S | Mastra's Apache-labelled packages contain Enterprise-licensed code that the auth provider imports | 1 | #430 |
| DEPS-15 | low | S | Four dependencies add install and image weight the product does not use | 1 | #431 |
| TEST-1 | medium | S | Six of ten answer-release predicate terms can be deleted with every test green | 2 | #245 |
| TEST-2 | medium | S | Five secondary answer-release defences can be removed without failing a test | 2 | #401 |
| TEST-3 | medium | S | Citation validators skip six input forms and wrongly flag three; tests are single examples | 1 | #402 |
| TEST-4 | medium | S | No test exercises the chat identifier guard, which rejects ordinary Medicaid questions | 2 | #246 |
| TEST-5 | medium | M | No test runs the real Mastra server; cross-user isolation rests on stub handlers | 2 | #313 |
| TEST-6 | medium | S | No test submits a research decision or cancellation as a non-owner | 1 | #403 |
| TEST-7 | medium | S | Retention SQL for conversations and research snapshots never executes in any test | 1 | #404 |
| TEST-8 | medium | S | Every tool test replaces `createTool`, so Mastra's schema validation never runs under test | 1 | #405 |
| TEST-9 | medium | M | Most retrieval Cypher goes unchecked: stubs ignore query text and failures are swallowed | 2 | #406 |
| TEST-10 | medium | M | No test crosses the Python and TypeScript boundary; each side uses hand-written fixtures | 2 | #314 |
| TEST-11 | medium | M | Browser and component tests render hand-written streams the answer gate cannot produce | 2 | #407 |
| TEST-12 | medium | M | The mocked browser backend never checks requests and omits nine of sixteen routes | 3 | #408 |
| TEST-13 | medium | M | Deep-research recovery was validated only with stub agents and a reduced live run | 1 | #409 |
| TEST-14 | medium | S | No automated accessibility check exists, and browser tests run only desktop Chrome | 1 | #315 |
| TEST-15 | medium | S | Production smoke fails on its second run because it leaves a same-titled thread | 1 | #316 |
| TEST-16 | low | S | Neither the benchmark nor unit tests can detect policy-number extraction or lookup-ordering errors | 1 | #457 |
| TEST-17 | low | S | Verifier tests cover dead fallback code while live release-target selection is untested | 2 | #458 |
| TEST-18 | low | M | Ranking tests pin eight exact floats yet miss two scoring errors | 2 | #459 |
| TEST-19 | low | S | Verifier call bounds are weakly pinned: retryability, deadline and retry count | 1 | #460 |
| TEST-20 | low | S | The only real-document loader test asserts little more than non-emptiness | 1 | #461 |
| TEST-21 | low | S | The opt-in Playwright smoke and design projects have rotted outside continuous integration | 4 | #462 |
| TEST-22 | low | S | The daily rate-limit window can be halved without failing a test | 1 | #463 |
| TEST-23 | low | S | Test runs read live provider keys and write to the operational crawl log | 2 | #464 |
| TEST-24 | low | S | Root `npm test` can replay a stale pass after a dependency package changes | 1 | #465 |
| TEST-25 | low | S | Coverage is never measured, and contracts tests, browser tests and Python escape type checking | 1 | #466 |
| ARCH-1 | medium | M | A past answer's verifier findings cannot be recovered, and chat verifier cost goes unrecorded | 1 | #270 |
| ARCH-2 | medium | M | One import-time script wires production and doubles as the evaluation command line | 2 | #271 |
| ARCH-3 | medium | M | A documented backup failure went unfixed for thirteen days; history swamps current guidance | 2 | #327 |
| ARCH-4 | medium | M | Binding contributor rules and key model decisions have no authoritative record in the repository | 2 | #328 |
| ARCH-5 | low | M | Two environment parsers: validated settings go unread while unvalidated ones accept malformed values | 2 | #410 |
| ARCH-6 | low | M | Contracts package carries schemas nothing parses, and the web validates no response against it | 1 | #411 |
| ARCH-7 | low | M | TypeScript and Python meet through stdout text protocols and duplicated table definitions | 2 | #412 |
| ARCH-8 | low | M | Setup and configuration documents fail on a fresh checkout and omit production requirements | 2 | #413 |
| ARCH-9 | low | S | RUNBOOK misdescribes the daily job and the federal cache; package READMEs list stale counts | 1 | #414 |
