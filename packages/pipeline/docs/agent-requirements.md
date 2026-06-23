# Layer 3 Agent Requirements — NC Medicaid Knowledge Graph

Design notes for the reasoning agent that sits on top of the pipeline graph.

---

## 1. Negative Answer Reasoning

Some policy questions require reasoning about **absence** — i.e., the agent must correctly infer that a limit no longer applies because a change notice explicitly removed it.

**Example:** HCWD Phase III change notice removes visit limits previously set in the HCWD manual. A naive retrieval pass that only surfaces the original manual will return a wrong (outdated) answer.

**Requirements:**
- Before returning a final answer, the agent MUST traverse any `AMENDS` edges from the retrieved document set outward, and check whether a change notice overrides the relevant section.
- If an amending document explicitly removes, lifts, or nullifies a restriction, the agent should reason: "The original limit existed, but amendment X removed it — therefore no limit currently applies."
- This reasoning must be surfaced in the citation trail, not silently suppressed.

---

## 2. Table Lookup Tool

> **Status: not implemented (design intent below).** There is no dedicated
> `table_lookup` tool today. Tables are converted to Markdown inside each
> `Section`'s `content_text` during the pipeline load stage and surfaced to the
> agent through the existing `getSection` tool; the agent reads the rendered
> table from section text. The structured query interface described below is a
> forward requirement, not current behavior.

Many policy documents embed structured data as tables — premium schedules, income/resource limits by household size, level-of-care thresholds. Unstructured vector search cannot reliably return the correct cell from a table.

**Requirements:**
- Expose a dedicated `table_lookup` tool that accepts a document ID (or policy number) and a structured query (e.g., `{household_size: 3, column: "monthly_premium"}`).
- The tool should query `Section` nodes with `has_tables = true`, parse the embedded table (stored in `content_text`), and return the matching row/cell.
- Supported query types: income limits by household size, premium amounts by FPL band, resource limits by eligibility category.
- Fall back to returning the full table content if the structured query cannot be resolved deterministically.

---

## 3. Document-Type Routing

The graph contains multiple document types. The agent should route questions to the most authoritative source rather than treating all documents equally.

| Question domain | Preferred document type | Rationale |
|---|---|---|
| Medicaid eligibility (HCWD, MAA, MAB, MAD, MAGI, Spend-Down) | `dhhs_policy` | DHHS manuals define NC eligibility rules |
| Coverage of a specific service / prior auth criteria | `clinical_policy` | Clinical coverage policies define covered services |
| Federal baseline / statutory override | `federal_regulation` (CFR) / `federal_statute` (SSA) | eCFR/USC sections establish federal floor requirements |
| SPA amendments / state plan | `state_plan_amendment` | State Plan Amendments define NC-specific deviations |

These are the primary routes; the table is illustrative, not exhaustive. The
corpus has ten source families (see `corpus-manifest.json`) — the remaining
types the `document_types` filter also accepts are `bulletin`, `waiver`,
`provider_manual`, `fee_schedule`, `billing_guidance`, `managed_care_guidance`,
`managed_care_contract`, and `change_notice` (amendment/revision documents).

**Implementation note:** The canonical retrieval layer accepts a `document_types` list parameter (use the exact identifiers above, e.g. `federal_regulation`, not `cfr`). The agent should pass the appropriate type list before broadening to an unfiltered search if the filtered result is insufficient.

---

## 4. Amendment Awareness

The pipeline detects amendment relationships (`AMENDS` edges) at load time. The agent must treat these edges as first-class signals.

**Requirements:**
- When citing a policy document, the agent MUST check for inbound `AMENDS` edges. If a newer amendment exists, the agent should prefer citing the amendment and note that it supersedes the original.
- Documents with `status = 'amendment'` should be surfaced with a visual/textual marker (e.g., "CHANGE NOTICE") in any user-facing citation.
- The agent should NOT cite a document as authoritative if a later amendment contradicts its content — even if the original document has a higher vector similarity score.
- Amendment chains (A amends B, which amended C) should be resolved fully: the agent follows the chain to the most recent authoritative version.

---

## 5. Summary Checklist

- [ ] Numeric thresholds (premiums, income limits, resource limits) are answered from the table Markdown in `getSection` output. _(A dedicated structured `table_lookup` tool — Section 2 — is not yet implemented.)_
- [ ] Agent traverses `AMENDS` edges after each retrieval pass to detect superseding documents.
- [ ] Agent routes eligibility questions to `dhhs_policy` first via `document_types` filter.
- [ ] Agent routes service-coverage questions to `clinical_policy` first.
- [ ] Agent explicitly reasons about absence when a change notice removes a restriction.
- [ ] All citations include document status (`amendment` / `active`) and policy number.
