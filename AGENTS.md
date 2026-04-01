# LINE Harness OSS — エージェント向けポインタ

長文の仕様書は置かない。**コード・テスト・ADR** が真実。詳細な開発ハーネスは Cursor スキルに集約する。

## 必読（オンデマンド）

- **LINE 統合スキル（デザイン・壁打ち・TDD・ハーネス・デプロイ）**: [`.cursor/skills/line/SKILL.md`](.cursor/skills/line/SKILL.md)（**`/line`** — デザイン・要件は **親 0（ビジュアル・任意リッチ）** と **親 1（8 Round＋ブランド）** の2段；リッチ枝は [`steps-rich-menu-wallball.md`](.cursor/skills/line/steps-rich-menu-wallball.md)、ほか `steps-*.md`）
- **意思決定の履歴**: [`docs/adr/`](docs/adr/)（テスト層: [`0001`](docs/adr/0001-testing-and-harness-layers.md)、ハーネス方針: [`0002`](docs/adr/0002-harness-engineering.md)）

## よく使うコマンド（ルート）

| 目的 | コマンド |
|------|-----------|
| クイック検証（Biome + 型 + ユニット） | `pnpm harness` |
| コード整形（Biome） | `pnpm format`（`pnpm format:check` で検証のみ） |
| CI `unit` ジョブ相当（LIFF 型・`build:libs`・`next build`・カバレッジ + SDK） | `pnpm harness:ci` |
| 広い完了ゲート（harness + E2E + API 統合） | `pnpm harness:full` |
| ユニット（CI と同系） | `pnpm test` |
| カバレッジ | `pnpm test:coverage` |
| ベンチマーク（Worker の Vitest bench） | `pnpm test:bench` |
| Playwright（UI；API はモック） | `pnpm test:e2e` |
| **API 統合（実 Worker ローカル + [Hurl](https://hurl.dev)）** | `pnpm test:api` |
| D1 スキーマをローカルに流す（worker ディレクトリ基準） | `pnpm db:migrate:worker-local` |
| D1 010 適用前の重複チェック（local / remote） | `pnpm db:pre-010-check` / `pnpm db:pre-010-check:remote` |
| D1 `010_users_unique_contact` 適用（local） | `pnpm db:apply-010:local` |
| デプロイ先 Worker の HTTP スモーク + LIFF 手動メモ | `STAGING_WORKER_URL=… pnpm smoke:staging` |
| Worker 開発 | `pnpm dev:worker` |
| Web 開発 | `pnpm dev:web` |

初回クローン後、Git フックに Lefthook を入れる（任意だが推奨）:

```bash
pnpm exec lefthook install
```

`pre-commit` で `pnpm harness` と `pnpm format:check` が走る。ローカル API 用の秘密情報は `apps/worker/.dev.vars.example` を `apps/worker/.dev.vars` にコピーして編集（`.dev.vars` はコミットしない）。

**Claude Code** 利用時は [`.claude/settings.json`](.claude/settings.json) で **PreToolUse** が CI・`biome.json`・ハーネス正本などの編集をブロックし、**PostToolUse** で Biome 自動 format → `pnpm harness`、**Stop** で harness。記事: [Harness Engineering ベストプラクティス（2026）](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/)。

## 本番リリース前チェック（顧客向けに黙って出す前）

**自動で一通り通す（CI かローカル）**

- **一括**: `pnpm harness:full`（`harness` + E2E + API 統合；Hurl・Playwright 必須）
- **分割**: `pnpm harness` → `pnpm test:e2e` → `pnpm test:api`（[Hurl](https://hurl.dev/docs/installation.html)）
- **CI の unit ジョブに寄せる**: `pnpm harness:ci`（カバレッジ + SDK）

**D1 / `010_users_unique_contact`**

- `packages/db/schema.sql` には部分 UNIQUE（`email` / `phone` / `external_id`）が含まれる。**空の DB にフルスキーマを流す**だけなら追加作業は不要。
- **既存データがある D1**では、まず `pnpm db:pre-010-check`（ローカル）または `pnpm db:pre-010-check:remote`（本番相当）。**重複が 1 件でもあると exit 1**（`jq` 推奨）。運用方針に沿ってマージ・NULL 化などで整えたあと、ローカル検証なら `pnpm db:apply-010:local`。リモートは `CONFIRM=YES bash scripts/d1-apply-010.sh remote`（`wrangler.toml` の `database_name` が `line-crm` 前提）。
- ルートの `pnpm db:migrate` は **リモートに `schema.sql` 全体**を流す。既存データとの兼ね合いは必ず確認すること。

**Worker シークレット（LIFF まわり）**

- `LIFF_STATE_SECRET`（未設定時は `API_KEY` で署名）を本番で分けたい場合は明示的に設定する。
- `WEB_URL` / `WORKER_URL` / `ALLOWED_ORIGINS` / `LIFF_URL` が、実際のクライアント・リダイレクト先と一致していること。
- デプロイ後、**古い未署名 OAuth `state` の QR・ブックマーク**は無効になる。顧客には新フローで再発行が必要な場合がある。

**LIFF の手動スモーク（ステージング推奨）**

- 先に `STAGING_WORKER_URL=https://… pnpm smoke:staging` で **openapi / docs** の HTTP を確認（自動）。
- 続いて LINE クライアント側で:
  1. 公式 LIFF から予約・エントリー等の導線を開き、**LINE ログイン**が完了する。
  2. ログイン後の遷移先が **意図したドメイン**のみである（任意 URL への飛び先がない）。
  3. ログイン済みで **プロフィール／紐付け**が表示・更新できる（`POST /api/liff/profile` は **ID トークン付き**。古い LIFF キャッシュに注意）。
  4. 別アカウントで **既存 UUID の乗っ取り**ができないこと。

## パッケージ

- `apps/worker` — Cloudflare Workers + Hono + Vitest
- `apps/web` — Next.js + Vitest
- `packages/db`, `packages/shared`, `packages/line-sdk`

## 原則（1 行ずつ）

1. 品質は **型・テスト・CI** で強制する（プロンプトだけに頼らない）。
2. E2E と言う場合は **UI モック E2E と API 統合テスト** を混同しない（スキル参照）。
3. 同じミスが二度出たら **テストか ADR** を追加する。
