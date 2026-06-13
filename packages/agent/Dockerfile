FROM node:22-slim AS base

# --- deps: install workspace dependencies ---
# Installs dev dependencies too: the builder stage needs them (mastra CLI,
# TypeScript) to bundle the agent.
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/agent/package.json ./packages/agent/
COPY packages/policy-corpus/package.json ./packages/policy-corpus/
RUN npm ci --workspace=@nc-medicaid/policy-corpus --workspace=@nc-medicaid/agent

# --- builder: bundle with mastra build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/agent/node_modules ./packages/agent/node_modules
COPY package.json package-lock.json tsconfig.json turbo.json ./
COPY packages/agent ./packages/agent
COPY packages/policy-corpus ./packages/policy-corpus
WORKDIR /app/packages/agent
RUN npx mastra build --dir src

# --- runner: minimal production image ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# gosu lets the entrypoint drop from root to `node` after it chowns the
# root-owned Railway volume (see docker-entrypoint.sh).
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/packages/agent/.mastra/output ./
COPY packages/agent/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
# No `USER node`: the entrypoint starts as root to fix volume ownership, then
# execs the app as `node` via gosu.
EXPOSE 4111
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "index.mjs"]
