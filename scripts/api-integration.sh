#!/usr/bin/env bash
# Start wrangler dev --local, apply D1 schema, run Hurl smoke tests.
# Requires: hurl (https://hurl.dev), pnpm, apps/worker devDependencies (wrangler).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${API_INTEGRATION_PORT:-18787}"
export WRANGLER_SEND_METRICS=false

if ! command -v hurl >/dev/null 2>&1; then
  echo "hurl not found. Install: https://hurl.dev/docs/installation.html" >&2
  exit 1
fi

WORKER_DIR="$ROOT/apps/worker"
SCHEMA_FILE="$ROOT/packages/db/schema.sql"

if [ ! -f "$WORKER_DIR/.dev.vars" ]; then
  if [ -f "$WORKER_DIR/.dev.vars.example" ]; then
    cp "$WORKER_DIR/.dev.vars.example" "$WORKER_DIR/.dev.vars"
    echo "api-integration: created apps/worker/.dev.vars from .dev.vars.example"
  else
    echo "Missing apps/worker/.dev.vars.example" >&2
    exit 1
  fi
fi

echo "== api-integration: D1 schema (local) =="
pnpm --filter worker exec bash scripts/wrangler.sh d1 execute line-crm --local --file="../../packages/db/schema.sql"

echo "== api-integration: build workspace libs (wrangler resolves @line-crm/*/dist) =="
pnpm build:libs

echo "== api-integration: wrangler dev --local :$PORT =="
pnpm --filter worker exec bash scripts/wrangler.sh dev --local --port "$PORT" &
WRANGLE_PID=$!

cleanup() {
  if kill -0 "$WRANGLE_PID" 2>/dev/null; then
    kill "$WRANGLE_PID" 2>/dev/null || true
    wait "$WRANGLE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

BASE_URL="http://127.0.0.1:${PORT}"
for _ in $(seq 1 60); do
  if curl -sf "${BASE_URL}/openapi.json" >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -sf "${BASE_URL}/openapi.json" >/dev/null; then
  echo "Worker did not become ready at ${BASE_URL}" >&2
  exit 1
fi

echo "== api-integration: hurl =="
hurl --test --variable "base=${BASE_URL}" "$ROOT/tests/hurl/smoke.hurl"

echo "== api-integration: OK =="
