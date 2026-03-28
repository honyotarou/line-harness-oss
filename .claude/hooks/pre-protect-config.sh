#!/usr/bin/env bash
# PreToolUse: block edits to harness / CI / formatter config so agents fix code, not gates.
# Claude Code: exit 2 blocks the tool; stderr is shown to the agent.
# See ADR 0002 and https://nyosegawa.com/posts/harness-engineering-best-practices-2026/
set -euo pipefail

input="$(cat)"
file="$(jq -r '.tool_input.file_path // .tool_input.path // empty' <<< "$input")"
[ -n "$file" ] || exit 0

blocked() {
  echo "BLOCKED: このファイルは保護されています（リンター/CI/ハーネス改竄でテストを通そうとしないでください）。コード側を直してください: $file" >&2
  echo "BLOCKED (en): Protected config/harness path — fix application code, not this file: $file" >&2
  exit 2
}

case "$file" in
  */lefthook.yml | lefthook.yml) blocked ;;
  */biome.json | biome.json) blocked ;;
  */tsconfig.base.json | tsconfig.base.json) blocked ;;
  */packages/tsconfig.base.json | packages/tsconfig.base.json) blocked ;;
  */playwright.config.ts | playwright.config.ts) blocked ;;
  */.github/workflows/*) blocked ;;
  */scripts/harness-check.sh | scripts/harness-check.sh) blocked ;;
  */scripts/harness-ci-parity.sh | scripts/harness-ci-parity.sh) blocked ;;
  */scripts/harness-full.sh | scripts/harness-full.sh) blocked ;;
  */scripts/api-integration.sh | scripts/api-integration.sh) blocked ;;
  */.claude/settings.json | .claude/settings.json) blocked ;;
  */.claude/hooks/pre-protect-config.sh | .claude/hooks/pre-protect-config.sh) blocked ;;
  */.claude/hooks/post-ts-harness.sh | .claude/hooks/post-ts-harness.sh) blocked ;;
  */.claude/hooks/stop-harness.sh | .claude/hooks/stop-harness.sh) blocked ;;
esac

exit 0
