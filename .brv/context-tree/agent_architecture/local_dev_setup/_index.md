---
children_hash: 818f780dae2267dc3a2253c7ffe2f9e5fbeae247fc2f3e34c1f78c4267511cb3
compression_ratio: 0.4989350372736954
condensation_order: 1
covers: [ci_workflow_concurrency_and_test_gates.md, env_consolidation/_index.md, local_development_setup.md]
covers_token_total: 1878
summary_level: d1
token_count: 937
type: summary
---
## Local Development Setup and CI Workflow

This d1 cluster captures how the repository is started locally and how it is validated in CI. The two child entries are tightly related: **`local_development_setup.md`** defines the repo’s local runtime and environment expectations, while **`ci_workflow_concurrency_and_test_gates.md`** defines the corresponding automation gates and deployment safety rules.

### `local_development_setup.md`
- Authoritative topic for repo-level local development of the NC Medicaid Navigator stacks: **Neo4j, web, and agent**.
- Preserves operational guidance around:
  - `docker compose`
  - workspace scripts
  - environment placement expectations
  - Neo4j service configuration
  - dev workflow rules
- Serves as the broader local setup foundation that other runtime and integration topics depend on.

### `env_consolidation/_index.md`
- Focused sub-entry under local dev setup describing **environment-variable consolidation**.
- Main decision: the root `.env` file is the **single source of truth** for:
  - LLM API keys
  - WorkOS authentication configuration
  - E2E test credentials
- Implementation detail:
  - `packages/agent/.env` and `packages/web/.env.local` are **absolute symlinks** to the root `.env`.
  - The previous circular symlink chain was removed by deleting symlinks first, then creating a real root `.env`.
- This entry is a targeted follow-up to the broader setup work, emphasizing env-source-of-truth strategy rather than full startup procedure.

### `ci_workflow_concurrency_and_test_gates.md`
- Documents `.github/workflows/ci.yml` as a two-job pipeline:
  - `test`
  - parallel `docker-build` job named **Production Docker builds**
- Core CI sequence:
  - branch-safe concurrency
  - checkout/setup
  - lint/build/typecheck
  - JS tests
  - pipeline `pytest`
  - agent integration tests
  - Docker build validation
- Key architectural choices:
  - **Main branch runs are never cancelled**
  - PR/branch runs may be cancelled safely
  - concurrency group is `${{ github.workflow }}-${{ github.ref }}`
  - `cancel-in-progress` uses an expression, not just a boolean
- Why main is protected:
  - Railway deploys are gated on the specific commit’s CI
  - path-skipped workflow/docs-only commits can strand an app-code deploy behind a later skipped commit
- Test architecture:
  - CI runs on `blacksmith-4vcpu-ubuntu-2404`
  - provisions Node 22, Python 3.11, and a Neo4j service (`neo4j:2026.05-community`)
  - uses `NEO4J_URI=bolt://localhost:7687`, `NEO4J_USER=neo4j`, `NEO4J_PASSWORD=medicaid-dev`
  - pipeline package tests are excluded from the JS test step to avoid duplication
  - pipeline has a distinct explicit `pytest` gate in `packages/pipeline`
  - agent integration tests are isolated and mock embeddings, so they do not require pipeline data load
- Docker validation:
  - agent build: `docker build -f packages/agent/Dockerfile -t agent-ci .`
  - web build: `docker build -f packages/web/Dockerfile` with placeholder `NEXT_PUBLIC_MASTRA_URL=http://localhost:4111` and `NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback`
- Important limitation:
  - there is intentionally **no e2e CI job** because `e2e/tests/auth.setup.ts` needs live WorkOS hosted-login credentials and cannot run hermetically.

### Relationship summary
- **Local development setup** provides the manual runtime contract for starting services and aligning env/config across packages.
- **CI workflow** mirrors and hardens that contract by validating the same stack under branch-safe concurrency rules and a separate production-image build gate.
- **Environment consolidation** is the bridge between them: the root `.env` strategy supports both local startup and CI-adjacent auth/test configuration.