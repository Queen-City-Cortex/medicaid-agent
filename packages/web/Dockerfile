FROM node:20-alpine AS base

# --- deps: install production dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/web/package.json ./packages/web/
RUN npm ci --workspace=@nc-medicaid/web

# --- builder: build Next.js standalone output ---
FROM base AS builder
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
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
CMD ["node", "packages/web/server.js"]
