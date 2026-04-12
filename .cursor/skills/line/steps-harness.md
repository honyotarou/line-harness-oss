# LINE Harness — 開発ハーネス詳細

親メニューは [SKILL.md](SKILL.md) の **Step 2**（**0・1 の直後**）。このファイルは決定論ゲート・E2E 層・Hooks の正本。

このリポジトリでは **モデルやプロンプトより、リポジトリ内の実行可能なハーネス**（型・テスト・CI・スキル本文）が品質の主担当である。考え方の背景は [Harness Engineering ベストプラクティス（逆瀬川ちゃん, 2026）](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/)（[「ハーネスがモデルより重要」](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/#%E3%83%8F%E3%83%BC%E3%83%8D%E3%82%B9%E3%81%8C%E3%83%A2%E3%83%87%E3%83%AB%E3%82%88%E3%82%8A%E9%87%8D%E8%A6%81) ほか）に沿う。リポジトリへの落とし込みは [ADR 0002](../../../docs/adr/0002-harness-engineering.md)。

## 記事の論点 → このリポの実装

出典: [Harness Engineering ベストプラクティス（逆瀬川ちゃん, 2026）](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/)（目次の §1〜§7・MVH・アンチパターン）。

| 記事の原則（章のイメージ） | このリポジトリでの実装 |
|----------------------------|-------------------------|
| [ハーネスがモデルより重要](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/#%E3%83%8F%E3%83%BC%E3%83%8D%E3%82%B9%E3%81%8C%E3%83%A2%E3%83%87%E3%83%AB%E3%82%88%E3%82%8A%E9%87%8D%E8%A6%81)（§7） | 完了条件は `pnpm harness` 系と CI；プロンプトだけに頼らない |
| **§1 リポジトリ衛生**（腐敗しやすい「現状説明」長文を置かない） | 仕様の正本は **テスト + ADR**；`SKILL.md` は索引・共通ルールに抑え、長い独自設計書を増やさない（[ADR 0001](../../../docs/adr/0001-testing-and-harness-layers.md) と整合） |
| **§1 テストはドキュメントより腐敗に強い** | 期待動作は Vitest / Playwright / Hurl で表現；同じミスが二度出たら **テストか ADR**（[ADR 0002](../../../docs/adr/0002-harness-engineering.md)） |
| リンターの仕事を LLM にさせない（§2） | 型（Worker + **LIFF `tsc`**）+ Vitest + **Biome format**；Web 本番は **`harness:ci` / CI で `next build`** |
| **§2 アーキテクチャをガードレールに** | `scripts/check-encapsulation.mjs`（レイヤー・薄いルート）；**PR CI** は Biome 直後に実行してビルド前に強制 |
| フィードバックは速い層へ（§2・まとめ） | **PostToolUse**（ms 級）→ **Lefthook**（秒）→ **`pnpm harness` / CI**（分）の順で寄せる |
| PostToolUse / Stop の品質ループ（§2） | `.claude/settings.json` + `.claude/hooks/*`（Claude Code 利用者向け） |
| **§4 計画と実行の分離** | 下記「§4 ワークフロー」；TDD の観点は [steps-0-3-red-green-refactor.md](steps-0-3-red-green-refactor.md) Step 3 |
| E2E の層分け（§5・API は専用ツール） | Playwright = UI+モック；`pnpm test:api` = 実 Worker + [Hurl](https://hurl.dev) |
| **§3 AGENTS をポインタに** | ルート `AGENTS.md` は表とリンクのみ；詳細は本スキル・ADR |
| MVH（§10 最小実行可能ハーネス） | 下表「MVH とこのリポ」 |

### 記事のアンチパターン → このリポでの回避

1. **プロンプトだけに頼る** → Lefthook / CI / Claude Hooks で **`pnpm harness` 等を強制**（[ADR 0002](../../../docs/adr/0002-harness-engineering.md)）。
2. **リポジトリに説明文書を蓄積** → 依存・境界は **型・スキーマ・テスト・カプセル化スクリプト**で検証可能に。
3. **AGENTS / スキルを巨大化** → `AGENTS.md` と `SKILL.md` は短く、手順は `steps-*.md` へ分割。
4. **エージェント専用インフラ** → 通常の開発者向けコマンド（`pnpm harness`）を正本にする。
5. **ハーネスなしでスケール** → まず **MVH（harness + フック）** を緑にしてから並列・自動化を増やす。
6. **ゲートが正当なフォークを壊す** → カプセル化は **抽出で薄いルート**を優先し、行数上限は最後の手段。ユニットは **本番専用 env 必須**にしない。スキルは **フォークを責める前に**ゲート／テストを Red → Green で直す（セキュリティ不変は削らない）。

### MVH（記事 §10）とこのリポ

| 記事の段階 | このリポでの状態 |
|------------|------------------|
| **Week 1**（ポインタ・pre-commit・PostToolUse format・最初の ADR） | `AGENTS.md` + [SKILL.md](SKILL.md)；Lefthook で `pnpm harness`；Claude 利用者は PostToolUse format → harness；ADR `docs/adr/0001` `0002` |
| **Week 2–4**（ミスごとにテスト追加・E2E・Stop hook・起動ルーチン） | Playwright `pnpm test:e2e`；Claude **Stop** で harness；`pnpm harness:ci` / `harness:full` で層を足す |
| **Month 2–3**（カスタムゲート・PreToolUse 安全） | **`check-encapsulation.mjs`** がアーキテクチャゲート；**PreToolUse** `pre-protect-config.sh` でハーネス正本の改竄ブロック |
| **Month 3+**（高度なループ・GC） | 任意：Modifius 型 CI（`modifius-ci.yml`）は **補助の定点観測**；ガベージコレクションは **決定論ルール**に基づく運用を推奨 |

## 1. 真実のソース（Single sources of truth）

| 種別 | 置く場所 | エージェントの扱い |
|------|-----------|-------------------|
| 振る舞いの仕様 | テスト（Vitest / Playwright） | 変更したら必ず該当テストを通す |
| 永続的な「なぜ」 | `docs/adr/` の ADR | 上書きせず Supersede で更新 |
| エージェント向け手順 | `line/SKILL.md` + ルート `AGENTS.md` | 長文の独自設計書を増やさない |

## 2. 決定論的ゲート（LLM に任せない）

完了前に実行して結果を確認する。

0. **カプセル化（レイヤー・変更耐性）**: `pnpm check:encapsulation`（`pnpm harness` の **2 番目**のステップと同一スクリプト）  
   - **Worker `application/*.ts`**: `hono` を import しない。`routes/` を import しない（ユースケースは HTTP フリー）。  
   - **Worker `services/*.ts` / `middleware/*.ts`**: 相対 import で `routes/` または `application/` セグメントを含めない（層の DAG・循環防止）。  
   - **Worker `routes/*.ts`**: ソースに `api.line.me` / `access.line.me` を含めない（LINE 呼び出しは `application/` または `services/`）。各ファイルの行数は **`scripts/check-encapsulation.mjs` 内 `ROUTE_LINE_CAPS`** の上限以下。**新規ルートファイルを追加したら必ず `ROUTE_LINE_CAPS` にベース名（例: `foo.ts`）を足す**（無いとゲートが即失敗）。  
   - **Web `apps/web/src`（`lib/api/` 配下を除く）**: `lib/api/catalog` への直接 import 禁止（表向きは `@/lib/api` または `client`）。  
   - **Web `apps/web/src/lib/api/client.ts`**: `catalog` を import しない。  
   - **Web `api/catalog/*.ts`（`index.ts` を除く）**: `@line-crm/shared` と `../client.js` 以外を import しない。  
   - **Web `api/catalog/index.ts`**: `./foo.js` 形式の兄弟モジュールのみ import。  
   - **LIFF `apps/liff/src/*.ts`（テスト・`env.d.ts` を除く）**: `fetch('http…')` / `fetch("http…")` / `` fetch(`http…`) `` のような **リテラル絶対 URL 禁止**（Worker オリジンは `api-base.js` / `getLiffApiBaseUrl()` 経由）。  
   - **二重実行**: `apps/worker/tests/ci/encapsulation-gate.test.ts` が同じ `check-encapsulation.mjs` を `execFileSync` で走らせる（CI の unit でも層が崩れないことを担保）。  
   - 上限は **リファクタで下げる**のが理想。超過時は **`application/` へ抽出してから**必要なら上限を PR で調整。

1. **Worker 型検査**: `pnpm --filter worker typecheck`
2. **LIFF 型検査**: `pnpm --filter liff typecheck`（`pnpm harness` に含まれる）
3. **ユニットテスト**: ルートで `pnpm test`（worker → web → SDK）
4. マージ前はフル `pnpm test` を推奨
5. **カバレッジ**: `pnpm test:coverage`（CI と同条件）
6. **管理画面の本番ビルド**: `pnpm harness:ci` または `build:libs` 後 `pnpm --filter web build`
7. **管理画面の回帰**: `pnpm test:e2e`
8. **実 Worker の HTTP スモーク**: `pnpm test:api`（[Hurl](https://hurl.dev)）

### マージゲートが赤いとき（分岐・フォーク耐性の正本）

**先に** `pnpm harness`（または `scripts/harness-check.sh`）のログで **どの段で落ちたか**を特定する。典型順序: Biome → `check:encapsulation` → Worker 型 → LIFF 型 → LIFF build → `pnpm test`。

| 落ちた段 | 典型原因 | 次の一手（セキュリティ不変は削らない） |
|----------|----------|----------------------------------------|
| **Biome** | 整形差分 | `pnpm format` で揃える |
| **`check:encapsulation`** | import / 行数 / 層 DAG / LIFF fetch | ルートを薄く **`application/` / `services/` へ抽出**；`services`・`middleware` が `routes`/`application` を引かないか確認；Web は **`catalog` 直 import** をやめる；LIFF は **`API_BASE` 経由の fetch**；新規 `routes/*.ts` は **`ROUTE_LINE_CAPS`** に追加；**上限引き上げは最後の手段** |
| **型（Worker / LIFF）** | TS エラー | 型・import を直す（ゲート緩和ではない） |
| **LIFF build** | 設定・依存 | `apps/liff` と `@line-crm/shared` の build 順・env を確認 |
| **`pnpm test`** | 失敗テスト・env 前提 | **本番専用 env 必須**のテストになっていないか疑う。デフォルトは従来互換、厳格モードは **別ケース**で固定 |

**運用欠陥とゲート欠陥の切り分け**: **本番 D1 / secrets だけ古い**のは **`AGENTS.md` とデプロイ手順**で追う（ユニットでは検知されない）。**コードは妥当でマージゲートだけ赤い**なら **ゲート／テスト設計**を疑い、**フォークを先に責めない**。**`--no-verify`・ガード削除を促すスキル文は禁止級**。

**ペネトレ自走**（攻撃仮説・フェーズ順）は [steps-pentest-tdd-loop.md](steps-pentest-tdd-loop.md)。**「なぜ harness が赤いか」の分岐はこの小節が正本**。

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

### 4.0 TDD（SKILL Step 3〜7）との接続

| タイミング | 推奨コマンド |
|------------|----------------|
| Step 4 Red を書いた直後 | 該当パッケージの `vitest run` で**意図どおり赤**を確認 |
| Step 4 Red 確認後〜Step 5 の間 | ルート・`application`・`catalog` を触るなら **`pnpm check:encapsulation` を必須**（「早めに確認してもよい」ではなく **同時進行**） |
| Step 5 Green のあと | レイヤー・行数を変えたら **再度 `pnpm check:encapsulation`**（Step 7 待ち禁止） |
| Step 6 Refactor 後 | フォーカステスト → 広く `pnpm test` |
| **Step 7 完了条件** | **`pnpm harness`**（Biome + カプセル化 + Worker/LIFF 型 + LIFF 本番 build + 全 unit）。これが緑でなければマージ相当の完了を宣言しない |

広い UI / 契約変更では Step 8〜9 や `harness:full` を追加（[steps-4-8-gates.md](steps-4-8-gates.md)）。

## 4.1 定期観測（スケジュール CI）— Modifius CI 型のテンプレ

「日々の開発ゲート（PR/Push の CI）」とは別に、**週次/月次で回す“定点観測”**を置く場合のテンプレ。設計の参照例として [DMM Developers Blog（2026-04-01）: Modifius CI](https://developersblog.dmm.com/entry/2026/04/01/110000) を正本のひとつとする（MCP＋エージェントでファイル単位分析 → 集計 → HTML → 通知、のパイプライン分割）。

### このリポとの役割分担

| 層 | 役割 | このリポの実装例 |
|----|------|------------------|
| **マージゲート（決定論）** | 壊れた変更を弾く | `pnpm harness`（Biome・`check-encapsulation.mjs`・型・LIFF build・unit） |
| **定点観測（補助）** | 変更容易性・負債の**見える化**と優先度議論 | [`.github/workflows/modifius-ci.yml`](../../../.github/workflows/modifius-ci.yml)（決定論 + 任意で Anthropic per-file analyze + aggregate）。広い回帰は [`.github/workflows/observe.yml`](../../../.github/workflows/observe.yml)。変数 `MODIFIUS_ANALYZE_ENABLED` / シークレット `MODIFIUS_ANTHROPIC_API_KEY` で AI 部を有効化 |

静的なレイヤー違反は **カプセル化スクリプト**で機械的に検知する。AI 定点は **「関心事が混ざっているか」等の構造コメント**向きで、記事が述べるとおり**静的指標だけでは足りない領域**の補完になる。

### LLM プロンプトの正本（このリポ）

**CI 用の Modifius 型分析**でモデルに渡す文言・パラメータの単一の正本は [`scripts/modifius-analyze-one.mjs`](../../../scripts/modifius-analyze-one.mjs)（先頭コメント・`system` 定数・`fetch` 本体）。スキルや ADR にプロンプトを二重に貼らない。変更したら **CI と手動レビュー観点が一致する**ように、そのファイルだけを直す。

### Modifius CI 記事との対応（パイプライン分割の考え方）

記事のジョブ列（`parse-config` → `prep` → `analyze` ×N → `aggregate` → `build` → `deploy` → `notify` …）を、小さなリポでは次のように単純化してよい。

1. **設定読み** — 分析対象パス・除外パターン・通知先（記事の `.github/modifius-config.yml` 相当を任意形式で）
2. **prep** — 対象ファイル列挙・**バッチ分割**（matrix 上限・コストを意識）
3. **analyze** — バッチごとに LLM / エージェント実行（**並列は絞る**）
4. **aggregate** — スコアやサマリを 1 つの JSON / テーブルに集約
5. **build + deploy + notify** — HTML を Pages 等へ、Slack は短いサマリのみ

### 推論の決定性（記事のパラメータ表に沿う）

定点観測で「前週との差分比較」をしたい場合、推論のブレを減らす:

| パラメータ | 推奨の考え方 |
|------------|----------------|
| temperature | **0** に近づける（分布をシャープに） |
| top_k | **1**（最確トークン寄り） |
| top_p | **1** または未指定（top_k に委ねる） |

### 運用・コスト（記事の実務）

- **PR 毎ではなく schedule 中心**（隔週〜月次から）でコストとノイズを抑える。
- **1 回の分析ファイル数に上限**（記事では運用で抑える方針を説明）。まず `apps/worker/src/application/` や変更の多い `routes/` などに限定。
- **Prompt Caching** を使える基盤なら、同一システムプロンプトの再利用でコスト削減。
- **リトライ**: 分析ジョブは 2 回まで等、失敗を想定した構成にする。

### 雛形（このリポでの置き方）

- **CI（PR/Push）**: `.github/workflows/ci.yml` を正本として **速く・確実に**落とす（`harness:ci` 相当）。
- **定期観測（schedule）**: **`modifius-ci.yml`**（月次・決定論 + 任意で Anthropic per-file analyze・`max-parallel: 5`・aggregate で `modifius-report.md`）と **`observe.yml`**（広い `harness:ci` / E2E / API）を分離。
  - **対象パス / 分析上限**: [`.github/modifius-config.yml`](../../../.github/modifius-config.yml) の `target_paths`・`analyze_max_files`
  - **AI を回す**: 変数 `MODIFIUS_ANALYZE_ENABLED`、シークレット `MODIFIUS_ANTHROPIC_API_KEY`（任意で変数 `MODIFIUS_MODEL`）

※ 定期観測は **補助線**。PR のマージ可否は **`ci.yml` と `pnpm harness`** が決める（記事も「可視化」が先で、解消は計画フェーズと分ける語り口と整合）。

## 5. モノレポの地図

- `apps/worker` — Cloudflare Workers（Hono）
  - **`src/routes/`** — HTTP アダプタ（薄く保つ）
  - **`src/application/`** — ユースケース（Hono 非依存）。**振る舞い変更のデフォルト置き場**＋対応 Vitest
  - **`src/services/`** — ドメインサービス・ポリシー（ルートよりここへ寄せる）
- `apps/web` — Next.js 管理画面。API クライアントは **`src/lib/api/client.ts`** + **`src/lib/api/catalog/*.ts`**（`@/lib/api`）
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
