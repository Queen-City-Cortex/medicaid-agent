FROM node:22-alpine AS base

# --- deps: install workspace dependencies ---
# Installs dev dependencies too: the builder stage needs them (Next.js,
# TypeScript, Tailwind) to build the app.
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/web/package.json ./packages/web/
RUN npm ci --workspace=@nc-medicaid/web

# --- builder: build Next.js standalone output ---
# NEXT_PUBLIC_* vars must be available at build time (Next.js inlines them).
# Use ARG so Railway can pass them via --build-arg.
FROM base AS builder
ARG NEXT_PUBLIC_MASTRA_URL
ARG NEXT_PUBLIC_WORKOS_REDIRECT_URI
# Sentry: NEXT_PUBLIC_SENTRY_DSN is inlined into the browser bundle; the auth
# token + org/project + release drive source-map upload during `next build`.
# All optional — without the auth token, upload is skipped (see next.config.ts).
# RAILWAY_GIT_COMMIT_SHA is provided by Railway at build time.
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG RAILWAY_GIT_COMMIT_SHA
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT \
    SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT \
    SENTRY_RELEASE=$RAILWAY_GIT_COMMIT_SHA
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY package.json package-lock.json tsconfig.json turbo.json ./
COPY packages/web ./packages/web
RUN npm run build --workspace=@nc-medicaid/web

# --- runner: minimal production image ---
FROM base AS runner
# Re-declared: ARGs do not cross build stages. SENTRY_RELEASE must match the
# release the source maps were uploaded under so runtime server-side events
# (instrumentation.ts) resolve against them. SENTRY_DSN/SENTRY_ENVIRONMENT are
# injected by Railway at runtime.
ARG RAILWAY_GIT_COMMIT_SHA
WORKDIR /app
ENV NODE_ENV=production
ENV SENTRY_RELEASE=$RAILWAY_GIT_COMMIT_SHA

# standalone output mirrors monorepo structure
COPY --from=builder --chown=node:node /app/packages/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=builder --chown=node:node /app/packages/web/public ./packages/web/public
USER node

EXPOSE 3000
ENV PORT=3000
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node packages/web/server.js"]
