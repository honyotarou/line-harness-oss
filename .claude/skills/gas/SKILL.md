---
name: gas
description: >-
  GAS アプリ開発の全工程を番号選択で実行するスキル。
  Use when the user says /gas, mentions GAS app development,
  Google Apps Script, HtmlService, or wants to build a spreadsheet-based web app.
---

# GAS アプリ開発ワークフロー

**Cursor**: 正本は **`.cursor/skills/gas/SKILL.md`**。スラッシュ **`/gas`** から来た場合もここを Read する。**最初に読む `steps-*` は下の decision index だけで決める**（`steps-*.md` を glob 列挙してから選ばない）。

番号選択で全工程を実行する。引数なしならメニュー表示。

```
GAS アプリ開発:

  0  デザイン原則抽出    画像 → .cursorrules + design-tokens.json
  1  設計ヒアリング      8 Round 対話 → 設計サマリ + HTML モック
  2  プロジェクト骨格    設計サマリ → ディレクトリ・設定・ビルド
  3  ルール・ハーネス     .cursor/rules/ + ADR + 品質ルール
  4  failing tests      テスト観点表 → unit + integration（実装しない）
  5  実装               domain → infrastructure → application
  6  index.html + E2E   MOCK_MODE + XSS修正 + Playwright
  7  最終チェック        Step 7 チェックリスト + coverage
  8  デプロイ            clasp push + deploy → 本番公開
  check  品質ゲート      修正ブランチ由来の8パターン検証（任意タイミング）

番号を入力してください:
```

各ステップの詳細は参照ファイルを読むこと:
- [steps-0-3.md](steps-0-3.md) — Step 0〜3 の詳細手順
- [steps-4-6.md](steps-4-6.md) — Step 4〜6 の詳細手順
- [steps-7-8-check.md](steps-7-8-check.md) — Step 7〜8 + 品質ゲートの詳細手順

## 番号 → 最初に Read する steps-*（decision index）

ユーザーが番号／キーワードを選んだら、下表の **1 本目だけ** を最初に Read する。**glob / キーワードで `steps-*.md` を横断探索してから選ばない**（参照 descent を避ける）。

| 入口 | 1 本目に Read | 2 本目が典型なら |
|------|---------------|-------------------|
| **0** デザイン抽出 | [steps-0-3.md](steps-0-3.md)（§0） | — |
| **1** 設計ヒアリング（8 Round） | [steps-0-3.md](steps-0-3.md)（§1） | 必要なら `../shuusei/SKILL.md`（評価ループ） |
| **2** プロジェクト骨格 | [steps-0-3.md](steps-0-3.md)（§2） | — |
| **3** ルール・ハーネス | [steps-0-3.md](steps-0-3.md)（§3） | — |
| **4** failing tests | [steps-4-6.md](steps-4-6.md)（§4） | — |
| **5** 実装 | [steps-4-6.md](steps-4-6.md)（§5） | よくある失敗表で戻り先を確認 |
| **6** index.html + E2E | [steps-4-6.md](steps-4-6.md)（§6） | — |
| **7** 最終チェック | [steps-7-8-check.md](steps-7-8-check.md)（§7） | — |
| **8** デプロイ | [steps-7-8-check.md](steps-7-8-check.md)（§8） | — |
| **check** 品質ゲート | [steps-7-8-check.md](steps-7-8-check.md)（§check） | 誤報防止 + Red flags 節を先に読む |
| **observe** 定期観測 | [steps-7-8-check.md](steps-7-8-check.md)（§observe） | `templates/observe.yml` |

## Canonical helpers（新規コード書く前に探す）

新しい検証・サニタイズ・ロック・ヘッダ正規化を書き下ろす前に、下表の正本に同等ヘルパがないか確認する。**インライン再実装は ドリフトの元**（例: `sanitize` を saveRecord で呼んで updateRecord で忘れる頻出バグ）。

| ヘルパ / 正本 | 場所 | 役割 |
|---------------|------|------|
| `validation.js` の各関数 | `src/domain/validation.js` | 全バリデーションの正本。UI の `validate()` も同じルールを参照し、**日本語メッセージで契約**（`tests/unit/validation-messages.test.js` で固定） |
| `sanitize`（Spreadsheet 書き込み） | `src/infrastructure/*` または `src/domain/*` | `= + - @` 先頭シングルクォート前置。**全書き込み系関数で漏れなく適用** |
| `withSpreadsheetLock(...)` | `src/infrastructure/spreadsheet-lock.js` | `LockService.getScriptLock().waitLock(...)` 集約。`waitLock` の例外は **日本語の短い案内** に置換（生の英語を UI に見せない） |
| `buildCsv` / `toSubmissionCsv` | `src/domain/csv.js` | RFC 4180 + 数式インジェクション防止 + 先頭 `﻿` BOM |
| `todayYmdAsiaTokyo()` | `src/domain/` | 未来日チェックの暦日（UTC 基準で境界を誤判定しない） |
| `assertExportCsvDateFilters` | `src/domain/validation.js` | CSV エクスポートの `from<=to` / カレンダー妥当性 / 上限チェック |
| `scripts/domain-snippet-builders.mjs` + `sync-domain-snippets-to-index.mjs` | `scripts/` | `index.html` の `AUTO_*` マーカー区間へ domain 正本を注入（`pretest` / `build:gas` 自動実行） |
| `scripts/gas-entry.js` | `scripts/` | 公開 API を `Object.assign(globalThis, …)`。**新規公開関数は app に export + ここに 1 行追加** |

## 関連

- **[`shuusei/SKILL.md`](../shuusei/SKILL.md)（`/shuusei`）** — empirical prompt tuning。本 SKILL / `steps-*` を大改訂した直後に subagent で評価ループを回す。誤報防止 / Red flags / 提示フォーマット の出典も shuusei。
- **[`line/SKILL.md`](../line/SKILL.md)（`/line`）** — 別リポ（LINE Harness OSS）の姉妹スキル。decision index / 関連ファイル構造 / encapsulation-gate の考え方はこちらと同じ原則（スキル本文を索引に、手順を `steps-*` に分割、機械ゲートで毎回強制）。

## アーキテクチャ

```
src/domain/              ← ビジネスルール（外部依存なし・純粋関数）
src/infrastructure/      ← Spreadsheet / ロック / ストレージ実装
  spreadsheet-lock.js
  patient-assessment-storage-shared.js   ← ヘッダ・チャンク範囲・assessmentCompositeKey 等
  patient-assessment-storage-memory.js    ← patientAssessmentMemoryApi（テスト・Node）
  patient-assessment-storage-spreadsheet.js ← patientAssessmentSpreadsheetApi（GAS・チャンク読み）
  adapters.js            ← バックエンド切替（SpreadsheetApp の有無）
src/application/         ← サーバー関数（domain + infrastructure を組み合わせ）
scripts/gas-entry.js      ← esbuild エントリ：globalThis に公開 API + doGet（PRP 本番パターン）
scripts/gas-bundle.mjs    ← esbuild で bundle → gas/Code.gs（ESM なし）
scripts/domain-snippet-builders.mjs       ← スニペット生成（単体テストあり）
scripts/sync-domain-snippets-to-index.mjs ← 単一 HTML へ注入（pretest / build:gas）
gas/Code.gs              ← ビルド生成物（直接編集禁止）
index.html               ← フロントエンド（1ファイル完結・AUTO_* マーカー内は生成領域）
```

依存方向: domain → 外部依存なし / infrastructure → domain 参照可 / application → 両方参照可

## 必須ルール（全ステップ共通）

### セキュリティ
- innerHTML 禁止 → textContent / createElement / replaceChildren
- Spreadsheet 書き込み: `= + - @` 先頭にシングルクォート前置（全書き込み関数で漏れなく）
- CSV: RFC 4180 + 数式インジェクション防止
- API キー: PropertiesService 経由（ハードコード禁止）
- API キー送信: URL クエリパラメータ禁止 → ヘッダー (`x-goog-api-key`) で送信

### デザイン
- design-tokens.json が唯一の値の正本。CSS 変数はトークンから生成
- 色・フォント・余白・影・角丸・モーションは全て CSS 変数で指定。ハードコード禁止
- **focus ring の box-shadow も `--shadow-focus` トークンを使う（頻出ハードコード）**
- **状態色は success / error / warning の3セット + light バリアント**
- 禁止フォント: Inter, Roboto, Arial, Open Sans, Lato, Space Grotesk
- 禁止色: 紫グラデーション、ネオンカラー、彩度100%原色、純白 #FFFFFF 背景

### GAS 固有
- `setValue()` 連続呼出し禁止 → `getRange().setValues([[...]])` で1回にまとめる
- SpreadsheetAdapter 内で `getValues()` の Date → YYYY-MM-DD 文字列に正規化
- `build.sh` → `sync-domain-snippets-to-index.mjs` のあと **`esbuild`**（`scripts/gas-bundle.mjs`）。エントリ **`scripts/gas-entry.js`** で `app.js` から import した **`export` を `Object.assign(globalThis, …)`**（`doGet` 含む）。スニペット正本は `scripts/domain-snippet-builders.mjs`。**新規 GAS 公開関数**は **app に export + gas-entry に 1 行追加**。
- **書き込みロック**: `LockService.getScriptLock().waitLock(...)` は `withSpreadsheetLock`（`spreadsheet-lock.js`）に集約。`waitLock` が投げた例外は **日本語の短い案内**に置き換え（生の英語サービスエラーをユーザーに見せない）。`globalThis.LockService` で参照（テスト容易性）

### バリデーション
- 正本: `src/domain/validation.js`
- **ユーザー向け文言は日本語で統一**（医療 UI）。`throw new Error(...)` も英語にしない
- index.html のインラインバリデーションは **ルール・文言とも** 正本と一致させる（ズレると GAS 保存時だけ別メッセージになる）
- **実施日の未来チェック**は **`todayYmdAsiaTokyo()`**（Asia/Tokyo の暦日）。UTC 基準だと境界で誤判定しうる
- **CSV エクスポート日付**は **`assertExportCsvDateFilters`**（YYYY-MM-DD・カレンダー妥当・`from <= to`）。`exportCsv` 入口で必須（可能なら storage 側で期間 pushdownし、フィルタ後件数で上限チェック）
- サーバー側は必ず validation.js を呼ぶ（信頼境界）
- エラーオブジェクトのキー名は UI の field ID と一致させる
- 日本語メッセージの契約は `tests/unit/validation-messages.test.js` のようなテストで固定すると回 regress しにくい

### HtmlService クライアント（google.script.run）
- **`withFailureHandler`**: GAS は **`throw "文字列"`** しうる。`err` が string のとき **`new Error(err)`** で渡すとトーストに正しい日本語が出る
- **長時間処理**: 進捗 UI は完了時に **`finally`** でリセット（例: CSV プログレス幅）

### テスト
- `npm test` の前に **pretest** で `sync-domain-snippets-to-index.mjs` が走り index の AUTO 領域が正本と同期される
- 手動同期のみなら `npm run sync:client-domain`
- vitest（unit + integration）、Playwright（E2E）
- E2E セレクタは index.html の実 DOM を読んでから決定（想像で書かない）
- E2E は MOCK_MODE 前提。テスト失敗時はテストでなく実装を直す
- 品質ゲート観点（innerHTML / sanitize / JSON.parse / clamp warning / BOM / CSS token）を tests に必ず対応させる
- E2E は **mock と non-mock の両分岐**を最低1本ずつ持つ
- Playwright に `webServer` を設定し、接続拒否による偽陰性を防ぐ

## 監査・品質でよい落とし穴（医療系レジストリ向け）

- **Spreadsheet 行の DRY**: 行値は `patient-assessment-storage-shared.js` の `assessmentSheetRowValues` 等に集約。履歴追記はスプレッドシート実装側のヘルパーに集約。
- **大容量シート**: **チャンク `getRange`**（例: `assessmentDataChunkRanges` / `SPREADSHEET_READ_CHUNK_ROWS`）で **一覧・検索のピークメモリ**を抑える。全件 CSV 用の**結果配列**は行数に比例しうる。
- **CSV（推奨の落とし穴回避）**: 可能なら **storage 側で日付フィルタを pushdown**（例: `exportAssessmentRowsForCsv(fromDate, toDate)`）し、**フィルタ後件数**で上限チェックしてから CSV 文字列生成する。
- **タイムラインAPI**: `listAssessments` の RPC ペイロードは **`memo` / `ocrText` を含めない**（グラフ・一覧は不要なPHIを運ばない）。
- **クライアントと domain の単一正本（インライン化）**: KOOS/VAS 抽出は `src/domain/extractScoresCore.js`、CSV セルエスケープは `src/domain/csv.js`。生成ロジックは `scripts/domain-snippet-builders.mjs`、注入は `sync-domain-snippets-to-index.mjs`（`pretest` / `build:gas`）。`String.replace` に `$&` が絡む場合は **関数 replacer**。スニペットは **先頭 JSDoc のみ除去**し、`extractScoresCore` より前のヘルパー関数を落とさない。
- **保存後 UX**: 二重送信防止のため、**モーダル**（`role="dialog"`、`aria-modal`）で評価欄クリアを提案。**Tab フォーカストラップ**（`trapFocusInSaveClearDialog`）と Escape。E2E は `#saveClearDialog` → `#saveClearDismiss`（**`page.once("dialog")` はネイティブ alert/confirm 用**で、カスタムモーダルには使わない）。
- **メモリ実装の patientId**: `listAssessmentRows` は **`String(a) === String(b)`** で比較（スプレッドシート由来の数値と UI の文字列の不一致を防ぐ）。
- **OCR フォールバック**: テスト/特殊環境でモックに落ちるとき **`console.warn`** で明示（本番で UrlFetch 不可のときの調査用）。
- **OCR の一時障害**（429/5xx）: 短い待ちで **回数上限付きリトライ**（指数バックオフやジッターは要件次第）。成功/失敗の観測用に `attempts` 等をログへ含める。
- **認可と Script Properties のモック**: テストで `getProperty` が全キーに同じ文字列を返すと、`AUTH_*` が誤って有効化される。`GEMINI_API_KEY` などキーごとに分岐させる。
- **スプレッドシート行 + ロックの結合テスト**: `tests/integration/spreadsheet-lock-adapters.test.js` のように、`SpreadsheetApp` あり経路で `waitLock` 失敗 → 日本語メッセージになることを検証する。

### `/gas check` 追補（推奨）
- **9-11** `index.html` に `AUTO_EXTRACT_SCORES_CORE` / `AUTO_SPREADSHEET_SANITIZE` マーカーがあり、`npm run build:gas` 後も消えていないこと
- **9-12** `src/domain/validation.js` に英語のみの `throw new Error("` が残っていないこと（grep）

## PRP Knee Registry（リポジトリ別の充実ハーネス）

**`otameshi`** のような本番構成では、グローバル手順に加え **リポ内 `skills/gas/SKILL.md`**（スキル名 `prp-knee-registry-gas`）を読む。内容の例:

- `.cursor/rules/*.mdc`（**dev-harness / agents / gas-contracts / design-rules**）の**対応表**
- **マージ前チェックリスト**（`npm test` / `lint` / `build:gas` の条件分岐）
- **`quality-gate.test.js` の観点を表形式で要約**（壊すと落ちる項目の一覧）
- **esbuild エントリから到達する import・単一 RPC** などリポ固有の落とし穴

Step **3（ルール・ハーネス）**の具体テンプレートとして、このファイルを真似ると他プロジェクトでも同粒度のハーネスを作れる。

## ルール
- 全ステップを Cursor で実行する
- 各ステップは前のステップの完了が前提。未達なら先行ステップを案内する
- 0 → 1 → 2 → ... → 8 の順で進む。飛ばさない
