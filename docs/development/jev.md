# Jev experiments

Jev is an opt-in TypeSafe classifier, pinned to `jev-1.13.0`. Routing stays an offline diagnostic. Only roles listed in `JEV_SECTION_ROLE_ALLOWLIST` from a reviewed qualification report can add at most one point to final coverage and prior-authorization selection at probability ≥0.90; they never exclude evidence. The optional scope provider blocks only a selected `off_topic` choice with probability ≥0.95, with a 500 ms total deadline, no retries, and fail-open behavior. The existing scope instructions, conversation window, kill switch, user message and chat/research processor are shared. Injection detection and exact-text answer verification are unchanged.

Defaults are `JEV_SECTION_ROLES_ENABLED=false` and `SCOPE_GATE_PROVIDER=openai`. Set `TYPESAFE_API_KEY` only when choosing the Jev scope provider or running paid diagnostics. Runtime configuration rejects unknown providers and requires that key when the enabled scope gate selects Jev. Classification telemetry includes fixed failure codes, probabilities, usage and latency, never conversation text. Section-role diagnostics are removed before agent tool output.

## Contracts and corpus identity

The [question specification](../../packages/policy-corpus/src/jev/questions.json) defines independent roles: scope, covered services, exclusions, PA criteria, PA procedure, billing workflow, boilerplate and forms. These differ from the document-family `answerRole`. HTTP adapters use existing `fetch`/`httpx`, validate the model echo, exact question/choice coverage, probability distributions and usage, and reject oversized inputs without truncating them. Choice confidence is independent of the winning probability ([official API](https://docs.typesafe.ai/api)).

Caches live under `$CORPUS_DATA_ROOT/pipeline/section-labels` (or the pipeline data directory locally). Their keys bind full content, title, section number, document title/type/policy number, model and questions. Immutable manifests also bind each complete cache payload, including raw probabilities and usage. Empty, oversized, failed, uncertain or uncached sections continue through existing heuristics; the manifest records coverage and failure status. Section upserts clear old annotations, and hydration verifies full input hashes before content truncation. Container text synthesized from children never inherits a parent label.

Enrichment uses the graph writer's managed transaction, checks exact current inputs, and refuses stamped release graphs. IDs, text, embeddings and relationships stay intact. With roles enabled, candidate release builds perform **cache-only** enrichment after state/federal ingestion and all later build stages. They cannot spend money on annotation. Before evaluation or release stamping, live section identities and exact probability payloads are checked against the immutable manifest. The digest is stamped on `CorpusRelease` and included with feature configuration in research recovery identity. Disabled recovery keeps the original release identity; enabling or disabling roles invalidates incompatible checkpoints.

The corpus backup includes labels and manifests, validates their hashes on restoration, and snapshots SQLite databases before archiving rather than copying a live campaign WAL. Corpus sync includes section-label caches; do not sync a live ledger directly.

## Prepare and review

Run commands from `packages/pipeline`. Use one durable campaign directory and ledger for every paid stage, including retries, classifiers, embeddings, answers, verifier and judge. Preparation and review export do not run inference.

```bash
uv run python -m pipeline.cli jev prepare routing --output data/jev/campaigns/pilot
uv run python -m pipeline.cli jev prepare scope --output data/jev/campaigns/pilot
# Reads the selected corpus graph; requires enough documents for both splits.
uv run python -m pipeline.cli jev prepare sections --output data/jev/campaigns/pilot
uv run python -m pipeline.cli jev review scope --output data/jev/campaigns/pilot
uv run python -m pipeline.cli jev review sections --output data/jev/campaigns/pilot
```

Routing inputs are the 55 golden queries plus 50 existing and 50 fresh, versioned paraphrases. Paraphrases contribute text and `paraphrase_of` only; their historical evidence IDs are never consumed. Frozen baseline `analyzeQuery` results preserve exact extraction in code. After inference, export `jev review routing`: it selects every type/flag disagreement plus 30 seeded random agreements. Reviewers do not see predictions. Routing labels must contain `questionType` and all boolean `flags`; ambiguous predictions count as abstentions. Accuracy is reported only over the reviewed sample, separately from consistency and actual frame consequences. This does not enable a runtime router.

The development split supports reviewing definitions and diagnosing errors without tuning against held-out labels; qualification uses only the held-out split. Section preparation samples 240 sections across available families, with 120 development and 120 held-out sections split **by document**. It freezes current predicate/term-list baselines. Scope uses 200 synthetic conversations covering benefits, contextual follow-ups, ambiguous problems, multilingual text and adversarial/unrelated requests. Proposed scope labels are never accepted as human labels. Scope review assesses topic relevance only; an instruction-override attempt can also concern benefits. Injection detection is a separate existing processor and is not a fourth scope class.

Edit the exported `<kind>-review.json`: enter a nonempty `reviewer` and each `label`. Scope labels are `on_topic`, `ambiguous` or `off_topic`; sections need all eight independent boolean roles. Do not edit frozen inputs or inference outputs. Preserve the reviewer artifact alongside the report.

## Offline review page

`jev review <kind> --format html --output <campaign>` exports a page for scope, sections or routing. `jev review-dashboard --output <campaign>` creates the individual pages and a self-contained `review.html` with buttons to switch between all three review sets without navigating to sibling files. Open the page in Chrome or Safari; editor previews can disable local links or JavaScript. The pages use no external assets or network requests. They save progress in browser storage when available and import/export the existing review JSON schema. Downloaded JSON is the durable handoff: replace the campaign's corresponding review file, then run its report. Imports accept labels only, preserve frozen text, reject mismatched/duplicate identities and validate label fields. Unanswered judgments and missing reviewer names cannot qualify a feature.

For a new campaign based on prior routing inference, use `jev prepare routing --reuse-from <prior-campaign> --output <new-campaign>`. Baselines are recomputed by current code. Reuse requires identical text, paraphrase identity, pinned model, input hash and question specification; predictions are rederived from validated probabilities. The immutable reuse receipt binds the prior result payload. Existing inference and reviewer files are preserved.

Section inference saves a manifest-bound `sections-results.json` and immutable attempt receipts. Unclassifiable inputs count as abstentions in role qualification; credential, budget or provider interruptions remain pending inference. No section text is truncated to fit the classifier.

## Paid validation, maximum $25

The shared SQLite ledger reserves cost **before every attempt**, locks concurrent reservations, uses integer nanodollars and keeps unknown/interrupted attempts fully charged. Its $25 cap cannot be raised; an underestimated bound is recorded and stops resumed execution. Offline Jev retries only transient HTTP failures; every retry has another reservation. Runtime scope never retries.

Confirm current published pricing before execution. Jev diagnostics require `JEV_CONFIRMED_INPUT_USD_PER_MILLION=0.042`. Scope comparison additionally requires `JEV_CONFIRMED_SCOPE_PRICING=gpt-5-mini:0.25:2`; a different baseline model is refused until its pricing/bounds are supported. The baseline reuses the production OpenAI call and SDK retry defaults, with its native 128,000-token output ceiling reserved and every attempt metered. Older scope fixtures with the 200-token experimental baseline cannot qualify; preserve them and prepare a new campaign for baseline comparison. Rates are explicit confirmations, not automatic assumptions about future pricing.

```bash
uv run python -m pipeline.cli jev run routing --output data/jev/campaigns/pilot --ledger data/jev/campaigns/pilot/campaign.db
uv run python -m pipeline.cli jev run sections --output data/jev/campaigns/pilot --ledger data/jev/campaigns/pilot/campaign.db
uv run python -m pipeline.cli jev run scope --output data/jev/campaigns/pilot --ledger data/jev/campaigns/pilot/campaign.db
uv run python -m pipeline.cli jev enrich  # candidate graph, cache only
```

For final frames and full answer runs, provide a local pricing JSON with `confirmed: true` and a `models` map keyed by exact model IDs. Each entry needs `provider` (`openai`, `anthropic`, `voyage` or `typesafe`), `inputPerMillion`, `outputPerMillion`, and, for generative models, an explicit `maxOutputTokens`. Example schema (rates below are placeholders, not confirmed prices):

```json
{"confirmed": false, "models": {"exact-model-id": {"provider": "openai", "inputPerMillion": 0, "outputPerMillion": 0, "maxOutputTokens": 8192}}}
```

The validation transport enforces output bounds, refuses unknown models/endpoints and hosted tools or nontext inputs, counts retry attempts, and shares the Python ledger with TypeScript through a local JSON RPC. Streaming usage that cannot be reconciled keeps its full conservative reservation. Full validation uses isolated observability and the existing server verifier. Output bounds apply to both arms and are included in the evaluation fingerprint.

```bash
# EVAL_IDENTITY_CATALOG must name the existing frozen canonical identity catalog.
uv run python -m pipeline.cli jev frames --routing --output data/jev/campaigns/pilot --ledger data/jev/campaigns/pilot/campaign.db --pricing /path/to/confirmed-pricing.json
uv run python -m pipeline.cli jev frames --output data/jev/campaigns/pilot --ledger data/jev/campaigns/pilot/campaign.db --pricing /path/to/confirmed-pricing.json
uv run python -m pipeline.cli jev validate-answers --output data/jev/campaigns/pilot --ledger data/jev/campaigns/pilot/campaign.db --pricing /path/to/confirmed-pricing.json
uv run python -m pipeline.cli jev report scope --output data/jev/campaigns/pilot
uv run python -m pipeline.cli jev report sections --output data/jev/campaigns/pilot
uv run python -m pipeline.cli jev report routing --output data/jev/campaigns/pilot
# Diagnostic comparison only; AI references cannot qualify runtime use.
uv run python -m pipeline.cli jev report ai-diagnostic --output data/jev/campaigns/pilot
```

Scope qualifies only with complete human-reviewed evidence, zero classifier failures and zero false blocks on on-topic/ambiguous conversations, off-topic detection at least baseline, and lower median latency; p95 and failures remain reported. Section roles need ≥10 held-out positive and negative examples, at least ten positive predictions, precision ≥0.90 and recall at least the heuristic baseline. Unsupported roles remain observational. Frames and repeated answers derive the candidate role allowlist from reviewed evidence. Their durable artifacts bind the qualification hash, exact annotation digest, corpus and common configuration; reports recompute answer gates from the full runs. Final primary evidence selection must improve. Require at least three distinct, complete baseline and candidate answer runs on matching corpus/configuration, existing release thresholds, no mean grounding decline and no aggregate withholding increase. A partial run or insufficient budget is pending, never qualification. The implementation does not automatically enable features or deploy a release.

## Verification

Run corpus and agent tests, both builds and test typechecks, pipeline pytest/Ruff/Vulture, and operational backup tests. The dedicated Neo4j annotation test requires `RUN_NEO4J_INTEGRATION=1` and `JEV_DISPOSABLE_NEO4J=true` and `JEV_DISPOSABLE_NEO4J_URI` exactly matching the test URI; it refuses a nonempty graph and must target an isolated test server. Wire tests include the documented independent-confidence example, deadlines through body reading, rate-limit no-retry behavior and Unicode/control-character hash equivalence across languages.

## Preserve a local campaign

Local campaigns outside `$CORPUS_DATA_ROOT` are not included in the corpus backup. After importing downloaded labels, make a separate snapshot with `jev snapshot --output <campaign> --ledger <shared-ledger> --destination <new-backup-directory>`. It copies reviewer artifacts, frozen inputs, reports, label caches and manifests, and uses SQLite's backup API for the shared ledger. The snapshot includes file hashes and excludes environment files. Keep a copy outside this worktree before removing it. Do not resume paid calls from an older ledger snapshot: retain the original shared ledger as the spend authority.

Partial review labels are drafts and report as pending. Resolve every required field before qualification; use `ambiguous` for uncertain scope context. Frames and answers check the qualification inventory and sampled input hashes before spending; the qualification hash includes the inventory identity. Answers also require a passed frame gate.

Cache-only enrichment of the 232 sampled sections is a sparse diagnostic, not evidence of full-corpus annotation coverage. After human role qualification, assess annotation coverage and remaining budget before enriching the isolated candidate corpus with the shared ledger. Keep incomplete enrichment pending and never infer improvement from a sparse arm. Genuine canonical evidence misses remain misses in both arms; report affected questions and do not substitute unrelated titles or lower the absolute release thresholds.

## AI-assisted diagnostic labels

When exhaustive human labeling is too burdensome, `jev ai-draft --output <campaign> --ledger <shared-ledger> --pricing <confirmed-ai-pricing>` runs independently prompted `gpt-5-mini` and pinned `claude-opus-4-6`. Each receives frozen full inputs and definitions, without Jev results, baseline predictions, human labels or the other model's answers. Opus 4.6 is a deliberate reproducible pin with confirmed pricing; the orchestration workflow reviewer may use the user's configured Opus version. The API labels and the workflow review are separate evidence.

These artifacts carry `evidenceSource: ai_diagnostic`, no human reviewer, request/model/pricing/input hashes and immutable attempt receipts. Every paid attempt uses the original campaign ledger. Successful batches are reusable; an explicitly resumed failed batch may make at most one further metered attempt. Historical failed attempts remain preserved. Oversized inputs abstain without truncation. Aggregate output is versioned by receipt hashes; incomplete runs remain pending.

`jev ai-audit --output <campaign>` builds at most 15 disagreement items, across section families and distinct documents/questions, with at most three decisions per item. The user has chosen to accept model consensus for this diagnostic pass, so this is a targeted disagreement checklist, not a representative random audit or an independent qualification reference. Long sections are omitted from this lightweight checklist and remain in diagnostics. AI suggestions are hidden in a collapsed panel so the reviewer can choose first. The audit has its own browser-storage key and JSON schema; original human drafts and files remain intact.

Both the human-review HTML import and the server-side report reject AI-provenance files. Accepting a draft does not rename its evidence source. AI agreement can share correlated errors, and batch neighbors can influence labels. Report coverage, disagreements and abstentions alongside any diagnostic comparison. This pass can inform whether further Jev work is worthwhile, but it cannot authorize role allowlists, final answer evaluation or activation through the existing independent human gate. Scope remains disabled after its recorded timeout; this workflow asks for no further scope labeling. Snapshot the campaign again after the AI pass.

Import a downloaded checklist with `jev import-ai-audit --output <campaign> --review /path/to/ai-audit-review.json`. The importer validates the frozen checklist digest, exact item IDs, reviewer, field names, types and choices before saving. It archives each submitted version, summarizes agreement on the selected decisions, and builds `ai-working-reference.json`: reviewed fields take the user's choice; other agreeing fields retain AI consensus; unreviewed disagreements and missing AI references stay unanswered. Every field records its source. The original human review files are untouched, and this targeted audit cannot qualify roles. Agreement counts describe the selected disagreements, not overall model accuracy.

Report field ordering is canonical before hashing: a JSON download's key order may differ from its archived canonical copy, and that must not change an immutable report on re-import.

If the reviewer reports uncertain or coin-flip choices without identifying fields, record a frozen `ai-audit-confidence-note.json` bound to the submitted review hash with `disposition: all_audit_decisions_provisional`. The report becomes provisional. Working-reference fields keep the original choices as `tentativeValue`, with unresolved `value: null` and source `provisional_human_audit`. Preserve the original submission and earlier report versions; do not turn uncertain judgments into resolved reference labels or use the match counts to rank model accuracy.

Before changing the pinned model or question specification, plan artifact migration and backup validation together. Current cache/manifest validation binds the current pin; historical artifacts must remain archived rather than silently relabeled under a new specification. Whole-corpus annotation memory use and paid-provider transport compatibility remain adoption checks, not established by this disabled integration.

Before runtime adoption, close the October 4 review prerequisites: require a stamped non-null annotation digest before the agent uses roles; require a backup label inventory cross-checked against retained release manifests. The current backup inventory catches labels lost or changed inside the archive, but not a directory already lost before snapshotting. Keep both runtime flags off until these safeguards and qualification are complete.
