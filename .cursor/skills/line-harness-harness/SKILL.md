---
name: line-harness-harness
description: >-
  LINE Harness OSS の開発ハーネス。pnpm モノレポ（worker / web / packages）で
  決定論的検証（型・Vitest・Playwright）を優先し、計画と実装を分離、テストで完了を
  証明する。Harness Engineering（ハーネスがモデルより重要）の原則に従う。
  Use when working on line-harness-oss, LINE CRM, Cloudflare Worker, Next.js admin,
  LIFF routes, Playwright E2E, Vitest, or when the user mentions ハーネス / harness /
  開発ルール / CI / テスト戦略.
---

# LINE Harness OSS — 開発ハーネス

このリポジトリでは **モデルやプロンプトより、リポジトリ内の実行可能なハーネス**（型・テスト・CI・スキル本文）が品質の主担当である。考え方の背景は [Harness Engineering ベストプラクティス（逆瀬川ちゃん, 2026）](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/)（特に「ハーネスがモデルより重要」「決定論的ツール」「E2E の層分け」「テストはドキュメントより腐敗に強い」）に沿う。

## 1. 真実のソース（Single sources of truth）

| 種別 | 置く場所 | エージェントの扱い |
|------|-----------|-------------------|
| 振る舞いの仕様 | テスト（Vitest / Playwright） | 変更したら必ず該当テストを通す |
| 永続的な「なぜ」 | `docs/adr/` の ADR | 上書きせず Supersede で更新 |
| エージェント向け手順 | 本スキル + ルート `AGENTS.md` | 長文の独自設計書を増やさない |

リポジトリに「現状説明だけの」設計メモを増やすと腐敗し、エージェントが古い文を真実と誤認する。説明が必要なら **テストか ADR** に落とす。

## 2. 決定論的ゲート（LLM に任せない）

次を **変更の完了条件** とする。ユーザーが明示しなくても、タスク完了前に実行して結果を確認する。

1. **Worker 型検査**: `pnpm --filter worker typecheck`（`tsc --noEmit`）
2. **ユニットテスト**: ルートで `pnpm test`（worker → web → SDK）
3. **触ったパッケージにフォーカス**してよいが、マージ前はフル `pnpm test` を推奨
4. **カバレッジ閾値がある場合**: `pnpm test:coverage`（CI と同条件）
5. **管理画面の回帰**: `pnpm test:e2e`（Playwright；時間がかかる場合は変更ファイルに関連する spec に絞る）
6. **実 Worker の HTTP スモーク**: `pnpm test:api`（`wrangler dev --local` 起動後に [Hurl](https://hurl.dev) で `/openapi.json`・認可エラー等を検証。Playwright モック E2E とは別層）

**Lefthook**: コントリビュータは `pnpm exec lefthook install` で pre-commit に `pnpm harness` を入れられる（[evilmartians/lefthook](https://github.com/evilmartians/lefthook)）。

リント設定が無い現状では **TypeScript とテストが主リンター** である。新規にリンタを入れる場合は CI と同じコマンドを `scripts/harness-check.sh` に追記する。

### クイックゲート

```bash
./scripts/harness-check.sh
```

（ルート `package.json` の `pnpm harness` と同等）

## 3. E2E の層（名前と期待値を一致させる）

| 層 | 何を証明するか | このリポジトリでの実装 |
|----|----------------|------------------------|
| **UI E2E（API モック）** | Next の画面・ルーティング・クライアントが期待 JSON で動く | `tests/e2e/` + `mock-web-api.ts` |
| **API スモーク（実ローカル Worker）** | 本物の `fetch` ハンドラとミドルウェアが応答する | `pnpm test:api`（`tests/hurl/smoke.hurl`） |
| **API / ルート単体** | Worker のルート・分岐を高速に固定 | Vitest `apps/worker/tests/**` |
| **外部（LINE 等）** | 本物の IdP / Webhook | ステージング＋手動 or 契約テスト；ローカル E2E の既定対象外 |

**モック E2E を「システム全体 E2E」と呼ばない。** 説明・PR では「Playwright UI E2E（Worker は route モック）」と明示する。

LIFF・認証・紐付けは **ビジネスクリティカル** のため、Worker 側は `liff` ルートのテストを厚くし、UI モック E2E だけに頼らない。

## 4. ワークフロー（計画と実行の分離）

1. **計画**: 触るパッケージ、公開 API、失敗しうるテストを先に列挙する（大きい変更は Plan モード推奨）。
2. **実行**: 最小差分で実装する（無関係なリファクタ禁止 — ユーザールールに従う）。
3. **検証**: 上記決定論的ゲートを実行し、赤なら修正してから完了報告する。
4. **仕上げ**: 回帰を防ぐテストを 1 本以上足す（エージェントが壊しやすい箇所ほど優先）。

## 5. モノレポの地図（短いポインタ）

- `apps/worker` — Cloudflare Workers（Hono）。ルートは `src/routes/`。高リスク: `liff.ts`, `webhook.ts` 等
- `apps/web` — Next.js 管理画面。`src/app/`, `src/lib/api.ts`
- `packages/db`, `packages/shared`, `packages/line-sdk` — 共有コード
- `tests/e2e` — Playwright（`playwright.config.ts` はルート）
- `.github/workflows/ci.yml` — CI の正本

## 6. ハーネス強化のルール（MVH の回し方）

エージェントまたは人間が **同じ種類のミスを二度やったら**、次のいずれかを必ず足す:

- 失敗を再現する **Vitest / Playwright**
- **ADR**（トレードオフと「なぜそうしたか」）
- CI で走る **決定論的コマンド**（型・スクリプト）

推測で長い README を書いて代替しない。

## 7. 参照リンク

- [Harness Engineering ベストプラクティス（2026）](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/) — ハーネス全体像、E2E 層、Hooks・リンタの考え方
- リポジトリ: `AGENTS.md`, `docs/adr/`, `scripts/harness-check.sh`
