#!/bin/sh
set -e

# The agent runs as the non-root `node` user, but its persistent LibSQL store
# (DATABASE_URL=file:/data/mastra.db) lives on a Railway volume that is
# root-owned by default. A runtime volume mount masks any build-time chown, so
# ownership has to be fixed here, after the mount, on every boot (idempotent
# and fast once the files are already node-owned). /app is chowned too so the
# DuckDB observability store can be created there.
#
# Without this, saving a chat thread fails with
# `SQLITE_READONLY: attempt to write a readonly database` and the whole chat
# stream errors out.
chown node:node /app 2>/dev/null || true
chown -R node:node "${RAILWAY_VOLUME_MOUNT_PATH:-/data}" 2>/dev/null || true

# exec via gosu so PID 1 is replaced by node and Railway's SIGTERM reaches it
# directly for graceful shutdown (su / sh -c would swallow signals).
exec gosu node "$@"
