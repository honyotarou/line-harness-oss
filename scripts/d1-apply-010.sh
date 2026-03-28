#!/usr/bin/env bash
# Apply packages/db/migrations/010_users_unique_contact.sql to D1.
# Usage:
#   bash scripts/d1-apply-010.sh local
#   CONFIRM=YES bash scripts/d1-apply-010.sh remote
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-local}"
FILE="$ROOT/packages/db/migrations/010_users_unique_contact.sql"
cd "$ROOT/apps/worker"

if [ "$TARGET" = "remote" ]; then
  if [ "${CONFIRM:-}" != "YES" ]; then
    echo "Remote apply refused. Run: CONFIRM=YES bash scripts/d1-apply-010.sh remote" >&2
    exit 1
  fi
  echo "== d1-apply-010: REMOTE $FILE =="
  pnpm exec wrangler d1 execute line-crm --remote --file="../../packages/db/migrations/010_users_unique_contact.sql"
else
  echo "== d1-apply-010: LOCAL $FILE =="
  pnpm exec wrangler d1 execute line-crm --local --file="../../packages/db/migrations/010_users_unique_contact.sql"
fi

echo "== d1-apply-010: OK =="
