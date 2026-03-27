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

## Sources

| Source | Priority | Documents |
|---|---|---|
| Clinical Coverage Policies | HIGH | ~177 PDFs |
| Medicaid Bulletins | HIGH | Monthly digests + individual bulletins |
| State Plan Amendments | MEDIUM | Dozens per year |
| Waiver Documents | MEDIUM-HIGH | ~11 from seed pages |

## Testing

```bash
npm test           # Run all tests
npm run test:watch # Watch mode
```

## Design

See `docs/superpowers/specs/2026-03-26-nc-medicaid-crawler-design.md` for the full specification.
