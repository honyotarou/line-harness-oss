#!/usr/bin/env bash
# PostToolUse: after TS/TSX (or migration / schema.sql) edits, run the deterministic gate.
#
# Routing:
# - TS/TSX edits under apps|packages|tests → `pnpm harness:fast`
#   (Biome + encapsulation incl. F1/F4/F5 regression guards + Rule D + worker typecheck + worker tests, ~5s).
#   LIFF build / all-package tests are deferred to the Stop hook (full `pnpm harness`) and CI.
# - `packages/db/migrations/*.sql` or `packages/db/schema.sql` → full `pnpm harness`
#   (Rule D drift is the whole point of editing these, exercise it with lib builds too).
# - Everything else → exit 0 (nothing to do).
#
# On failure, emit Claude docs-shaped JSON (additionalContext) per Harness Engineering article.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

input="$(cat)"
file="$(jq -r '.tool_input.file_path // .tool_input.path // empty' <<< "$input")"

# Decide which gate to run based on the edited file.
target=""
case "$file" in
  packages/db/migrations/*.sql|packages/db/schema.sql)
    target="pnpm harness"
    ;;
  *.ts|*.tsx)
    case "$file" in
      apps/*|packages/*|tests/*) target="pnpm harness:fast" ;;
      *) exit 0 ;;
    esac
    ;;
  *) exit 0 ;;
esac

set +e
out="$(${target} 2>&1)"
code=$?
set -e

if [ "$code" -ne 0 ]; then
  jq -n \
    --arg msg "${target} failed. Fix before continuing. Run \`pnpm harness\` for the full suite (LIFF build + all-package tests) if the fast path did not cover the regression.

${out}" \
    '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$msg}}'
fi
exit 0
