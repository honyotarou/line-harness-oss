# ADR 0001: Testing layers and agent harness

- Status: Accepted
- Date: 2026-03-28

## Context

The repo ships a Cloudflare Worker (API + LIFF), a Next.js admin app, and shared packages. Coding agents need a clear, machine-checkable definition of "done" and honest naming of test types.

## Decision

1. **Deterministic gates** for routine changes: worker `tsc --noEmit`, **LIFF** `tsc --noEmit` (`pnpm --filter liff typecheck`), and `pnpm test` (see `scripts/harness-check.sh` / `pnpm harness`). **Next.js admin** の本番相当検証は `pnpm harness:ci` と CI `unit` ジョブで **`pnpm build:libs` の後に `next build`（web）** を実行する。
2. **Playwright tests** under `tests/e2e/` validate the admin UI against **mocked** Worker HTTP (`mock-web-api.ts`). They are **UI E2E with a fake API**, not full-stack production E2E.
3. **Worker route correctness** (especially LIFF / webhooks) is primarily enforced by **Vitest** in `apps/worker/tests/`.
4. **Hurl smoke tests** (`pnpm test:api`, `tests/hurl/*.hurl`) run against **`wrangler dev --local`** to assert real HTTP behavior (OpenAPI doc, auth middleware, public HTML). This complements Vitest and is **not** a substitute for staging tests with production-like secrets.
5. **Lefthook** (`lefthook.yml`) may run `pnpm harness` on pre-commit for faster local feedback; CI remains the merge gate.
6. Agent-facing **harness + TDD + deploy workflow** lives in `.cursor/skills/line/SKILL.md` (and `steps-harness.md` / `steps-deploy.md` / TDD steps), with short pointers in `AGENTS.md`, not duplicated prose specs.
7. Broader **Harness Engineering** policy (CI 同等コマンド、広い完了ゲート、Claude Code Hooks) は [ADR 0002](0002-harness-engineering.md) に委ねる。

## Consequences

- CI and `pnpm harness` stay fast and stable; the **`api-integration` job** adds a slower but shallow real-HTTP check (Hurl + local D1).
- Contributors must not claim "E2E covers the API" when only Playwright mocks are used; cite **Vitest**, **Hurl**, or **staging** explicitly.
- `apps/worker/.dev.vars` is gitignored; local and CI use `.dev.vars.example` as the non-secret template.
- Stripe webhooks require `STRIPE_WEBHOOK_SECRET`; unsigned JSON ingestion was removed for security (see `stripe` route tests).
- Public form endpoints are **method-scoped** in `authMiddleware`: only `GET /api/forms/:id` and `POST /api/forms/:id/submit` bypass admin auth; mutating methods require a session.
- LINE Login OAuth `state` is **HMAC-signed** with `LIFF_STATE_SECRET`, or with `API_KEY` only when **`ALLOW_LIFF_OAUTH_API_KEY_FALLBACK`** is enabled (local dev); post-login redirects are **allowlist-only** (`WEB_URL`, `WORKER_URL`, `ALLOWED_ORIGINS`, `LIFF_URL`, and official `line.me` hosts). `POST /api/liff/profile` requires a verified ID token whose `sub` matches `lineUserId`.
- **Biome** (`biome.json`) は formatter のみ；`pnpm harness` と CI で `biome format .` を実行。設定・ワークフロー・ハーネス正本のエージェント編集は Claude **PreToolUse** でブロック（[ADR 0002](0002-harness-engineering.md)）。
- D1 `users` uses **partial unique indexes** on non-null `email`, `phone`, and `external_id` (migration `010_users_unique_contact.sql`).
