# NC Medicaid Document Crawler

Polite, incremental crawler for NC Medicaid policy documents. Discovers and downloads PDFs from North Carolina government websites while maintaining a local SQLite registry for change detection.

Part of the NC Medicaid Navigator project (Layer 0 prerequisite).

## Usage

```bash
# Install dependencies
npm install

# Full crawl
npx tsx src/index.ts crawl

# Crawl specific source
npx tsx src/index.ts crawl --source clinical_policy
npx tsx src/index.ts crawl --source bulletin --since-year 2020

# Check for updates (no new discovery)
npx tsx src/index.ts check

# Registry stats
npx tsx src/index.ts stats

# List documents
npx tsx src/index.ts list --source clinical_policy --status downloaded

# Manually add a URL
npx tsx src/index.ts add-url "https://example.com/doc.pdf" --source waiver --title "CAP/DA" --policy-number "3K-2" --category "Community-Based Services"

# Export registry
npx tsx src/index.ts export --output registry.json

# Update test fixtures from live site
npx tsx src/index.ts update-fixtures

# Dry run
npx tsx src/index.ts crawl --dry-run
```

The CLI is a [commander](https://www.npmjs.com/package/commander) program in
`src/index.ts` that registers one command per module under `src/cli/`. The most
common commands also have npm-script shortcuts: `npm run crawl`, `npm run check`,
`npm run stats`.

## Sources

Ten source families are configured in `src/config.ts`. The `--source` value below
is what you pass to `crawl`/`list` (e.g. `crawl --source clinical_policy`); the
answer role and authority tier come from `corpus-manifest.json`.

| `--source` value | Covers | Answer role | Authority tier |
|---|---|---|---|
| `clinical_policy` | Clinical Coverage Policies (~177 PDFs) | coverage | authoritative |
| `dhhs_policy` | DHHS eligibility manuals (MA-series) | eligibility | authoritative |
| `state_plan_amendment` | State Plan Amendments | federal_authority | authoritative |
| `waiver` | Waiver documents (~11 from seed pages) | coverage | authoritative |
| `bulletin` | Medicaid bulletins (monthly digests + individual) | implementation | supporting |
| `provider_manual` | NCTracks provider manuals | billing | operational |
| `billing_guidance` | Billing guidance | billing | operational |
| `fee_schedule` | Fee schedules (large — ~2,000 docs; staged ingest) | reimbursement | supporting |
| `managed_care_guidance` | Managed care guidance (hundreds of mixed PDFs) | managed_care | supporting |
| `managed_care_contract` | Managed care contracts & amendments | managed_care_contract | supporting |

`fee_schedule` and `managed_care_*` are large, mixed-format families — treat them
as staged ingests and use `audit-corpus` (pipeline) to track partial progress
rather than expecting one crawl/parse/load pass to finish quickly.

## Discovery failures and freshness

A family's discovery fails when a configured index, seed or landing page does
not answer 200, when it lists no documents, or, on a default full crawl (no
`--source`, default `--since-year`), when it lists fewer documents than its
floor in `minDiscoveredDocuments` (`src/config.ts`). Non-200 sub-pages and
detail pages are logged and skipped; the floor is what catches a large silent
loss behind them. Lower a floor deliberately when the agency really shrinks a
family.

`source_freshness` is stamped only for families whose discovery passed, and
never on `--dry-run`. Documents listed by a family that fell short of its floor
are still recorded and downloaded. The command finishes its download and check
phases, then exits 3 if any failed family is `required_for_answering` in
`corpus-manifest.json`; a failed family that is not required is logged and left
unstamped, and the exit status stays 0. `scripts/ops/railway-corpus-job.sh` and
`scripts/ops/daily-check.sh` treat exit 3 as "parse and back up, do not
release"; keep the three in step if the status changes.

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With line-level coverage report
```
