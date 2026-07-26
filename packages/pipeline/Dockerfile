FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/app/packages/pipeline/.venv \
    CORPUS_DATA_ROOT=/data

ARG TARGETARCH
ARG RAILWAY_CLI_VERSION=5.17.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      age build-essential ca-certificates curl jq libreoffice \
      python3 python3-dev python3-venv rclone sqlite3 \
    && npm install --global npm@11.11.0 \
    && case "$TARGETARCH" in \
         amd64) railway_target="x86_64-unknown-linux-musl"; railway_sha="ff15817ccfe8f507ade6b7d913934f3fbe8456cb2ea6a6d9855e60a26e5e5e65" ;; \
         arm64) railway_target="aarch64-unknown-linux-musl"; railway_sha="473e7516dd3817c4cf26e30c80e55079c7e610fcd446bb404914d6a71ee1b228" ;; \
         *) echo "Unsupported Railway CLI architecture: $TARGETARCH" >&2; exit 1 ;; \
       esac \
    && curl -fsSL "https://github.com/railwayapp/cli/releases/download/v${RAILWAY_CLI_VERSION}/railway-v${RAILWAY_CLI_VERSION}-${railway_target}.tar.gz" -o /tmp/railway.tar.gz \
    && echo "${railway_sha}  /tmp/railway.tar.gz" | sha256sum --check --strict \
    && tar -xzf /tmp/railway.tar.gz -C /usr/local/bin railway \
    && railway --version \
    && rm -f /tmp/railway.tar.gz \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.8.22@sha256:9874eb7afe5ca16c363fe80b294fe700e460df29a55532bbfea234a0f12eddb1 /uv /uvx /bin/

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/agent/package.json packages/agent/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/crawler/package.json packages/crawler/package.json
COPY packages/pipeline/package.json packages/pipeline/package.json
COPY packages/policy-corpus/package.json packages/policy-corpus/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm ci

COPY packages ./packages
COPY corpus-manifest.json corpus-release-policy.json ./
COPY scripts ./scripts
RUN cd packages/pipeline \
    && uv sync --frozen --extra dev \
    && chmod +x /app/scripts/ops/*.sh

VOLUME ["/data"]
CMD ["bash", "scripts/ops/railway-corpus-job.sh"]
