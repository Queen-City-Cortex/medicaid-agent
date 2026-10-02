# NC Medicaid Navigator

AI-powered assistant for navigating North Carolina Medicaid policy. Uses a Neo4j knowledge graph of policy documents with semantic search to answer questions from legal aid attorneys, case managers, and beneficiaries.

Start with the [documentation index](docs/README.md) for architecture, development, operations, and project lessons.

## Architecture

```
packages/
  crawler/        # Discovers and downloads policy PDFs from NC government sites
  pipeline/       # Parses PDFs via Docling, builds Neo4j knowledge graph (Python)
  policy-corpus/  # Shared TS library: hybrid search, legal primitives, and answer frames
  contracts/      # Shared API schemas and types
  agent/          # Mastra orchestration, verification, and research execution
  web/            # Next.js chat interface
e2e/              # Playwright end-to-end tests (standalone, not an npm workspace)
```

## Getting Started

```bash
# Install dependencies
npm install
npm run setup -w @nc-medicaid/pipeline

# Start Neo4j (must be running for agent)
# Default: bolt://localhost:7687, user: neo4j, password: medicaid-dev

# Run the agent dev server (port 4111)
npm run dev -w @nc-medicaid/agent

# Run the web app (port 3000)
npm run dev -w @nc-medicaid/web
```

## Environment Variables

Consult [RUNBOOK.md](RUNBOOK.md) and [runtime configuration](packages/agent/src/runtime-config.ts) for current model defaults and validated settings.

```
OPENAI_API_KEY        # Required — agent and verifier provider
VOYAGE_API_KEY        # Required — Voyage AI embeddings
ANTHROPIC_API_KEY     # Optional — only when AGENT_MODEL is set to a claude-* model
AGENT_MODEL           # Optional model override; see runtime configuration
NEO4J_URI             # Default: bolt://localhost:7687
NEO4J_USER            # Default: neo4j
NEO4J_PASSWORD        # Default: medicaid-dev
DATABASE_URL          # Default: file:./mastra.db (agent memory)
```

See RUNBOOK.md for the full table.

## Testing

```bash
# Run all unit tests (crawler + policy-corpus + agent + web + pipeline)
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
| [crawler](packages/crawler) | TypeScript, Cheerio, SQLite | Vitest |
| [pipeline](packages/pipeline) | Python, Docling, Neo4j | pytest |
| [policy-corpus](packages/policy-corpus) | TypeScript | Vitest |
| [contracts](packages/contracts) | TypeScript, Zod | Vitest |
| [agent](packages/agent) | TypeScript, Mastra, OpenAI/Anthropic | Vitest (+ opt-in Neo4j integration suite) |
| [web](packages/web) | Next.js 16, React 19, shadcn | Vitest |
| [e2e](e2e) | Playwright | mocked + smoke projects |

Run `npm test` for current counts — exact numbers go stale fast.
