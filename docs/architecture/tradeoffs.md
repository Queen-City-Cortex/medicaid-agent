# Design tradeoffs

Each section names a choice, what it costs, and what would change it. Where a choice was settled by measurement, the measurement is linked. Where it was not, the section says so.

## Withholding is always acceptable; releasing unverified text never is

**Choice.** No model-written prose reaches the browser, the history endpoints or a stored message row until the verifier has passed that exact text. A failed check, a verifier outage and a deadline hit all end the same way for the person asking: no answer, and a withheld notice.

**Cost.** Some correct answers are withheld. The release policy caps this at 4 of 47 benchmark questions ([`corpus-release-policy.json`](../../corpus-release-policy.json)), so withholding cannot become a way to pass the gate by saying nothing. A verifier outage looks to users like a product outage.

**Why.** The audience is legal-aid staff, case managers and beneficiaries. A confident wrong answer about coverage or eligibility costs them more than no answer, and they cannot tell a fluent wrong answer from a right one. The asymmetry is the design: the system may be unhelpful, but it may not be wrong without evidence.

**How it is enforced.** The release gate in [`answer-release.ts`](../../packages/agent/src/answer-release.ts) rebuilds each stream chunk from named fields, so a new chunk type is dropped unless someone adds it on purpose. Stored messages are signed at release; recall and thread cloning refuse unsigned text. The rule is also a [code review rule](../../AGENTS.md#answer-release): a change that turns a failure into a pass, or treats missing evidence as support, is flagged.

## Deterministic checks run before any model call

**Choice.** Before the verifier model sees an answer, code checks every link against the retrieved sources, every quotation against retrieved text, and the coverage scope the question falls under ([`run.ts`](../../packages/agent/src/processors/verifier/run.ts), [`answer-validation.ts`](../../packages/agent/src/processors/verifier/answer-validation.ts)). If the turn retrieved nothing and the answer cites something, or the evidence budget would cut the text an answer cites, the answer is withheld without a model call.

**Cost.** The checks are strict about form: a correct answer that paraphrases a quotation, or links a page the tools did not return, is withheld. Section-label matching is measured but not yet enforced because its false-positive rate is unknown.

**Why.** A model judging an answer against evidence it was not shown is guessing. A fabricated URL or quotation is a yes/no fact that string comparison settles for free. Spending a model call there adds latency and a second chance to be wrong.

## The verifier is bounded: 30 seconds, two passes, no retries

**Choice.** One verifier call has a 30-second deadline ([`verify.ts`](../../packages/agent/src/processors/verifier/verify.ts)). There are at most two passes: the first may propose a corrected answer, and the second must pass that exact corrected text. There are no retries. The bounds are fixed by [issue #18](https://github.com/Queen-City-Cortex/medicaid-agent/issues/18) and protected by a [review rule](../../AGENTS.md#verifier-bounds).

**Cost.** A slow provider day withholds answers that a retry would have released. In September a verifier timeout was seen and is still being diagnosed under #18.

**Why.** Retries and longer deadlines make a timeout disappear without explaining it. Issue #18 states the rule: diagnose any recurrence against the actual graph, deployment and model configuration, and do not count an isolated successful retry as a repair. Holding the bounds fixed also keeps evaluation honest: a verifier candidate that needs more time is disqualified rather than accommodated ([decision 0002](../decisions/0002-verifier-model-family.md)).

## The verifier uses the agent's model family, for now

**Choice.** The code default verifier is the same model as the agent (`gpt-6.1-terra`, [`config.ts`](../../packages/agent/src/processors/verifier/config.ts)). It also writes the correction that pass 2 re-verifies.

**Cost.** A model is plausibly worse at catching its own family's errors. The miss rate has never been measured. The October review called this out directly: "verified" promises more than one low-effort same-vendor call has shown it delivers.

**How it gets decided.** [Decision 0002](../decisions/0002-verifier-model-family.md) (Proposed) sets up a seeded-fault benchmark with three arms: the current model at low effort, the current model at medium effort, and `claude-sonnet-5-5` at low effort. A candidate wins only if it catches at least one error kind more often, no kind less often, withholds clean answers no more often, and stays under 2 percent deadline aborts, with differences counted only outside Wilson 95 percent intervals. Spend is capped at $150. Switching on argument alone was rejected, because the swap voids the release baseline. The trials are tracked in issue #184 and its sub-issues.

A July 2026 A/B on the same harness already rejected one candidate: `gpt-5.6-luna` scored below the then-incumbent `gpt-5.4-mini` on overall, factual and hallucination scores over three runs per arm while costing more ([archived note](../archive/byterover/context-tree/facts/project/agent_model_a_b_gate_2026_07_09.md)).

## Why a graph

**Choice.** The corpus lives in Neo4j: documents, a section hierarchy (`HAS_SECTION`, `PARENT_OF`, `NEXT_SIBLING`), amendment and supersession edges (`AMENDS`, `SUPERSEDED_BY`) and cross-references (`REFERENCES`, `REFERENCES_DOCUMENT`), with vector and full-text indexes over sections in the same store.

**What it buys.** Medicaid policy questions are often about which text governs. Clinical coverage policies are revised by change notices, plan amendments supersede earlier ones, and manuals cite statutes. Answer frames walk those edges to find the authoritative document and its latest amendment ([`amendments.ts`](../../packages/policy-corpus/src/primitives/amendments.ts)) and to read a whole section, or its neighbours, rather than an isolated chunk.

**What it costs.** A stateful database service to operate, back up and release. Rebuilding it safely is why the [blue-green release machinery](../operations/blue-green-corpus-releases.md) exists, and that machinery has not yet completed a blue-green release in production: the agent still serves a legacy graph built in July (see [RUNBOOK.md](../../RUNBOOK.md#incidents)). Some graph features are unproven: the concept backend is slated to be measured and deleted if scores hold without it (issues #55, #91).

**What is missing.** No decision record compares the graph with a vector store plus document metadata. The reasons above are what the code relies on, not the result of a comparison. A record should be written before anyone proposes moving off Neo4j or adding to it.

## Policy-family routing lives in the corpus library, not the prompt

**Choice.** Which documents answer a coverage, prior-authorization or federal-authority question is decided in [`PolicyCorpus`](../../packages/policy-corpus/src/policy-corpus.ts) answer frames, not by adding instructions to the agent prompt.

**Cost.** More code: frame pipelines per question type, with their own tests and their own failure modes (the review found router keywords matching inside other words, since fixed with whole-word matching).

**Why.** Prompt patches are untestable and leak into every question. Frames are deterministic, run without a model call, and can be tested on every golden question and its held-out paraphrase ([`routing-paraphrase-stability.test.ts`](../../packages/policy-corpus/tests/routing-paraphrase-stability.test.ts)). In June 2026 the planner was found to hard-code golden-set topics; after de-contamination, a held-out set of 50 reworded questions scored at the same level as the contaminated baseline ([evaluation history](#evaluation-decides-and-it-has-said-no)).

## Evaluation decides, and it has said no

**Choice.** The evaluation harness was started on day two (27 March 2026, the day after the first commit). A change that matters ships only through a measured comparison against a baseline, with repeated runs, because one run's score moves by judge noise alone.

**What it rejected.**

- **An LLM retrieval reranker**, enabled by default on 12 April 2026 and removed on 8 July 2026 (commit `8e03a33`). A nine-run A/B, 150 scored answers per arm, found answers at least as good with it off on every metric, and a code trace showed its ordering did not survive answer-frame selection ([gotchas](../development/gotchas.md)).
- **`voyage-4-large` embeddings.** A June 2026 retrieval A/B against the then-current `voyage-law-2` found a small MRR gain with flat or lower recall, precision and primary hit rate, at the same price. It was not adopted; the cheaper `voyage-4` was ([archived note](../archive/byterover/context-tree/packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_law_2_vs_voyage_4_large.md), commit `ec7f4b7`).
- **A candidate verifier model** (`gpt-5.6-luna`, above).

**Its known weaknesses.** The October review found that some reference answers were not supported by the sections they cite (EVAL-1, being repaired as dataset versions 3.2 to 3.6), that a withheld answer scored a perfect 3 on hallucination (EVAL-4), and that the evaluated agent differed from the deployed one (EVAL-3). These are tracked; the scores in this repository should be read with them in mind.
