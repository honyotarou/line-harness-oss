#!/usr/bin/env bash
# Apply packages/db/migrations/016_friend_scenarios_unique.sql to D1 (dedupe + unique index).
#
#   bash scripts/d1-apply-016.sh local
#   CONFIRM=YES bash scripts/d1-apply-016.sh remote
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/worker"
FILE="$ROOT/packages/db/migrations/016_friend_scenarios_unique.sql"
WR_EXTRA=()
if [[ -f wrangler.local.toml ]]; then
  WR_EXTRA=(--config wrangler.local.toml)
fi
MODE="${1:-local}"
if [[ "$MODE" == "remote" ]]; then
  if [[ "${CONFIRM:-}" != "YES" ]]; then
    echo "Remote apply refused. Run: CONFIRM=YES bash scripts/d1-apply-016.sh remote" >&2
    exit 1
  fi
  echo "== d1-apply-016: REMOTE $FILE =="
  pnpm exec wrangler "${WR_EXTRA[@]}" d1 execute line-crm --remote --yes --file="../../packages/db/migrations/016_friend_scenarios_unique.sql"
else
  echo "== d1-apply-016: LOCAL $FILE =="
  pnpm exec wrangler "${WR_EXTRA[@]}" d1 execute line-crm --local --yes --file="../../packages/db/migrations/016_friend_scenarios_unique.sql"
fi
echo "== d1-apply-016: OK =="
