FROM node:20-alpine AS base

# --- deps: install production dependencies ---
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
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY package.json package-lock.json tsconfig.json turbo.json ./
COPY packages/web ./packages/web
RUN npm run build --workspace=@nc-medicaid/web

# --- runner: minimal production image ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# standalone output mirrors monorepo structure
COPY --from=builder /app/packages/web/.next/standalone ./
COPY --from=builder /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=builder /app/packages/web/public ./packages/web/public

EXPOSE 3000
ENV PORT=3000
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node packages/web/server.js"]
