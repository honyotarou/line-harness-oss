#!/usr/bin/env bash
# PostToolUse: after TS/TSX edits under apps|packages|tests, run fast deterministic gate.
# On failure, emit Claude docs-shaped JSON (additionalContext) per Harness Engineering article.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

input="$(cat)"
file="$(jq -r '.tool_input.file_path // .tool_input.path // empty' <<< "$input")"

case "$file" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac
case "$file" in
  apps/*|packages/*|tests/*) ;;
  *) exit 0 ;;
esac

set +e
out="$(pnpm harness 2>&1)"
code=$?
set -e

if [ "$code" -ne 0 ]; then
  jq -n \
    --arg msg "pnpm harness failed (typecheck + unit tests). Fix before continuing.

${out}" \
    '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$msg}}'
fi
exit 0
