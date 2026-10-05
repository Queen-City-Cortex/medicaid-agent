# Working artifact from the dependency-health reviewer

## A. Toolchain matrix (observed 2026-10-04)

| Tool | Declared | CI | Images | Workstation | Lifecycle |
|---|---|---|---|---|---|
| Node | engines `22.23.3` (exact); `.nvmrc` 22.22.0; RUNBOOK `>=22.12.0` | 22.23.3 | 22.23.3, digest-pinned | 26.9.0 | v22 maintenance LTS, ends 2027-04-30; v24 maintenance from 2026-10-20, ends 2028-04-30; v26 LTS from 2026-10-28 |
| npm | 11.11.0 | 11.11.0 (global install) | 11.11.0 (global install) | 11.19.1 | Node 22 bundles 10.9.9; Node 24.21 bundles 11.19.0 |
| Python | `>=3.11`, no `.python-version` | 3.11.14 | Debian 3.11.2-6+deb12u8 | venv 3.13.2 | 3.11 security-only, ends 2027-10-31 (endoflife.date) |
| uv | 0.8.22 | 0.8.22 | 0.8.22 | 0.12.18 | 0.8.22 published 2025-09-23; latest 0.12.23 |

## B. Override ledger (package.json)

| Lines | Override | Requesting range | Motivating advisory | State today | Verdict |
|---|---|---|---|---|---|
| 13-15 | ajv > fast-uri 4.2.1 | ajv 8.18/8.20: `^3.0.1` | fast-uri host-confusion/SSRF set (3.x fixed by 3.1.8) | 3.1.8 is patched and in range; override forces an undeclared major; not honoured for client-js's nested copy | Remove (stale) |
| 16-18 | cheerio > undici 7.30.0 | `^7.19.0` (jsdom `^7.25.0`) | undici 7.x set (fixed by 7.29.1) | 7.30.0 is the newest 7.x | Remove (redundant) |
| 19 | @mastra/core 1.58.0 | n/a | none; single-core intent | Duplicates the agent pin; not honoured for client-js's exact 1.45.0 | Remove (harmful; finding 2) |
| 20 | postcss 8.5.28 | shadcn `^8.5.23`, vite `^8.5.28`; next exact 8.5.23 | GHSA-fxqj-rqcc-2cmp (<=8.5.22) | 8.5.28 is latest; next's nested 8.5.23 is unaffected and not overridden | Remove (redundant) |
| 21-23 | express > qs 6.16.0 | express 4.22.1 `~6.14.0` | GHSA-4mjr-xmp4-gh2g (<6.16.0) | Needed while express is in the production audit tree | Keep until shadcn and nested core 1.45.0 are gone |
| 24-26 | @mastra/memory > probe-image-size 7.4.0 | `^7.2.3` | GHSA-gjj5-9665-rwrc (<=7.3.0) | 7.4.0 is latest; never reaches the production install | Remove (redundant) |
| 28-32 | root deps fast-uri, undici, ws | n/a | hoisting anchors | No root import; ws has no override | Remove |

## C. Parked Dependabot PRs

| PR | Content | CI | Root cause | Note |
|---|---|---|---|---|
| #164 | agent-sdk-compatible: ai 6.0.209 to 6.0.297; mastra CLI 1.15.0 to 1.31.4 | test and docker fail | CLI bump drags loggers to 1.3.3 and deployer/server to 1.72.0 against core 1.58.0: `buildLogRecordData` missing (34 agent suites, `mastra build`); lock holds two `ai` copies | Unmergeable without core |
| #181 | development-compatible: vitest and coverage 4.1.11, turbo 2.11.5, mastra CLI 1.31.4 | test and docker fail | Same CLI failure; lock has vitest 4.1.11 at root and 4.1.10 in five workspaces, so jest-dom matcher types vanish | Holds the GHSA-82fw-gwwq-j7x9 fix |
| #184 | @sentry/nextjs 10.75.3 to 11.1.0 | test, docker, e2e fail | `withSentryConfig is not a function`; agent would stay on Sentry 10 | Needs a migration; Sentry majors not ignored |
| #190 | production-compatible: 9 @mastra/*, 3 @ai-sdk/*, ai, @libsql/client 0.18.0, react/react-dom 19.3.0 | all green, CLEAN | Override stays 1.58.0; CLI/deployer/server stay 1.15.0/1.45.0/1.45.0 | Do not merge as-is (finding 2); holds the GHSA-866g-f22w-33x8 fix |

History: 53 Dependabot PRs since 2026-07-24; 1 merged (#176), 4 open, 48 closed.

## D. Mastra family

| Package | Manifest | Lock | Published | Latest |
|---|---|---|---|---|
| @mastra/core | 1.58.0 + override | 1.58.0 (and 1.45.0 under client-js) | 2026-08-12 | 1.74.0 |
| @mastra/memory | 1.26.1 | 1.26.1 | 2026-08-12 | 1.35.0 |
| @mastra/observability | 1.16.6 | 1.16.6 | 2026-08-12 | 1.18.3 |
| mastra (CLI) | ^1.15.0 | 1.15.0 | 2026-06-19 | 1.32.1 |
| @mastra/deployer, @mastra/server | via CLI | 1.45.0 | 2026-06-19 | 1.74.0 |
| @mastra/libsql | ^1.14.0 | 1.14.0 | 2026-06-19 | 1.25.0 (peer core >=1.68) |
| @mastra/loggers | ^1.2.0 | 1.2.0 | 2026-06-19 | 1.3.4 |
| @mastra/ai-sdk | ^1.5.0 | 1.5.0 | 2026-06-19 | 1.10.6 |
| @mastra/auth-workos | ^1.6.0 | 1.6.0 | 2026-06-19 | 1.6.6 |
| @mastra/duckdb | ^1.5.0 | 1.5.0 | 2026-06-19 | 1.12.1 (peer core >=1.68) |
| @mastra/client-js (web) | ^1.26.0 | 1.26.0 (hard dep core 1.45.0) | 2026-06-19 | 1.51.2 (hard dep core 1.74.0) |

## E. Python advisories in uv.lock (OSV)

| Package | GHSAs (crit/high/mod/low) | Fixed in | In-range upgrade (dry run) |
|---|---|---|---|
| pypdf 6.14.2 (direct) | 0/8/6/0 | 6.15.0 to 6.19.0 | 6.19.0 |
| pillow 12.1.1 | 0/12/6/0 | 12.2.0, 12.3.0 | 12.3.0 |
| urllib3 2.6.3 | 0/4/1/0 | 2.7.0, 2.8.0 | 2.8.0 |
| transformers 4.57.6 | 0/4/1/0 | 5.x; one unfixed | none (major) |
| soupsieve 2.8.3 | 0/2/2/0 | 2.8.4, 2.9.0 | 2.10 |
| anyio 4.13.0 | 1/0/1/0 | 4.14.2 | 4.14.2 |
| lxml 6.0.2 | 0/1/0/0 | 6.1.0 | 6.1.3 |
| idna 3.11 | 0/0/1/0 | 3.15 | 3.20 |
| setuptools 81.0.0 | 0/0/1/0 | 83.0.0 | none |
| accelerate 1.13.0 | 0/0/1/0 | none | none |
| pygments 2.19.2 | 0/0/0/1 | 2.20.0 | 2.21.0 |
| torch 2.11.0 | 0/0/0/1 | 2.13.0 | none |

Total 54 (1/31/20/2); 46 cleared by the in-range upgrade.

## F. npm audit

- Production (`--omit=dev`): 10 low, nothing higher (GHSA-866g-f22w-33x8 in @ai-sdk/provider-utils below 4.0.33, reaching ai, @ai-sdk/openai, @ai-sdk/anthropic, @ai-sdk/react, @mastra/client-js; GHSA-v422-hmwv-36x6 in body-parser).
- Full tree: 1 critical (shell-quote 1.8.3 from the mastra CLI; in-range fix exists), 12 high (one root cause: braces GHSA-vfj7-8cjw-p6xm through micromatch and fast-glob, reached from mastra/deployer, shadcn/ts-morph and eslint-config-next; no fixed braces release), 4 moderate (vitest GHSA-82fw-gwwq-j7x9, fixed in 4.1.11; @humanfs/node), 10 low.
- e2e: none.

## G. Licence ledger

- npm lock by `license` field: MIT 1,195; Apache-2.0 130; ISC 48; BSD-2-Clause 33; MPL-2.0 25 (lightningcss, axe-core; dev); BSD-3-Clause 20; BlueOak 11; LGPL-3.0-or-later 10 plus 4 combined (@img/sharp-libvips prebuilt binaries; optional, server-side, dynamically linked); FSL-1.1-MIT 9 (@sentry/cli, a build tool); remainder permissive. No GPL, AGPL or SSPL.
- Mastra: metadata says Apache-2.0; `ee/` subtrees are under the Mastra Enterprise Edition License v2.0 (finding 11).
- Python (installed metadata): MIT, BSD, Apache, PSF; MPL-2.0 for certifi and tqdm. Linux-only nvidia-* and cuda-* wheels have no licence metadata on PyPI.
- Models: docling-layout-heron Apache-2.0; docling-models (TableFormer) CDLA-Permissive-2.0 / Apache-2.0; RapidOCR Apache-2.0.
- Neo4j Community (GPLv3) runs as a separate service reached over Bolt.

## H. Hygiene scan

- Imported but undeclared: none in any workspace.
- Declared but never imported: root fast-uri, undici, ws; web devDependency @mastra/core.
- Type-only imports of devDependencies from source: agent `hono`, crawler `domhandler`.
- Duplicate versions: zod 3.25.76 / 4.6.5 (three copies) / 4.3.6; undici 7.30.0 and 8.11.2; @mastra/core 1.58.0 and 1.45.0.
- Install scripts: @sentry/cli, better-sqlite3, esbuild, unrs-resolver, fsevents.

## I. Notable outdated

ai 6.0.209 (6.0.300 in range; 7.0.127 latest); @ai-sdk/openai 3.0.74 (3.0.124; 4.0.83); @ai-sdk/anthropic 3.0.85 (3.0.127; 4.0.71); @sentry/* 10.75.3 (10.76.0; 11.4.0); typescript 6.0.3 (7.0.2); eslint 9.39.5 (10.12.0); vitest 4.1.10 (5.0.3); zod 3.25.76 (4.6.5); better-sqlite3 12.11.1 (13.0.3); react 19.2.7 (19.3.0); turbo 2.9.18 (2.11.7). Python: docling 2.115.0 (2.133.0); docling-core 2.87.1 (2.99.0); pypdf 6.14.2 (6.19.0); tokenizers 0.22.2 (0.23.2, pinned on purpose). e2e: dotenv 17 (18), iron-session 8 (9).
