# NC Medicaid Navigator

AI-powered assistant for navigating North Carolina Medicaid policy. Uses a Neo4j knowledge graph of policy documents with semantic search to answer questions from legal aid attorneys, case managers, and beneficiaries.

## Architecture

```
packages/
  crawler/    # Discovers and downloads policy PDFs from NC government sites
  pipeline/   # Parses PDFs via Docling, builds Neo4j knowledge graph
  agent/      # Mastra agent with 8 tools for policy search and navigation
  web/        # Next.js chat interface
e2e/          # Playwright end-to-end tests
```

## Getting Started

```bash
# Install dependencies
npm install
cd packages/pipeline && pip install -e ".[dev]"

# Start Neo4j (must be running for agent)
# Default: bolt://localhost:7687, user: neo4j, password: medicaid-dev

# Run the agent dev server (port 4111)
cd packages/agent && npm run dev

# Run the web app (port 3000)
cd packages/web && npm run dev
```

## Environment Variables

```
ANTHROPIC_API_KEY     # Required — Claude API key
VOYAGE_API_KEY        # Required — Voyage AI embeddings
NEO4J_URI             # Default: bolt://localhost:7687
NEO4J_USER            # Default: neo4j
NEO4J_PASSWORD        # Default: medicaid-dev
DATABASE_URL          # Default: file:./mastra.db (agent memory)
```

## Testing

```bash
# Run all unit tests (crawler + agent + web + pipeline)
npm test

# Run with coverage reports
npm run test:coverage

# E2E tests (requires web dev server)
npm run test:e2e          # Mocked API tests
npm run test:e2e:smoke    # Real agent integration
npm run test:e2e:all      # Both
npm run test:e2e:ui       # Playwright UI debugger
```

## Packages

| Package | Stack | Tests |
|---------|-------|-------|
| [crawler](packages/crawler) | TypeScript, Cheerio, SQLite | 150 unit (Vitest) |
| [pipeline](packages/pipeline) | Python, Docling, Neo4j | 89 unit (pytest) |
| [agent](packages/agent) | TypeScript, Mastra, Claude | 23 unit (Vitest) |
| [web](packages/web) | Next.js 16, React 19, shadcn | 49 unit (Vitest) + 9 E2E (Playwright) |
