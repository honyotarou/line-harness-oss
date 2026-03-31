---
name: line
description: >-
  LINE Harness OSS の全工程を GAS スキル型の番号メニューで実行する統合スキル。
  Pinterest ムードボード→デザイントークン→壁打ち→開発ハーネス（Step 2）→TDD→デプロイまで。
  Use when the user says /line, /tdd, Pinterest, ムードボード, デザイン, 壁打ち, ヒアリング,
  LINE Harness OSS, line-harness-oss, LINE CRM, Cloudflare Worker, LIFF, harness, deploy, TDD.
---

# LINE Harness OSS ワークフロー（`/line`）

**GAS スキルと同型**: 番号で工程を選ぶ。引数なしならメニュー表示。詳細は **参照ファイルを Read** すること。

```
LINE Harness OSS:

  【デザイン・要件（GAS 型・UI/新機能で先にやる）】
  0  ムードボード         Pinterest 等の画像 → design-tokens（docs/design）
  1  壁打ち・設計ヒアリング  8 Round で「何をしたいか」→ 設計サマリ（コードは OK まで出さない）
  1.5 独自性・ブランド一貫性  デフォルト保持しつつ独自性を出す（LP/LIFF/管理画面/リッチメニュー）

  【ハーネス（0・1 の直後に読む・実行する）】
  2  開発ハーネス        決定論ゲート・E2E層・Hooks・コマンド表（詳細: steps-harness.md）

  【TDD・機能追加】
  3  観点・受け入れ条件   Given/When/Then + 置き場所（テストはまだ書かない）
  4  Red                 失敗するテストのみ（Vitest / Playwright）
  5  Green               最小実装で緑
  6  Refactor            テストは緑のまま整理
  7  層別ゲート          typecheck + パッケージ test → pnpm harness
  8  UI 回帰 E2E         Playwright（API はモック）
  9  API 統合            pnpm test:api（実 Worker + Hurl）
  10 カバレッジ          test:coverage / ホットスポット
  11 仕上げ              ADR・D1・セキュリティ境界

  【セットアップ・デプロイ】
  12 本番まで通す       D1→Worker→LINE→LIFF→Vercel（詳細: steps-deploy.md）

  【広い完了】
  check  品質ゲート      pnpm harness → test:e2e → test:api（リリース相当）

番号またはやりたいことを指示してください。
```

## 参照ファイル（各ステップの詳細）

| ファイル | 内容 |
|----------|------|
| [steps-design-0-1.md](steps-design-0-1.md) | Step **0〜1**（Pinterest・トークン・8 Round 壁打ち） |
| [steps-brand-1-5.md](steps-brand-1-5.md) | Step **1.5**（デフォルト保持＋独自性の一貫設計 壁打ち） |
| [steps-harness.md](steps-harness.md) | Step **2**（開発ハーネス） |
| [steps-0-3-red-green-refactor.md](steps-0-3-red-green-refactor.md) | Step **3〜6**（観点 → Red → Green → Refactor） |
| [steps-4-8-gates.md](steps-4-8-gates.md) | Step **7〜11** + `check` |
| [steps-deploy.md](steps-deploy.md) | Step **12**（デプロイ手順内の 0〜9 と番号がぶつかるので **steps-deploy だけ読む**） |

**ポインタ**: ルート **`AGENTS.md`**、`docs/wiki/Getting-Started.md`、`docs/adr/`。

## アーキテクチャ（テストの置き場所）

```
apps/worker/tests/           ← Worker（Vitest）
apps/web/src/**/*.test.ts    ← Web（Vitest）
packages/sdk/tests/          ← SDK（Vitest）
tests/e2e/                   ← Playwright（Worker API はモック）
tests/hurl/*.hurl            ← 実 Worker（pnpm test:api）
apps/liff/src/               ← LIFF（typecheck）
docs/design/                 ← Step 0 の design-tokens.json 等（任意で追加）
packages/db/                 ← スキーマ
```

## 必須ルール（全ステップ共通）

### デザイン（Step 0〜1）

- **画像はチャット貼り付け**を主とする（リポに巨大バイナリを増やさない）。OK 後に **`docs/design/design-tokens.json`** など**テキスト成果物**だけコミットしてよい。
- Step 1 では **設計サマリに OK が出るまで本番実装を書かない**（GAS と同型）。
- トークンは **`apps/web`** の Tailwind v4（`globals.css` / `@theme`）と **`apps/liff`** の CSS 変数に**一貫して**反映する。

### セキュリティ・秘密情報

- シークレットは **`wrangler secret` / Vercel Env / `.dev.vars`**。リポ・チャットに貼らない。
- `WEB_URL` / `ALLOWED_ORIGINS` / `LIFF_URL` は実際の origin と一致させる。

### TDD（Step 3〜6）

- **Red が無い Green は禁止**。
- 1 ストーリーあたりまず **1 本の失敗テスト**から。
- 無関係なリファクタはユーザー明示がない限りしない。

### このリポジトリ固有

- **Playwright** は UI + **モック API**。実 Worker は **Vitest + `pnpm test:api`**。
- **`liff` / `webhook` / `forms` / 認可** は Vitest を厚く。
- 外部 LINE `fetch` はスタブし、契約をテストに固定。

### 完了の定義

- コード変更後は **`pnpm harness`**（広い変更は **`harness:full`** や **check**）。
- **Step 12** 完了報告にはデプロイ手順の「動作確認」の証拠を含める。

### Step 2（ハーネス）・Step 12（デプロイ）

- **Step 2**: `steps-harness.md` を Read し、触る作業に応じて `pnpm harness` / `harness:ci` / `harness:full` のどれを完了条件にするか決める。Hooks が無い環境では **`pnpm harness` を明示実行**。
- **Step 12**: 保護パスは編集ブロックされうる → 人間向けに文章化。

### UI 微調整

- `pnpm dev:web` / `pnpm --filter liff dev`；仕上げ **`pnpm harness`**、ルーティング変更時 **`pnpm test:e2e`**。

## ルール（GAS スキルと同型）

- **新規 UI・ブランド寄せ**: **0 → 1 → 2**（ハーネスでゲートを把握）→ **3**（観点）。バグ修正・API のみなら **2**（必要なら）→ **3** からでよい。
- **TDD 直列**: 3→4→5→6 を基本。7 を通してから 8/9 を必要に応じて。11 または **check** でリリース相当。
- **Step 12**: 前段が無いなら先行手順を案内。
- **Cursor / Composer** で全工程（デプロイはターミナル主導）。

## 参照リンク

- [Harness Engineering（2026）](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/)
- [ADR 0001](../../../docs/adr/0001-testing-and-harness-layers.md) / [ADR 0002](../../../docs/adr/0002-harness-engineering.md)
