# Chat ownership deployment acceptance — October 3, 2026

[PR #200](https://github.com/Queen-City-Cortex/medicaid-agent/pull/200) merged as `d9354a604002f0f1d06503ff54b504fb791500f7` after developer approval for merging, deployment and fresh checks. Exact merged-commit CI passed. The [deployment receipt](deployment.json) ties the successful Railway deployment to that revision and image digest. The corpus remains `legacy-20260725-ae8595c`.

## Production route and release checks

Two distinct authenticated synthetic accounts exercised ownership. Forged user context in JSON/base64 GET requests could not list another account's thread. Missing/invalid credentials returned 401. A verified account targeting another account's thread received 404 from chat, and direct memory access was denied. The foreign thread and its empty message history remained unchanged. This exercises deployed storage and route boundaries; private observer/model-input isolation remains established by the local real-storage sentinel regression, not this empty live fixture.

The fixed [HTTP batch](epsdt-smoke-batch.json) passed 3/3. All answers required correction and passed exact-text recheck at pass two. Attempts one and three used fresh threads; attempt two reused the first owned conversation with fresh authentication. Each request carried forged user, diagnostic and question context, and resulting threads still belonged to the verified account. These are bounded release checks for one EPSDT question, not independent representative quality samples or corpus qualification.

The [browser receipt](browser-smoke.json) records a passed verified answer, thread switching/reload persistence, feedback creation/persistence/removal, logout, and protected chat requiring login. Its captured synthetic thread received a unique title through an authenticated, ownership-checked PATCH before persistence checks. This fixture adjustment changed no deployed code. The first browser attempt received a verified answer and logged out, but stopped before persistence/feedback because duplicate titles were ambiguous; its failed receipt remains retained separately. The successful browser emitted WebGL warnings and a logout/RSC CORS console error; this report does not claim a clean console.

## Retention and limits

Three unpaid preflights are retained: two stopped at secondary authentication on an SSO domain, and one compared different API response representations. The successful preflight uses the same GET endpoint before/after denied requests and retains both snapshots. No failed preflight made a model call. No failed HTTP answer attempt was replaced; one separate browser rerun followed the unique-title fixture adjustment.

All six conversations and four temporary WorkOS accounts created across these runs were removed and confirmed absent. Cleanup used captured IDs and thread owner checks; pre-existing test-account conversations and usage were not reset. Synthetic traffic must be excluded from usage assessments. The original Jev HEAD and pending source files were preserved.

Private artifacts under `/Users/jkh/.codex/epsdt-verification-audit/2026-10-03/deployment` retain streams, screenshots, detailed ownership/cleanup receipts, failed preflights and Opus reviews. No access tokens or passwords were saved. Git receipts contain only safe deployment identity, outcomes, health and redacted acceptance facts.

The [health receipt](health.json) records writable storage, a connected graph and healthy readiness after acceptance. Deployment used the existing persistent volume. Container SSH inspection was unavailable because the transport returned account metadata; this run does not independently attest signing-key bytes or inspect live private model inputs. No corpus activation, source retirement, graph mutation, scheduling changes or agency communication occurred. Four required source failures remain in [#187](https://github.com/Queen-City-Cortex/medicaid-agent/issues/187); full qualification remains in [#188](https://github.com/Queen-City-Cortex/medicaid-agent/issues/188).

[Opus independently reviewed](independent-review.json) the deployment identity, final browser/cleanup receipts and all three released HTTP answers, and approved this bounded acceptance with no blocking findings.
