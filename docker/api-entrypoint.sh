#!/bin/sh
set -e

# Auto-generate and persist SESSION_SECRET if not provided
if [ -z "${SESSION_SECRET:-}" ]; then
  SECRET_FILE="/data/session_secret"
  if [ -f "$SECRET_FILE" ]; then
    export SESSION_SECRET="$(cat "$SECRET_FILE")"
  else
    mkdir -p /data
    export SESSION_SECRET="$(openssl rand -hex 32)"
    echo "$SESSION_SECRET" > "$SECRET_FILE"
    echo "[startup] Generated new SESSION_SECRET (persisted to volume)"
  fi
fi

# Apply schema to DB (idempotent — safe to run on every startup)
echo "[startup] Applying database schema..."
pnpm exec prisma db push --schema packages/db/prisma/schema.prisma --skip-generate --accept-data-loss 2>&1 | grep -v "^$" || true

echo "[startup] Starting API..."
exec node apps/api/dist/index.js
