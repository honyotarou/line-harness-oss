#!/usr/bin/env bash
# Automated slice of staging verification + LIFF manual reminder.
# Usage: STAGING_WORKER_URL=https://your-worker.workers.dev bash scripts/liff-staging-smoke.sh
set -euo pipefail

BASE="${STAGING_WORKER_URL:?Set STAGING_WORKER_URL to your deployed Worker origin (no trailing slash)}"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "== liff-staging-smoke: HTTP checks against $BASE =="

code="$(curl -sfS -o "$TMP" -w "%{http_code}" "$BASE/openapi.json")"
if [ "$code" != "200" ]; then
  echo "openapi.json expected 200, got $code" >&2
  exit 1
fi

if command -v jq >/dev/null 2>&1; then
  jq -r '.info.title' "$TMP"
fi

code="$(curl -sfS -o /dev/null -w "%{http_code}" "$BASE/docs")"
if [ "$code" != "200" ]; then
  echo "/docs expected 200, got $code" >&2
  exit 1
fi

echo "== liff-staging-smoke: HTTP OK =="
echo ""
echo "Manual (LINE app / LIFF):"
echo "  1. Open the staging LIFF URL from the LINE client (same channel as staging bot)."
echo "  2. Complete LINE Login; confirm redirect stays on allowed domains only."
echo "  3. Confirm booking/profile flows call POST /api/liff/profile with idToken + lineUserId."
echo "  4. Confirm another LINE account cannot hijack an arbitrary existingUuid / state uid."
echo ""
