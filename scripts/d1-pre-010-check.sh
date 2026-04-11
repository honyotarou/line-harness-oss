#!/usr/bin/env bash
# Read-only duplicate counts before applying 010_users_unique_contact.sql.
# Usage: bash scripts/d1-pre-010-check.sh [local|remote]
# Exits 1 if any duplicate email / phone / external_id groups exist.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-local}"
cd "$ROOT/apps/worker"

export WRANGLER_SEND_METRICS=false

WR_EXTRA=()
if [[ -f wrangler.local.toml ]]; then
  WR_EXTRA=(-c wrangler.local.toml)
fi

WR=(pnpm exec wrangler "${WR_EXTRA[@]}" d1 execute line-crm)
if [ "$TARGET" = "remote" ]; then
  WR+=(--remote)
else
  WR+=(--local)
fi

SQL="SELECT
  (SELECT COUNT(*) FROM (SELECT 1 FROM users WHERE email IS NOT NULL GROUP BY email HAVING COUNT(*) > 1)) AS dup_emails,
  (SELECT COUNT(*) FROM (SELECT 1 FROM users WHERE phone IS NOT NULL GROUP BY phone HAVING COUNT(*) > 1)) AS dup_phones,
  (SELECT COUNT(*) FROM (SELECT 1 FROM users WHERE external_id IS NOT NULL GROUP BY external_id HAVING COUNT(*) > 1)) AS dup_external_id;"

echo "== d1-pre-010-check ($TARGET) =="
# Wrangler prints a banner before the JSON array; strip it for jq.
RAW="$("${WR[@]}" --command "$SQL" 2>/dev/null | awk '/^\[/ {p=1} p')" || true
echo "$RAW"

if ! command -v jq >/dev/null 2>&1; then
  echo "== d1-pre-010-check: install jq to enforce exit code; printed JSON above =="
  exit 0
fi

de="$(echo "$RAW" | jq -r '.[0].results[0].dup_emails // empty')"
dp="$(echo "$RAW" | jq -r '.[0].results[0].dup_phones // empty')"
dx="$(echo "$RAW" | jq -r '.[0].results[0].dup_external_id // empty')"

if [[ -z "$de" || -z "$dp" || -z "$dx" ]]; then
  echo "== d1-pre-010-check: could not parse wrangler JSON; inspect output above ==" >&2
  exit 1
fi

if [ "$((de + dp + dx))" -gt 0 ]; then
  echo "== d1-pre-010-check: DUPLICATES FOUND (emails=$de phones=$dp external_id=$dx) — resolve before 010 ==" >&2
  exit 1
fi

echo "== d1-pre-010-check: OK =="
