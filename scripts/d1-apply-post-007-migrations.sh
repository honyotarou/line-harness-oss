#!/usr/bin/env bash
# Apply packages/db/migrations/008_* … 025_* in order (multi-account onward).
#
# Use when `pnpm db:migrate` (full schema.sql on remote) fails with errors like:
#   no such column: line_account_id
# That happens because CREATE TABLE IF NOT EXISTS leaves old tables unchanged while
# CREATE INDEX still targets new columns.
#
# Usage:
#   bash scripts/d1-apply-post-007-migrations.sh local
#   CONFIRM=YES bash scripts/d1-apply-post-007-migrations.sh remote
#
# Resume after a partial run (e.g. "duplicate column name: line_account_id" on 008 means 008
# is already applied). Apply from the next migration number:
#   CONFIRM=YES DB_APPLY_START_AT=009 pnpm db:apply-migrations:remote
#
# 009_operability.sql starts with ALTER … line_account_id on notification_rules / notifications.
# If 009 fails with duplicate column, 009 is already applied → use DB_APPLY_START_AT=010.
#
# Optional: DB_APPLY_END_AT=024 skips files with migration id greater than 024 (025 not run).
#
# Optional: DB_APPLY_CONTINUE_ON_DUPLICATE=1 treats only SQLite "duplicate column name" errors
# as success and continues (blunt; prefer START_AT when you know the first missing migration).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-local}"
cd "$ROOT/apps/worker"

WR_EXTRA=()
if [[ -f wrangler.local.toml ]]; then
  WR_EXTRA=(-c wrangler.local.toml)
fi

REMOTE_FLAGS=(--remote --yes)
LOCAL_FLAGS=(--local --yes)

if [ "$TARGET" = "remote" ]; then
  if [ "${CONFIRM:-}" != "YES" ]; then
    echo "Remote apply refused. Run: CONFIRM=YES bash scripts/d1-apply-post-007-migrations.sh remote" >&2
    exit 1
  fi
  FLAGS=("${REMOTE_FLAGS[@]}")
  echo "== d1-apply-post-007: REMOTE (008→025, START=${DB_APPLY_START_AT:-008}, END=${DB_APPLY_END_AT:-unset}, CONTINUE_DUP=${DB_APPLY_CONTINUE_ON_DUPLICATE:-0}) =="
else
  FLAGS=("${LOCAL_FLAGS[@]}")
  echo "== d1-apply-post-007: LOCAL (008→025, START=${DB_APPLY_START_AT:-008}, END=${DB_APPLY_END_AT:-unset}, CONTINUE_DUP=${DB_APPLY_CONTINUE_ON_DUPLICATE:-0}) =="
fi

MIGRATIONS=(
  008_multi_account.sql
  009_operability.sql
  010_users_unique_contact.sql
  011_admin_principal_roles.sql
  012_line_webhook_event_dedup.sql
  013_incoming_webhook_payload_dedup.sql
  014_admin_principal_line_accounts.sql
  015_admin_session_revocations.sql
  016_friend_scenarios_unique.sql
  017_drop_legacy_admin_users.sql
  018_outgoing_webhooks_line_account.sql
  019_admin_principal_owner_role.sql
  020_chats_line_account_fk.sql
  021_users_email_lowercase.sql
  022_conversion_line_account_scope.sql
  023_incoming_webhooks_line_account_scope.sql
  024_operators_line_account_scope.sql
  025_audit_log_webhook_secret_not_null.sql
)

start_n="${DB_APPLY_START_AT:-008}"
end_n="${DB_APPLY_END_AT:-}"

for name in "${MIGRATIONS[@]}"; do
  FILE="$ROOT/packages/db/migrations/$name"
  if [[ ! -f "$FILE" ]]; then
    echo "Missing migration file: $FILE" >&2
    exit 1
  fi
  exec_file="$FILE"
  tmp_sql=""
  id="${name%%_*}"
  if ((10#$id < 10#$start_n)); then
    echo "--> skip $name (migration $id < DB_APPLY_START_AT=$start_n)"
    continue
  fi
  if [[ -n "$end_n" ]] && ((10#$id > 10#$end_n)); then
    echo "--> skip $name (migration $id > DB_APPLY_END_AT=$end_n)"
    continue
  fi
  echo "--> $name"

  # Wrangler 3.x D1 execution rejects explicit BEGIN/COMMIT/SAVEPOINT in some environments.
  # When present, strip transaction / foreign_keys PRAGMA lines and run the sanitized SQL.
  if grep -Eq '^\s*(BEGIN TRANSACTION;|COMMIT;|SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT|PRAGMA foreign_keys=OFF;|PRAGMA foreign_keys=ON;)\b' "$FILE"; then
    tmp_sql="$(mktemp)"
    sed -E '/^\s*(BEGIN TRANSACTION;|COMMIT;|SAVEPOINT .*;|RELEASE SAVEPOINT .*;|ROLLBACK TO SAVEPOINT .*;|PRAGMA foreign_keys=OFF;|PRAGMA foreign_keys=ON;)\s*$/d' "$FILE" >"$tmp_sql"
    exec_file="$tmp_sql"
  fi

  log=$(mktemp)
  set +e
  pnpm exec wrangler "${WR_EXTRA[@]}" d1 execute line-crm "${FLAGS[@]}" --file="$exec_file" >"$log" 2>&1
  ec=$?
  set -e
  if [[ "$ec" -ne 0 ]]; then
    if [[ "${DB_APPLY_CONTINUE_ON_DUPLICATE:-}" == "1" ]] && grep -qiF 'duplicate column name' "$log"; then
      echo "!! $name: duplicate column (treating as already applied); continuing." >&2
      rm -f "$log"
      rm -f "$tmp_sql"
      continue
    fi
    cat "$log" >&2
    rm -f "$log"
    rm -f "$tmp_sql"
    exit "$ec"
  fi
  rm -f "$log"
  rm -f "$tmp_sql"
done

echo "== d1-apply-post-007: OK (consider pre-checks for 010 before first apply; see AGENTS.md) =="
