# LINE Harness — 開発ハーネス詳細

親メニューは [SKILL.md](SKILL.md) の **Step 2**（**0・1 の直後**）。このファイルは決定論ゲート・E2E 層・Hooks の正本。

このリポジトリでは **モデルやプロンプトより、リポジトリ内の実行可能なハーネス**（型・テスト・CI・スキル本文）が品質の主担当である。考え方の背景は [Harness Engineering ベストプラクティス（逆瀬川ちゃん, 2026）](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/)（[「ハーネスがモデルより重要」](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/#%E3%83%8F%E3%83%BC%E3%83%8D%E3%82%B9%E3%81%8C%E3%83%A2%E3%83%87%E3%83%AB%E3%82%88%E3%82%8A%E9%87%8D%E8%A6%81) ほか）に沿う。リポジトリへの落とし込みは [ADR 0002](../../../docs/adr/0002-harness-engineering.md)。

## 記事の論点 → このリポの実装

| 記事の原則 | このリポジトリでの実装 |
|------------|-------------------------|
| [ハーネスがモデルより重要](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/#%E3%83%8F%E3%83%BC%E3%83%8D%E3%82%B9%E3%81%8C%E3%83%A2%E3%83%87%E3%83%AB%E3%82%88%E3%82%8A%E9%87%8D%E8%A6%81) | 完了条件は `pnpm harness` 系と CI；プロンプトだけに頼らない |
| リンターの仕事を LLM にさせない | 型（Worker + **LIFF `tsc`**）+ Vitest + **Biome format**；Web 本番は **`harness:ci` / CI で `next build`** |
| フィードバックは速い層へ | `pnpm harness`（Lefthook / PostToolUse）が最速；E2E・API は `harness:full` や CI |
| PostToolUse / Stop の品質ループ | `.claude/settings.json` + `.claude/hooks/*`（Claude Code 利用者向け） |
| E2E の層分け（API は Hurl 等） | Playwright = UI+モック；`pnpm test:api` = 実 Worker + [Hurl](https://hurl.dev) |
| AGENTS はポインタ | ルート `AGENTS.md` は表とリンクのみ；詳細は本スキル・ADR |
| MVH（最小実行可能ハーネス） | Week1: `pnpm harness` + Lefthook；拡張: `harness:ci` / `harness:full` |

## 1. 真実のソース（Single sources of truth）

| 種別 | 置く場所 | エージェントの扱い |
|------|-----------|-------------------|
| 振る舞いの仕様 | テスト（Vitest / Playwright） | 変更したら必ず該当テストを通す |
| 永続的な「なぜ」 | `docs/adr/` の ADR | 上書きせず Supersede で更新 |
| エージェント向け手順 | `line/SKILL.md` + ルート `AGENTS.md` | 長文の独自設計書を増やさない |

## 2. 決定論的ゲート（LLM に任せない）

完了前に実行して結果を確認する。

0. **カプセル化（レイヤー）**: `pnpm check:encapsulation`（`pnpm harness` に含まれる）  
   - Worker: `application/*.ts` は `hono` / `routes/` を import しない；`routes/*.ts` に LINE の `api.line.me` / `access.line.me` を直書きしない；**`routes/*.ts` 全ファイル**に `ROUTE_LINE_CAPS` の行数上限（新規ルートはマップ追記必須）。  
   - Web: `api/catalog/*`（`index.ts` 除く）は `@line-crm/shared` と `../client.js` 以外を import しない；`client.ts` は `catalog` を import しない。  
   - 正本: `scripts/check-encapsulation.mjs`（上限はリファクタで下げる／肥大時は `application/` へ寄せてから調整）。

1. **Worker 型検査**: `pnpm --filter worker typecheck`
2. **LIFF 型検査**: `pnpm --filter liff typecheck`（`pnpm harness` に含まれる）
3. **ユニットテスト**: ルートで `pnpm test`（worker → web → SDK）
4. マージ前はフル `pnpm test` を推奨
5. **カバレッジ**: `pnpm test:coverage`（CI と同条件）
6. **管理画面の本番ビルド**: `pnpm harness:ci` または `build:libs` 後 `pnpm --filter web build`
7. **管理画面の回帰**: `pnpm test:e2e`
8. **実 Worker の HTTP スモーク**: `pnpm test:api`（[Hurl](https://hurl.dev)）

**Lefthook**: `pnpm exec lefthook install` で pre-commit に `pnpm harness`（[evilmartians/lefthook](https://github.com/evilmartians/lefthook)）。

**Biome** は formatter のみ（`biome.json`）。リント ON にする場合は人間の PR で CI / `harness-check.sh` を合わせて更新する。

### クイックゲート（速度順）

| コマンド | 内容 |
|----------|------|
| `pnpm check:encapsulation` | Worker/Web のレイヤー違反・薄いルートの行数のみ（単体でも可） |
| `pnpm harness` | Biome + **カプセル化** + Worker 型 + LIFF 型 + LIFF build + 全ユニット |
| `pnpm harness:ci` | Biome + LIFF 型 + `build:libs` + `next build`（web）+ カバレッジ + SDK |
| `pnpm harness:full` | harness + Playwright + Hurl |

```bash
./scripts/harness-check.sh   # = pnpm harness
```

### PreToolUse（設定改竄の防止）

Claude Code: `.claude/hooks/pre-protect-config.sh` が `lefthook.yml` / `biome.json` / `tsconfig.base.json` / `playwright.config.ts` / `.github/workflows/*` / ハーネス＆ API 統合シェル / `.claude/settings.json` / Claude hook 3 本の **Write|Edit|MultiEdit** を **exit 2** でブロックする。変更は人間の PR で行う。

## 3. E2E の層（名前と期待値を一致させる）

| 層 | 何を証明するか | 実装 |
|----|----------------|------|
| **UI E2E（API モック）** | Next の画面・ルーティング | `tests/e2e/` + `mock-web-api.ts` |
| **API スモーク（実ローカル Worker）** | 本物の fetch ハンドラ | `pnpm test:api` |
| **API / ルート単体** | Worker のルート・分岐 | Vitest `apps/worker/tests/**` |
| **外部（LINE 等）** | 本物の IdP / Webhook | ステージング＋手動 |

**モック E2E を「システム全体 E2E」と呼ばない。**

## 4. ワークフロー（計画と実行の分離）

1. **計画**: 触るパッケージ、失敗しうるテストを先に列挙する。
2. **実行**: 最小差分で実装する。
3. **検証**: 決定論的ゲートを実行する。
4. **仕上げ**: 回帰を防ぐテストを足す。

## 4.1 定期観測（スケジュール CI）の設計テンプレ

「日々の開発ゲート（PR/Push の CI）」とは別に、**週次/月次で回す“定点観測”**を置く場合のテンプレ。

### 原則（DMM 記事の要点）

- **対象を絞る**: 全量を回すとコストと不安定さで継続できない。ホットスポット・重要領域に限定する。
- **バッチ分割**: 1回の実行で扱う単位を小さくし、最後に集計する（失敗時のリカバリも楽）。
- **並列数を制限**: max-parallel を小さく（速さより安定）。
- **決定性を優先**: 定点観測は “毎回同じ条件” が命（temperature=0 等、揺れを最小化）。
- **リトライ前提**: 生成/分析系は落ちる前提で 1〜2 回の自動リトライを用意する。
- **出力を分ける**: サマリ（通知）と詳細（HTML 等）を分け、比較しやすくする。

### 雛形（このリポでの置き方）

- **CI（PR/Push）**: `.github/workflows/ci.yml` を正本として **速く・確実に**落とす（`harness:ci` 相当）。
- **定期観測（schedule）**: 追加するなら別 workflow にし、以下を入れる:
  - **対象パス**（例: `apps/worker/src/routes`, `apps/web/src/app` など）
  - **バッチ分割**（例: 100 ファイル単位）
  - **max-parallel: 5（またはそれ以下）**
  - **失敗時リトライ**
  - **集計 → レポート生成 → 公開（GitHub Pages 等）**
  - **通知（Slack 等）**

※ このリポは「ハーネス（型・テスト・CI）」が真実なので、定期観測は **“補助線”**として扱う（PR のマージ可否は `ci.yml` と `pnpm harness` が決める）。

## 5. モノレポの地図

- `apps/worker` — Cloudflare Workers（Hono）
  - **`src/routes/`** — HTTP ルート（薄く保つ）
  - **`src/application/`** — ユースケース（LIFF OAuth、Webhook 処理、OpenAPI 本文、Calendar 等）。**高リスクロジックはここ＋対応テスト**
  - 参照例: `liff-oauth-*.ts`, `liff-json-handlers.ts`, `line-webhook-handlers.ts`, `openapi-spec.ts`, `calendar-integration.ts`
- `apps/web` — Next.js 管理画面。API クライアントは **`src/lib/api/client.ts`** + **`src/lib/api/catalog/*.ts`**（従来どおり `@/lib/api` で import）
- `apps/liff` — Vite + LIFF。`build` は **`@line-crm/shared` を先に build**（`pnpm harness` 内の liff build も同様）。API 基底は `src/config/liff-api-origin.ts` / `api-base.ts`
- `packages/db`, `packages/shared`（**サブパス export** で tree-shaking / Next CSP 対策）、`packages/line-sdk`
- `tests/e2e` — Playwright
- `.github/workflows/ci.yml` — CI の正本（LIFF 前に `build:libs` 等、ワークフローを正本とする）

## 6. ハーネス強化（MVH）

同じミスを二度やったら **Vitest / Playwright / ADR / CI コマンド** のいずれかを足す。長い README で代替しない。

## 7. 参照リンク

- [Harness Engineering（2026）](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/)
- [ADR 0002](../../../docs/adr/0002-harness-engineering.md)
- `AGENTS.md`, `scripts/harness-check.sh`, `scripts/harness-ci-parity.sh`, `scripts/harness-full.sh`, `.claude/`
