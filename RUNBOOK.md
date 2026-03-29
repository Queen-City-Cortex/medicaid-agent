# NC Medicaid Navigator — Operations Runbook

## Prerequisites

- Docker running with `neo4j-medicaid` container (`docker start neo4j-medicaid`)
- Node.js 20+ (for crawler)
- Python 3.11+ with venv at `packages/pipeline/.venv/`
- `VOYAGE_API_KEY` environment variable set (for embeddings and search)

## Daily: Check for Document Changes

```bash
cd packages/crawler && npx tsx src/index.ts check
```

Sends conditional requests (ETag/If-Modified-Since) for every document in the registry. No downloads unless content changed. ~10 minutes with rate limiting.

## Weekly: Full Discovery Crawl

```bash
cd packages/crawler && npx tsx src/index.ts crawl
```

Re-fetches all index pages, discovers new documents, downloads anything new or changed. Existing unchanged documents skipped via hash comparison. ~40 minutes for a full run.

To crawl a specific source only:
```bash
npx tsx src/index.ts crawl --source clinical_policy
npx tsx src/index.ts crawl --source dhhs_policy
npx tsx src/index.ts crawl --source bulletin --since-year 2024
```

## After Crawler Finds Changes: Re-run Pipeline

```bash
cd packages/pipeline
.venv/bin/python -m pipeline.cli run-all
```

This runs all stages in order:
1. **Parse** — Docling converts new/changed PDFs to JSON (hash-cached, skips unchanged)
2. **Load** — MERGE into Neo4j (idempotent, safe to re-run)
3. **Federal Regulations** — eCFR ingest (cached 90 days)
4. **Social Security Act** — USC ingest (cached, rarely changes)
5. **Cross-references** — extract and resolve
6. **Amendments** — detect change notice → manual relationships
7. **Embeddings** — Voyage AI (only embeds sections without embeddings)
8. **Concepts** — seed and link

Or run stages individually:
```bash
.venv/bin/python -m pipeline.cli parse
.venv/bin/python -m pipeline.cli load
.venv/bin/python -m pipeline.cli ingest-cfr
.venv/bin/python -m pipeline.cli ingest-ssa
.venv/bin/python -m pipeline.cli extract-refs
.venv/bin/python -m pipeline.cli detect-amendments
.venv/bin/python -m pipeline.cli seed-concepts
.venv/bin/python -m pipeline.cli link-concepts
.venv/bin/python -m pipeline.cli embed
```

## Quarterly: Refresh Federal Sources

```bash
.venv/bin/python -m pipeline.cli ingest-cfr --refresh
.venv/bin/python -m pipeline.cli ingest-ssa --refresh
```

Federal regulations change slowly. The `--refresh` flag forces re-fetch even if cached. Use when CMS finalizes major rules.

## After Any Pipeline or Code Change: Run Eval

```bash
.venv/bin/python -m pipeline.cli eval --level retrieval
.venv/bin/python -m pipeline.cli eval-runs --last 5
.venv/bin/python -m pipeline.cli eval-compare <old_run_id> <new_run_id>
```

A regression is flagged if any metric drops more than 5%. Investigate failures before merging.

## Validate Dataset and Graph Integrity

```bash
.venv/bin/python -m pipeline.cli eval-validate   # Check golden dataset refs exist in graph
.venv/bin/python -m pipeline.cli stats            # Node/edge counts and embedding coverage
```

## Full Rebuild (Nuclear Option)

If the graph is corrupted or you need to rebuild from scratch:

```bash
cd packages/pipeline
.venv/bin/python -m pipeline.cli load --reset     # Drops all nodes, reloads from parsed JSON
.venv/bin/python -m pipeline.cli ingest-cfr
.venv/bin/python -m pipeline.cli ingest-ssa
.venv/bin/python -m pipeline.cli extract-refs
.venv/bin/python -m pipeline.cli detect-amendments
.venv/bin/python -m pipeline.cli seed-concepts
.venv/bin/python -m pipeline.cli link-concepts
.venv/bin/python -m pipeline.cli embed            # Re-embeds all content sections
```

This takes ~30 minutes (most time is embedding via Voyage API). The parsed JSON in `data/parsed/` is preserved — only the Neo4j graph is rebuilt.

## Troubleshooting

**Neo4j not running:**
```bash
docker start neo4j-medicaid
# Or recreate:
docker run -d --name neo4j-medicaid -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/medicaid-dev -v neo4j-medicaid-data:/data neo4j:community
```

**Neo4j Browser:** `http://localhost:7474` (neo4j/medicaid-dev)

**Crawl getting 429s:** The crawler backs off automatically. If persistent, increase `defaultDelayMs` in `packages/crawler/src/config.ts`.

**Docling parse failures:** Check `file` command on the PDF — some are HTML files with `.pdf` extension (server returned error page instead of document). These can be safely ignored.

**Embedding errors:** Usually oversized batches. The embed command handles chunking automatically. If errors persist, re-run — it only processes sections without embeddings.

## Source Sites

| Source | URL | Update Frequency |
|---|---|---|
| Clinical Policies | medicaid.ncdhhs.gov/providers/program-specific-clinical-coverage-policies | Monthly |
| Bulletins | medicaid.ncdhhs.gov/providers/medicaid-bulletin | Monthly |
| State Plan Amendments | medicaid.ncdhhs.gov/meetingsnotices/medicaid-state-plan-public-notices | As needed |
| Waivers | medicaid.ncdhhs.gov (various pages) | Infrequent |
| Provider Manuals | nctracks.nc.gov/content/public/providers/provider-manuals.html | Quarterly |
| DHHS Policies | policies.ncdhhs.gov/divisional-a-m/health-benefits-nc-medicaid/ | As needed |
| Federal Regulations | ecfr.gov (42 CFR, 45 CFR) | Quarterly |
| Social Security Act | uscode.house.gov (42 USC Ch. 7) | Rarely |
