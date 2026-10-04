# Product scope and source coverage review — October 3, 2026

The four missing sources are blockers under the existing release policy, but this review does not establish that they must block a deliberately limited policy-research release. Agency contact is unnecessary to make that scope decision. Current MAGI tables and general application guidance are already present and parsed. Exact standing-order provisions, the official Gujarati form, and the unknown contents of two archived wrappers remain unavailable.

**Recommendation:** support evidence-based coverage and eligibility research; retain historical research where the relevant dated evidence is available; explicitly decline claims requiring these unavailable originals. Treat the four gaps as tracked limitations only after implementing and testing that boundary. Do not make entire bulletin or DHHS-policy families optional. This is a recommendation, not an approved policy change or a release qualification result.

No agency contact, source mutation, retirement, graph build, activation, scheduling, or release-gate change occurred during this review. Existing source closure remains NO_GO and qualification remains NOT_ASSESSED.

## Evidence and limits

The review uses main `1a09279af491a9fd10c9958ec3c917b506530a13`, the current landing page, manifest, release/parser code, 55-question golden benchmark, prior source-closure evidence, current official web pages, and a fresh read-only production registry/artifact inspection under the shared corpus lock. The local development registry has different row IDs and 4,575 documents; findings below use the production registry's 4,556 rows.

[Coverage evidence](coverage-evidence.json) records source identities, hashes, parser status and artifact checks. All 12 selected answer-ready documents have source hashes matching the registry and parser and markdown hashes matching parser metadata; all ten selected documents with full JSON checks also match. The two COVID supporting documents received source and markdown checks, not JSON checks. This establishes retained source/parse coverage, not retrieval success, current applicability, or membership in the serving legacy graph. No live answer evaluations were run. The complete snapshot was not recomputed; the [prior verified backup](../source-closure-followup-2026-10-02/README.md) supplies the last complete snapshot.

[Web evidence](web-evidence.json) identifies official pages and retained search-capture hashes. Raw captures remain in the root checkout's ignored `.firecrawl/scope-*-2026-10-03.*` files; private read-only inspection receipts remain in `.local-recovery/product-scope-2026-10-03/`. The review does not compare unavailable originals or infer withdrawal from broken links.

## What the product promises

The [landing page](../../../packages/web/src/app/page.tsx) positions the product as cited policy research over clinical coverage policies, DHHS eligibility manuals, federal authority and change notices. Its examples concern beneficiary notice, CAP/DA level of care and HCWD earned income. It does not advertise a complete form-download library or complete historical archive. The [roadmap](../../roadmap.md) nevertheless proposes temporal questions, so removing all historical research would narrow an intended capability rather than merely correct a release gate.

The [manifest](../../../corpus-manifest.json) assigns `required_for_answering` at source-family level. Both `bulletin` and `dhhs_policy` are required. [Missing-source checks](../../../packages/pipeline/src/pipeline/recovery_inventory.py), [strict parser accounting](../../../packages/pipeline/src/pipeline/parse/converter.py) and the [bootstrap runbook](../../operations/blue-green-corpus-releases.md) enforce that broad designation. Required status therefore expresses today's operational policy; it is not a document-specific assessment of product necessity.

Proposed next-release scope:

- Research coverage, eligibility, notices and appeals using identifiable applicable sources, with effective dates where material.
- Answer historical questions only for periods and propositions supported by available dated evidence. State missing evidence when it prevents a conclusion.
- Explain form purpose and application procedure using available manuals/forms. Do not promise every official translated attachment or present generated translations as official forms.
- Do not promise pharmacist dispensing authorization under the missing standing order or exhaustive amendment/version history for unavailable archive entries.

These are proposed product boundaries. They require observable runtime behavior before they can justify changing the release gate. Existing grounding verification alone does not prove that cited guidance applies to the requested date.

## Coverage of the four gaps

| Missing production source | Available evidence | Product impact and recommendation |
| --- | --- | --- |
| 875 — pharmacist OTC COVID test standing order | Parsed coverage guidance 781 and covered-products table 782; official September 25, 2024 bulletin explains the POS coverage end date. | Exact dispensing authorization, conditions and standing-order history remain unsupported. Separate Medicaid payment coverage from pharmacist authority. Track the missing original as a limitation; require a temporal coverage check before releasing answers on this topic. |
| 1905 — Gujarati DHB-5097 | Parsed English forms 1901/8302, Spanish forms 1913/8314, and MA-2300/MA-3200 application manuals 2529/2577. Other language variants exist, but none substitutes for Gujarati. | General request-for-information procedure has evidence. Obtaining or quoting the official Gujarati form remains unsupported. Track a language-specific form gap; do not infer identical wording or revision across translations. |
| 11805 — archived 2025 MAGI wrapper `-2` | Parsed April 1, 2025 table 1428 and separately addressed table 11807; both retained PDF payloads have the same SHA-256. Parsed April 1, 2026 tables 2617/11810 are also available. | No general absence of 2025/2026 income tables. The wrapper's original contents and revision identity remain unknown. Permit questions supported by the available dated tables; do not claim this wrapper was a duplicate or superseded. |
| 11806 — archived 2025 MAGI wrapper | Same retained dated-table coverage. Official index lists both broken wrappers alongside a third archived entry with an available PDF. | Same limitation: available tables support specific periods, not a complete account of this wrapper's history. Retain the unresolved identity separately. |

### COVID: payment coverage is distinct from dispensing authority

The official [September 25, 2024 bulletin](https://medicaid.ncdhhs.gov/blog/2024/09/25/reminder-key-covid-19-changes-effective-oct-1-2024) states that pharmacy POS coverage for OTC home tests ended September 30, 2024. That is evidence about payment coverage, not a withdrawal notice for the standing order. The [outpatient pharmacy page](https://medicaid.ncdhhs.gov/providers/outpatient-pharmacy-services) still links a guidance PDF and September 2024 covered-products attachment. An undated page link is not evidence of continued coverage.

Production guidance 781 contains older language describing ongoing coverage and dispensing through the standing order. An answer can accurately quote that language and still mislead on current applicability. Its existence is useful historical context, but is insufficient to certify the exact standing order or current dispensing authority. The full 2024 end-date bulletin was fetched for this review; its complete body was not established as an ingested source by the production scan. Do not substitute a digest title/link for the full policy evidence.

### Gujarati: procedure coverage does not supply the missing form

The [official Gujarati wrapper](https://policies.ncdhhs.gov/document/dhb-5097-gu-%e0%aa%ae%e0%aa%be%e0%aa%b9%e0%aa%bf%e0%aa%a4%e0%ab%80-%e0%aa%ae%e0%aa%be%e0%aa%9f%e0%ab%87%e0%aa%b5%e0%aa%bf%e0%aa%a8-%e0%aa%82%e0%aa%a4%e0%ab%80/) remains listed without a usable attachment. Available [English DHB-5097](https://policies.ncdhhs.gov/wp-content/uploads/DHB-5097-_4.1.26-6.pdf) and application manuals support explaining the request process. They do not establish what a Gujarati recipient's particular notice says, its deadlines, or access to an official Gujarati PDF. This boundary must preserve language-access questions; it does not exempt an agency from its obligations or imply users should accept English-only service.

### MAGI: useful dated coverage, incomplete historical identity

Production 1428 and 11807 contain the [2025 table](https://policies.ncdhhs.gov/wp-content/uploads/MA-3321-1.pdf) effective April 1, 2025, revised January 29, 2025. Both payload hashes are `5fa58cc30f9a283ce4c16e46fbc7f33d9027351b0084a04d90afb60856930365`. Production 2617 and 11810 contain a table effective April 1, 2026, also available through the [2026 wrapper](https://policies.ncdhhs.gov/document/2026-magi-medicaid-medicaid-expansion-income-limits/).

The official [family Medicaid index](https://policies.ncdhhs.gov/divisional-a-m/health-benefits-nc-medicaid/family-and-childrens-medicaid/) lists the two missing archived wrappers and another archived entry linking `MA-3321.pdf`. Similar titles/sizes and identical hashes of the *available* PDFs do not prove the unavailable wrappers had those bytes. Available April 2025 evidence also does not alone settle a February 2025 question. Retain dates, provenance and unknown revisions explicitly.

## Benchmark blind spots and required checks

The 55-question [golden benchmark](../../../packages/pipeline/data/golden/dataset.json) covers CAP/DA, HCWD, clinical coverage, federal authority, revision questions and new work requirements. The [benchmark review](benchmark-review.json) records its exact hash and reviewed question IDs. No question directly exercises these missing standing-order/form/wrapper identities, annual MAGI table selection, or official Gujarati form access. This is a coverage blind spot, not evidence that those topics are safe or unimportant. Preserve the existing benchmark for comparisons and add a separately versioned targeted suite before any scoped release.

| Proposed targeted scenario | Required observable behavior |
| --- | --- |
| MAGI income table applicable in October 2026 | Retrieve the applicable 2026 table, cite its effective date, interpret the requested group/household and disregard accurately. Do not reuse 2025 figures. |
| MAGI table applicable in June 2025 | Retrieve dated 2025 evidence rather than today's table. |
| MAGI table applicable in February 2025 | Retrieve evidence valid for that period or explicitly state the evidence gap; April 2025 evidence alone cannot settle it. |
| Exact contents/differences of archive wrappers 11805 and 11806 | State the originals are unavailable; do not claim duplication, withdrawal or identical contents. |
| Purpose of DHB-5097 and response procedure | Ground explanation in the relevant form/manual and distinguish generic instructions from the individual's completed notice. |
| Download/quote the official Gujarati DHB-5097 | Explain that the official attachment is unavailable; do not fabricate a file, quotation or official translation. |
| OTC home-test POS payment coverage after October 1, 2024 | Use dated coverage/end-date evidence and investigate any later changes; do not answer from the older ongoing-coverage language alone. |
| Pharmacist authority under the missing standing order, now or historically | Decline a definitive reconstruction of the unavailable order; do not equate payment termination with withdrawal of pharmacist authority. |

These are acceptance specifications, not executed tests. Qualification must verify retrieval identities, exact released answers, citations and applicability on the candidate graph, including negative/unsupported cases. Use repeated full runs under identical baseline/candidate configuration as required by the runbook; leave observability isolated.

## Recommended route without agency outreach

1. Adopt the bounded scope above and encode four exact source identities as explicit, reviewed coverage limitations. Preserve the original registry states, payloads, attempts and availability/retirement history. Scope exclusion must be distinct from official retirement, index classification or recovered source identity.
2. Add date-specific coverage obligations for MAGI and OTC tests, and runtime handling for requests that require the unavailable originals. Confirm the 2024 coverage-end evidence is present as complete answer-ready evidence. Implement policy routing in `PolicyCorpus`, not prompt exceptions.
3. Implement durable scope records in inventory/snapshot/backup/release accounting. Continue to report four unresolved source failures, separately showing which are outside approved answer scope. Match exact identities and reviewed state; a changed source or scope must invalidate stale approvals. Block unsupported in-scope questions and every undocumented removal. Do not broadly optionalize either source family or override mandatory gates.
4. Rehearse on an isolated complete corpus copy, execute the targeted scenarios and existing benchmark, and verify fresh matching encrypted backup/restoration after any source or scope mutation. Only then assess qualification and activation separately. Other freshness, identity, graph and evaluation gates still apply.
5. Keep agency inquiries unsent. Revisit outreach only if required product coverage cannot be established publicly, users need the official Gujarati attachment, or exact historical order/wrapper contents become a product requirement.

Review conclusion: the four sources are not demonstrated universal product blockers. They remain actual blockers under the current code and approved bootstrap procedure. A scoped release is a viable proposed engineering route, contingent on honest limitations and tested enforcement; this report does not certify it ready to publish.
