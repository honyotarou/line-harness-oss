#!/usr/bin/env bash
# Stop / completion gate: full `pnpm harness` (Biome + encapsulation + lib build + worker typecheck
# + LIFF typecheck + LIFF production build + all-package unit tests; ~18s).
#
# PostToolUse runs the reduced `pnpm harness:fast` during TDD; the Stop hook recovers the surface
# that fast-path skips (LIFF build + web/sdk/liff tests). E2E (Playwright) + API (Hurl) are still
# out of band — run `pnpm harness:full` manually or rely on CI.
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
