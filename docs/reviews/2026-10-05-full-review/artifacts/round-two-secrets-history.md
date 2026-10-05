# Working artifact from the round-two secrets-history review

I scanned every Git object available: 5,727 blobs and 1,327 commit messages (the working repository's reachable, reflog and unreachable objects plus all 203 pull-request heads fetched from GitHub into a scratch mirror) and 735 issue, PR and comment bodies. I used format rules, a prose scan and gitleaks 8.30.1, and compared in memory (names only) the values configured on the workstation, in captures of the production environment and in the ops laptop's secret stores.

Two live production credentials are in tracked files at HEAD and were not reported in round one: the production Neo4j password (two archived ByteRover files, six history blobs) and the production test-account password (one plan document). Both entered in commit f27085c on 2026-04-02 and are unrotated. Default gitleaks finds neither. The comparison also showed that production authenticates through a WorkOS staging key shared with the workstation, and that nine third-party GitHub Apps can read and write the repository.

What is fine: no .env file was ever committed; no OpenAI, Anthropic, WorkOS, Sentry, Railway, Exa, object-storage or healthchecks credential appears in any object, commit message or GitHub text; the only Voyage key is the stale one from round one; there is no customer data, WorkOS user id or real user question; the e2e test key cannot be accepted by production.

## Coverage

| What was scanned | Count | Note |
| --- | --- | --- |
| Blobs | 5,727 | Working repository object store (reachable, reflog and unreachable) plus objects only on GitHub pull-request refs |
| Commit objects (messages and identities) | 1,327 | 615 on main; 1,033 reachable from GitHub refs; 294 exist only locally |
| GitHub refs | 8 branches, 203 PR heads, 6 PR merge refs | 418 GitHub commits are not on main; 320 are not reachable from any local ref, so `git log --all` in the working clone never sees them |
| GitHub text | 214 issues and PRs, 283 issue comments, 238 review comments | No commit comments or releases exist |
| gitleaks 8.30.1, default rules | 983 commits | 78 findings: 4 true (Voyage key), 74 false; 0 on either live credential |
| Exact-value comparison (in memory, names only) | 457 needles | Workstation .env, 7 production env captures, ops.env, the ncmedicaid rclone remote, the Railway CLI session, .mcp.json, secret-named process variables |

## Credential hits: rotate or rewrite?

| # | Credential | Where | First commit | Live? | Rotate | Rewrite history |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Production Neo4j password (user neo4j, legacy `neo4j` service), starts `xR7m`, 32 chars | HEAD: `docs/archive/byterover/context-tree/database_operations/neo4j_auth/railway_neo4j_auth_handling.md:17,39`; `docs/archive/byterover/dream-log/drm-1781233424044.json:442,469`. History: 6 blobs under `.brv/context-tree/**` | f27085c 2026-04-02; dream log fbeaa17 2026-06-13; re-homed by 74e6440 (PR #141) 2026-10-01 | Yes. Equals NEO4J_PASSWORD in four production agent captures, 2026-10-02 and 2026-10-03 | Yes, immediately | No. Rotate and scrub HEAD. 417 of 615 main commits and all 203 PR heads carry it; PR refs cannot be rewritten |
| 2 | Production synthetic account password (<test account e-mail>), starts `l2S.`, 16 chars | HEAD: `docs/superpowers/plans/2026-03-29-chat-ui-features.md:633` (one blob) | f27085c 2026-04-02 | Yes. Equals workstation TEST_USER_PASSWORD and production corpus-job SYNTHETIC_USER_PASSWORD | Yes | No |
| 3 | Voyage API key, `pa-` form, 46 chars (round one, security-appsec-07) | HEAD: `docs/superpowers/plans/2026-03-27-ecfr-ingestion.md:907,915`; `2026-03-27-eval-harness.md:1300,1308` | 9300a7d and 9013894, 2026-03-27 | Not the current key: differs from the workstation and from the production VOYAGE_API_KEY. Revocation at Voyage unverified | Confirm deletion at Voyage | No |
| 4 | RSA test key (private JWK, kid `e2e-test-key-1`) | `e2e/fixtures/test-jwk.json` | 0c3c211 2026-07-10 (PR #82) | Test only | No | No |
| 5 | Hermetic cookie password and dummy WorkOS key | `e2e/helpers/hermetic-env.ts:10,16` | PR #82 | Test only; differs from production | No | No |
| 6 | eCFR site token inside a scraped sign-in link | History only: `.firecrawl/ecfr-developer.md`, `.firecrawl/ecfr-terms.md` (added e64832b, untracked 3eb5e30) | 2026-03-29 | Third-party page state (HS256, payload holds only `notifications`); not a project credential | No | No |
| 7 | WorkOS client ID | GitHub issue #186, comment of 2026-10-02 | n/a | Public identifier | No | No |
| 8 | Railway project, environment, service and deployment ids | `RUNBOOK.md`, `docs/operations/corpus-parser-recovery.md`, `scripts/ops/railway-tcp-proxy.sh:18-19`, `docs/validation/**` | n/a | Identifiers, useless without a token | No | No |
| 9 | Development Neo4j default `medicaid-dev` | `.env.example`, `ci.yml`, compose files | n/a | Development only; production startup rejects it (`runtime-config.ts:130`) | No | No |

Confirmed absent from every object, commit message and GitHub text: any .env file; the current OpenAI, Anthropic, Groq, Voyage, WorkOS API key, WorkOS cookie password, Sentry DSN and auth token, Railway project and CLI tokens, object-storage keys, blue and green Neo4j passwords, healthchecks ping URLs, Exa key; PEM or OpenSSH private keys; passwords in URLs; bearer tokens, cookies or sealed sessions.

## Can the committed test key be accepted outside tests?

- Agent: no. Both `MastraAuthWorkos` instances (`packages/agent/src/index.ts:256`, `:267`) construct `new WorkOS(apiKey, { clientId })` with no host option, and `@workos-inc/node` 9.3.1 reads only WORKOS_API_KEY, WORKOS_CLIENT_ID and WORKOS_COOKIE_PASSWORD from the environment. The JWKS always comes from api.workos.com for the configured client.
- Web: only if a deployment sets WORKOS_API_HOSTNAME, WORKOS_API_HTTPS and WORKOS_API_PORT to a host serving the test public key, which `@workos-inc/authkit-nextjs` reads in any NODE_ENV, and seals the cookie with that deployment's password. The production web, agent and corpus-job captures contain none of those variables, the stub lives only under `e2e/`, and `.dockerignore:51` excludes `e2e` from every image. A forged web session would still be rejected by the agent.

## Personal data

| Item | Where | Assessment |
| --- | --- | --- |
| Owner's personal Gmail address | Author or committer on 2,353 identity lines; one historic blob of `packages/web/src/app/preview/gallery.tsx` | Owner's own data. Would be exposed if the repository were ever published; a GitHub noreply address avoids that for new commits |
| testing@ and legal@queencitycortex.com | Plan document, `ThreadSidebar.test.tsx`, `packages/web/src/lib/legal.ts`, archive | Role addresses |
| Nine dhhs.nc.gov mailboxes and agency phone numbers | Crawler fixtures, evaluation results, source inquiries | Public agency contacts |
| `/Users/jkh` absolute paths | 6 tracked files; 2,781 occurrences in `packages/pipeline/data/audits/latest-corpus-audit.json` | Workstation username; hygiene only |
| ByteRover team and space ids, team name | `docs/archive/byterover/config.json` | Identifiers |
| WorkOS user ids | None in any object | |
| Thread ids | One synthetic release-smoke thread (`docs/validation/corpus-recovery-2026-09-23/hosted-smoke-outcome.json`) | Synthetic |
| User questions | Receipts use only "What does EPSDT require?"; evaluation sets are authored golden questions | No real user content |
| SSN, date-of-birth and phone patterns | `123-45-6789`, `222-22-2222`, a DOB in `sensitive-data.test.ts`, form placeholders | Synthetic |

## Reproduction (all in the scratch directory, nothing prints a value)

- `python3 exact2.py`: production and workstation values against every object and GitHub text, names only.
- `python3 locate.py .local-recovery/coverage-rehearsal-2026-10-03/agent-env.final.private.json NEO4J_PASSWORD "refs/remotes/gh/main:docs/archive/byterover/context-tree/database_operations/neo4j_auth/railway_neo4j_auth_handling.md"`: masked line view.
- `gitleaks-bin/gitleaks git --redact=100 --log-opts="--all" gh-mirror.git`, and the same with `--config gitleaks-custom.toml`.
- `scan.py`, `prose.py`, `pii.py`: format rules, prose tokens, identifiers.
