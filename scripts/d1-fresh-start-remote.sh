#!/usr/bin/env bash
# Wipe **remote** Cloudflare D1 named `line-crm`, recreate it, update apps/worker/wrangler.local.toml
# database_id when that file exists (or create it from wrangler.local.toml.example), then apply
# packages/db/schema.sql. Irreversible data loss on the remote database.
#
# Usage (from repo root):
#   CONFIRM=YES CONFIRM_REMOTE_D1_WIPE=YES pnpm db:fresh:remote
#
# Afterward: redeploy the Worker (or update CI secrets) if production binding must use the new
# database_id — wrangler deploy reads wrangler.toml / wrangler.local.toml.
set -euo pipefail

if [[ "${CONFIRM:-}" != "YES" ]] || [[ "${CONFIRM_REMOTE_D1_WIPE:-}" != "YES" ]]; then
  echo "Refused: this deletes the remote D1 database named line-crm and all of its data." >&2
  echo "Run: CONFIRM=YES CONFIRM_REMOTE_D1_WIPE=YES pnpm db:fresh:remote" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/worker"

WR_EXTRA=()
if [[ -f wrangler.local.toml ]]; then
  WR_EXTRA=(-c wrangler.local.toml)
fi

echo "== d1-fresh remote: deleting D1 'line-crm' (irreversible) =="
pnpm exec wrangler "${WR_EXTRA[@]}" d1 delete line-crm -y

echo "== d1-fresh remote: creating new D1 'line-crm' =="
OUT=$(pnpm exec wrangler "${WR_EXTRA[@]}" d1 create line-crm 2>&1)
echo "$OUT"
NEW_ID=$(echo "$OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | tail -1)
if [[ -z "$NEW_ID" ]]; then
  echo "Could not parse new database UUID from wrangler output. Create DB in dashboard, set database_id, then: pnpm db:migrate" >&2
  exit 1
fi
echo "== new database_id: $NEW_ID =="

LOCAL_TOML="$ROOT/apps/worker/wrangler.local.toml"
EXAMPLE="$ROOT/apps/worker/wrangler.local.toml.example"
if [[ -f "$LOCAL_TOML" ]]; then
  if grep -q '^database_id = ' "$LOCAL_TOML"; then
    perl -i -pe "s/^database_id = \".*\"/database_id = \"$NEW_ID\"/" "$LOCAL_TOML"
    echo "== updated database_id in wrangler.local.toml =="
  else
    echo "!! wrangler.local.toml has no database_id= line; add: database_id = \"$NEW_ID\" under [[d1_databases]]" >&2
  fi
else
  if [[ -f "$EXAMPLE" ]]; then
    sed "s/YOUR_D1_DATABASE_ID/$NEW_ID/" "$EXAMPLE" >"$LOCAL_TOML"
    echo "== created wrangler.local.toml from example (edit WORKER_URL / WEB_URL / LIFF_URL) =="
    WR_EXTRA=(-c wrangler.local.toml)
  else
    echo "!! No wrangler.local.toml or example; set database_id=$NEW_ID in your wrangler config, then pnpm db:migrate" >&2
    exit 1
  fi
fi

echo "== d1-fresh remote: applying packages/db/schema.sql =="
pnpm exec wrangler "${WR_EXTRA[@]}" d1 execute line-crm --remote --yes --file="../../packages/db/schema.sql"

echo "== d1-fresh remote: OK. Redeploy Worker / refresh CI D1 secrets if deploy does not use this wrangler.local.toml. =="
