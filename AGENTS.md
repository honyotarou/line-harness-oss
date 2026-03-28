# LINE Harness OSS — エージェント向けポインタ

長文の仕様書は置かない。**コード・テスト・ADR** が真実。詳細な開発ハーネスは Cursor スキルに集約する。

## 必読（オンデマンド）

- **開発ハーネス（最優先）**: [`.cursor/skills/line-harness-harness/SKILL.md`](.cursor/skills/line-harness-harness/SKILL.md)
- **意思決定の履歴**: [`docs/adr/`](docs/adr/)

## よく使うコマンド（ルート）

| 目的 | コマンド |
|------|-----------|
| クイック検証（型 + ユニット） | `pnpm harness` |
| ユニット（CI と同系） | `pnpm test` |
| カバレッジ | `pnpm test:coverage` |
| Playwright（UI；API はモック） | `pnpm test:e2e` |
| **API 統合（実 Worker ローカル + [Hurl](https://hurl.dev)）** | `pnpm test:api` |
| D1 スキーマをローカルに流す（worker ディレクトリ基準） | `pnpm db:migrate:worker-local` |
| Worker 開発 | `pnpm dev:worker` |
| Web 開発 | `pnpm dev:web` |

初回クローン後、Git フックに Lefthook を入れる（任意だが推奨）:

```bash
pnpm exec lefthook install
```

`pre-commit` で `pnpm harness`（型 + ユニット）が走る。ローカル API 用の秘密情報は `apps/worker/.dev.vars.example` を `apps/worker/.dev.vars` にコピーして編集（`.dev.vars` はコミットしない）。

## パッケージ

- `apps/worker` — Cloudflare Workers + Hono + Vitest
- `apps/web` — Next.js + Vitest
- `packages/db`, `packages/shared`, `packages/line-sdk`

## 原則（1 行ずつ）

1. 品質は **型・テスト・CI** で強制する（プロンプトだけに頼らない）。
2. E2E と言う場合は **UI モック E2E と API 統合テスト** を混同しない（スキル参照）。
3. 同じミスが二度出たら **テストか ADR** を追加する。
