#!/usr/bin/env bash
# Wipe **local** Miniflare / wrangler D1 state and re-apply packages/db/schema.sql from zero.
#
# Usage (from repo root):
#   pnpm db:fresh:local
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WRANGLER_STATE="$ROOT/apps/worker/.wrangler"

if [[ -d "$WRANGLER_STATE" ]]; then
  rm -rf "$WRANGLER_STATE"
  echo "== removed $WRANGLER_STATE =="
else
  echo "== no $WRANGLER_STATE (nothing to remove) =="
fi

cd "$ROOT/apps/worker"
WR_EXTRA=()
if [[ -f wrangler.local.toml ]]; then
  WR_EXTRA=(-c wrangler.local.toml)
fi

echo "== applying packages/db/schema.sql to local D1 =="
pnpm exec wrangler "${WR_EXTRA[@]}" d1 execute line-crm --local --yes --file="../../packages/db/schema.sql"

echo "== d1-fresh local: OK =="
