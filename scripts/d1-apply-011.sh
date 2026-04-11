#!/usr/bin/env bash
# Apply packages/db/migrations/011_admin_principal_roles.sql to D1.
# Usage:
#   bash scripts/d1-apply-011.sh local
#   CONFIRM=YES bash scripts/d1-apply-011.sh remote
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-local}"
FILE="$ROOT/packages/db/migrations/011_admin_principal_roles.sql"
cd "$ROOT/apps/worker"

# Match apps/worker/scripts/wrangler.sh: Wrangler 3 does not auto-merge wrangler.local.toml.
WR_EXTRA=()
if [[ -f wrangler.local.toml ]]; then
  WR_EXTRA=(-c wrangler.local.toml)
fi

if [ "$TARGET" = "remote" ]; then
  if [ "${CONFIRM:-}" != "YES" ]; then
    echo "Remote apply refused. Run: CONFIRM=YES bash scripts/d1-apply-011.sh remote" >&2
    exit 1
  fi
  echo "== d1-apply-011: REMOTE $FILE =="
  pnpm exec wrangler "${WR_EXTRA[@]}" d1 execute line-crm --remote --yes --file="../../packages/db/migrations/011_admin_principal_roles.sql"
else
  echo "== d1-apply-011: LOCAL $FILE =="
  pnpm exec wrangler "${WR_EXTRA[@]}" d1 execute line-crm --local --yes --file="../../packages/db/migrations/011_admin_principal_roles.sql"
fi

echo "== d1-apply-011: OK =="
