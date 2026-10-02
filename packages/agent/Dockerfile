FROM node:22.23.3-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS base
RUN npm install --global npm@11.11.0

# --- deps: install workspace dependencies ---
# Installs dev dependencies too: the builder stage needs them (mastra CLI,
# TypeScript) to bundle the agent.
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/agent/package.json ./packages/agent/
COPY packages/policy-corpus/package.json ./packages/policy-corpus/
COPY packages/contracts/package.json ./packages/contracts/
RUN npm ci --workspace=@nc-medicaid/contracts --workspace=@nc-medicaid/policy-corpus --workspace=@nc-medicaid/agent

# --- builder: bundle with mastra build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/agent/node_modules ./packages/agent/node_modules
COPY package.json package-lock.json tsconfig.json turbo.json ./
COPY packages/agent ./packages/agent
COPY packages/policy-corpus ./packages/policy-corpus
COPY packages/contracts ./packages/contracts
WORKDIR /app/packages/agent
RUN npx mastra build --dir src

# --- runner: minimal production image ---
FROM base AS runner
# Sentry release tag for runtime error events. RAILWAY_GIT_COMMIT_SHA is
# provided by Railway at build time; SENTRY_DSN/SENTRY_ENVIRONMENT come from
# Railway at runtime (unset -> Sentry is a no-op).
ARG RAILWAY_GIT_COMMIT_SHA
WORKDIR /app
ENV NODE_ENV=production
# Cap the V8 heap so a JS-side leak restarts the container (Railway's
# ON_FAILURE policy) instead of growing the bill; native/DuckDB memory is
# bounded separately by TRACE_STORE=off and the railway.json memory limit.
ENV NODE_OPTIONS=--max-old-space-size=2048
ENV SENTRY_RELEASE=$RAILWAY_GIT_COMMIT_SHA
# gosu lets the entrypoint drop from root to `node` after it chowns the
# root-owned Railway volume (see docker-entrypoint.sh). sqlite3 exists for
# the daily off-platform backup (scripts/ops/backup-mastra.sh), which takes a
# consistent VACUUM INTO snapshot of /data/mastra.db inside the container.
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu sqlite3 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/packages/agent/.mastra/output ./
COPY packages/agent/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
# No `USER node`: the entrypoint starts as root to fix volume ownership, then
# execs the app as `node` via gosu.
EXPOSE 4111
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "index.mjs"]
