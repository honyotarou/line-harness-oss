#!/usr/bin/env bash
# Mirror this repo's canonical skills + slash commands to the three other skill roots so they
# work identically across:
#
#   - Cursor  local  (this repo's `.cursor/skills/` + `.cursor/commands/`)   ← canonical
#   - Cursor  global (`~/.cursor/skills/` + `~/.cursor/commands/`)
#   - Claude  local  (this repo's `.claude/skills/`)
#   - Claude  global (`~/.claude/skills/`)
#
# Run whenever any of gas / line / shuusei (skill or command file) changes in the repo.
# Idempotent.
#
# Design notes:
# - Claude Code matches `/skill-name` to the skill directory basename — no command file needed.
#   Cursor, in contrast, requires `.cursor/commands/<name>.md` to surface `/<name>` as a slash
#   command; commands are therefore mirrored to the two Cursor roots only.
# - Sibling cross-links (e.g. `../shuusei/SKILL.md` from gas/line) require shuusei to sit at the
#   same depth as gas/line. All three are always mirrored together.
# - Uses rsync --delete on skill dirs so removed files in canonical also disappear at mirrors.
# - pentest-tdd-loop / domain-extractor are left alone (not in this scope).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CANONICAL_SKILLS="$REPO_ROOT/.cursor/skills"
CANONICAL_COMMANDS="$REPO_ROOT/.cursor/commands"

NAMES=(gas line shuusei)
SKILL_TARGETS=(
  "$HOME/.cursor/skills"
  "$HOME/.claude/skills"
  "$REPO_ROOT/.claude/skills"
)
COMMAND_TARGETS=(
  "$HOME/.cursor/commands"
)

# ── Skills (4 locations: canonical + 3 mirrors) ────────────────────────────
for target_root in "${SKILL_TARGETS[@]}"; do
  mkdir -p "$target_root"
  for name in "${NAMES[@]}"; do
    src="$CANONICAL_SKILLS/$name/"
    dest="$target_root/$name/"
    if [ ! -d "$src" ]; then
      echo "skip skill (missing canonical): $src" >&2
      continue
    fi
    mkdir -p "$dest"
    rsync -a --delete "$src" "$dest"
    echo "synced skill: $dest"
  done
done

# ── Slash commands (Cursor only; Claude auto-matches on skill name) ────────
for target_root in "${COMMAND_TARGETS[@]}"; do
  mkdir -p "$target_root"
  for name in "${NAMES[@]}"; do
    src="$CANONICAL_COMMANDS/$name.md"
    dest="$target_root/$name.md"
    if [ ! -f "$src" ]; then
      echo "skip command (missing canonical): $src" >&2
      continue
    fi
    cp "$src" "$dest"
    echo "synced command: $dest"
  done
done

echo ""
echo "Mirrored $(IFS=,; echo "${NAMES[*]}") — skills → ${#SKILL_TARGETS[@]} locations, commands → ${#COMMAND_TARGETS[@]} Cursor locations."
echo "Canonical skills:   $CANONICAL_SKILLS"
echo "Canonical commands: $CANONICAL_COMMANDS"
