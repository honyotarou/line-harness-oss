#!/usr/bin/env bash
# Use wrangler.local.toml when present (gitignored) so real D1 database_id stays off git.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
EXTRA=()
if [[ -f wrangler.local.toml ]]; then
  EXTRA=(-c wrangler.local.toml)
fi
exec wrangler "${EXTRA[@]}" "$@"
