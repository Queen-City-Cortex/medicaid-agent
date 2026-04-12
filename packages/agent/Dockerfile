FROM node:22-slim AS base

# --- deps: install production dependencies ---
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
COPY --from=deps /app/packages/policy-corpus ./packages/policy-corpus
COPY package.json package-lock.json tsconfig.json turbo.json ./
COPY packages/agent ./packages/agent
COPY packages/policy-corpus ./packages/policy-corpus
WORKDIR /app/packages/agent
RUN npx mastra build --dir src

# --- runner: minimal production image ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/packages/agent/.mastra/output ./
EXPOSE 4111
CMD ["node", "index.mjs"]
