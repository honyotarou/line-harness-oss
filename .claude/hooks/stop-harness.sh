#!/usr/bin/env bash
# Stop / completion gate: same fast checks as pre-commit (not full E2E — avoids multi-minute every stop).
# Run pnpm harness:full manually or in CI for Playwright + Hurl.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

set +e
out="$(pnpm harness 2>&1)"
code=$?
set -e

if [ "$code" -ne 0 ]; then
  jq -n \
    --arg msg "Completion gate: pnpm harness failed. Do not declare done until green.

${out}

For CI parity: pnpm harness:ci. For E2E + API: pnpm harness:full." \
    '{hookSpecificOutput:{hookEventName:"Stop",additionalContext:$msg}}'
fi
exit 0
