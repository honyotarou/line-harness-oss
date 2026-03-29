#!/usr/bin/env bash
# PostToolUse: auto-format the edited file (Biome). Keeps feedback fast vs full-repo format.
set -euo pipefail

input="$(cat)"
file="$(jq -r '.tool_input.file_path // .tool_input.path // empty' <<< "$input")"
[ -n "$file" ] || exit 0

case "$file" in
  *.ts | *.tsx | *.js | *.jsx | *.json) ;;
  *) exit 0 ;;
esac
case "$file" in
  */apps/* | */packages/* | */tests/* | */scripts/*) ;;
  *) exit 0 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

pnpm exec biome format --write "$file" 2>/dev/null || true
exit 0
