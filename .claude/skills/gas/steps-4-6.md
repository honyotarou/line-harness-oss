# Steps 4〜6: テスト → 実装 → フロントエンド

## 4: failing tests

**前提**: Step 3 完了。**E2E はここでは書かない。**

関数名は設計サマリの名前をそのまま使う。独自名をつけない。

### unit tests（tests/unit/）
- バリデーション: 全フィールドの正常系・異常系・境界値
- ビジネスロジック: 仕様書の計算・変換・チェック処理
- CSV: RFC 4180 + 数式インジェクション防止 + BOM (`\uFEFF`)
- Spreadsheet 書き込み: サニタイズ + 列順一致
- **品質ゲート直結テストを必須追加**:
  - `index.html` に `innerHTML` が存在しないこと
  - `src/` に `JSON.parse` を追加した場合は fail-safe 契約テスト（try-catch + degraded return）
  - `index.html` の `:root` 定義外に `#hex` / `rgba(` がないこと
  - 書き込み系関数で `sanitize` が適用されること
  - clamp 警告が返ること（医療データのサイレント補正禁止）
- **単一 HTML + domain 正本**（該当プロジェクト）:
  - `AUTO_EXTRACT_SCORES_CORE` / `AUTO_SPREADSHEET_SANITIZE` マーカー注入後の品質ゲート（grep）
- **バリデーション文言**: `validation-messages.test.js` 等で **日本語メッセージ**を契約固定
- **ロック**: `spreadsheet-lock.test.js` + 可能なら `spreadsheet-lock-adapters.test.js`（`waitLock` 失敗 → ユーザー向け日本語）

### integration tests（tests/integration/）
- 各サーバー関数の正常系・異常系
- **全書き込み系関数のサニタイズテスト**: save だけでなく update 等でも sanitize 呼出しを検証
- 外部API: リトライ、サイズ上限、形式制約、MIME タイプ伝播、null/部分欠損
- **レイヤー間契約テスト**: error key = UI field ID 一致、操作別バリデーション範囲、タイムゾーン
- lint 整合性: biome check 通過
- **品質ゲート8パターンが tests/ で参照可能であること**（grep で検出可能な記述を含める）

### モック忠実度ルール
- モック adapter は実際と同じメソッドを全て持つこと
- 外部 API モックは Markdown コードブロック付き JSON 等の実応答形式も含む

完了確認: `npx vitest run` で全テストが fail すること。

---

## 5: 実装

**前提**: Step 4 の failing tests が存在する

domain → infrastructure → application の順に実装。各タスク:
1. failing tests を green にする
2. `npx vitest run` で全テスト確認
3. `npx biome check src/` で lint 確認

### 必須ルール
- **サーバー側バリデーション（信頼境界）**: 全書き込み系関数で domain/validation.js を呼ぶ
- **Spreadsheet サニタイズ**: `= + - @` にシングルクォート前置。**全書き込み系関数で漏れなく適用**（saveRecord だけやって updateRecord を忘れる頻出バグ）
- **CSV サニタイズ**: RFC 4180 + 数式インジェクション防止
- **CSV BOM**: `buildCsv` / `toSubmissionCsv` の先頭に `\uFEFF`
- **GAS パフォーマンス**: `setValue()` 連続禁止 → `setValues()` で1回にまとめる
- **GAS 型変換**: SpreadsheetAdapter 内で Date → YYYY-MM-DD 正規化
- **共通ヘルパー重複防止**: constants.js に1箇所だけ定義
- **API キー送信**: URL クエリパラメータ禁止 → `x-goog-api-key` ヘッダー
- **ロック失敗**: `src/infrastructure/spreadsheet-lock.js` の `withSpreadsheetLock` に集約。`waitLock` の例外は日本語の短い案内に統一（`globalThis.LockService`）
- **クランプ警告**: 範囲外値の自動補正時は必ず warnings に記録（黙って丸めない）

### ビルド確認（全テスト green 後）
1. `npm run build:gas`（先頭で `sync-domain-snippets-to-index.mjs` が index の AUTO 領域を更新。`pretest` でも同同期あり）
2. gas/Code.gs に import/export がないこと
3. const/function の重複がないこと
4. 関数名が仕様と完全一致すること
5. `npx biome check src/` + `npx biome check tests/` がエラーゼロ

---

## 6: index.html + E2E

**前提**: Step 5 で unit + integration が全 green

### 6a. MOCK_MODE 切替
true/false 両モードで全フロー動作確認
- **既定値は `MOCK_MODE=false`（本番パス）**。`?mock=true` でのみ mock を有効化
- `?mock=false` で `google.script.run` 経由の呼び出しが実際に走ること

### 6b. バリデーション同期
index.html のインラインバリデーションが src/domain/validation.js と一致していること
- `num()` 等の数値ヘルパーで空文字を `0` 扱いしない（空は `null`）
- 日付はローカルタイムで初期化し、`YYYY-MM-DD` 必須検証を入れる
- **文言も日本語で一致**（サーバが返す `Error.message` とクライアント `validate()` のトーストが同じ趣旨になるよう揃える）

### 6b-2. domain スニペットの単一正本（単一 HtmlService）
- 抽出・サニタイズ等を `src/domain/*.js` に置き、`scripts/sync-domain-snippets-to-index.mjs` で `index.html` のマーカー区間へ注入する場合:
  - マーカー外を手編集し、マーカー内だけ生成に任せる
  - `String.replace` で注入する実装では **`$&` 誤展開**に注意 → 置換は関数 replacer を使う

### 6c. XSS 修正
innerHTML 全面禁止（`innerHTML = ''` 含む）。replaceChildren / textContent / createElement に置換

### 6d. エラーコード整合性
index.html のエラー判定と src/ のエラーメッセージの一致確認

### 6e. フロントエンド状態管理の既知バグパターン修正
1. **showToast の setTimeout 蓄積**: clearTimeout で前のタイマーをキャンセル
2. **editingRecordId の失敗時の扱い**: failureHandler でクリアしない（リトライ時の重複防止）
3. **非同期操作中の保存ガード**: pending フラグ + disabled
4. **外部 API 結果の null 警告**: 部分/全欠損時に警告トースト表示
5. **アップロード配線漏れ防止**: `#files` を実際に読み、`runOcrBatch(payload)` に `name/mimeType/contentBase64` を渡す

### 6f. CSS ハードコード検出
```bash
grep -nE 'rgba?\(|#[0-9a-fA-F]{3,8}' index.html | grep -v -- '--.*:' | grep -v '^\s*//'
```
- `:root` の CSS 変数定義以外で rgba/hex が出たら違反
- 違反 → design-tokens.json にトークン追加 + `var()` 置換
- **頻出: `:focus` の `box-shadow` → `--shadow-focus` トークンを使う**
- **頻出: toast / progress / button text 色のハードコード（`#fff`, `#000`, `#...`）**

### 6g. 1画面チェック
デスクトップ（1440x900）で1画面に収まること

### 6h. E2E テスト
index.html の実 DOM を読んでからセレクタ決定。テスト観点:
- フロー: 全ユーザーフロー（入力 → エラー → 修正 → 成功）
- 状態遷移: 成功/エラーフィードバック、リトライ、二重送信防止
- セキュリティ: XSS（`<script>`、`<img onerror>`）
- 本番パス: google.script.run の全サーバー関数が MOCK_MODE=false に存在
- デザイン: 375px 横スクロールなし、ハードコード色なし
- タイマー: showToast 連続呼出しで古いタイマーが新しいトーストを消さないこと
- **本番分岐**: `?mock=false` で `google.script.run` 経路を検証（スタブ可）
- **サーバー起動**: Playwright は `webServer` を設定して `ERR_CONNECTION_REFUSED` を防ぐ
- **保存成功後のクリア確認**: ネイティブ `confirm` は使わず **`#saveClearDialog`** モーダル。E2E は **`await expect(page.locator("#saveClearDialog")).toBeVisible()`** のあと **`#saveClearDismiss`**（または確定ボタン）をクリック。`page.once("dialog")` はカスタムモーダルには効かない

完了条件: `npx playwright test` 全 green

### 6i. Step 6 完了ゲート（必須）
- `npx vitest run` が green（品質ゲート専用テスト含む）
- `npx biome check src/ tests/` がエラーゼロ
- `npm run build:gas` 成功

---

## よくある失敗（TDD アンチパターン）

**このステップで踏みがちな罠**。出たら直前の手順に戻る。出典は `shuusei/SKILL.md`。

| アンチパターン | 何が起きる | 戻るべき手順 |
|----------------|------------|----------------|
| **Red なしで Green から書き始める** | 「既に通っているだけのテスト」が後付けされ、仕様が緑で固定される | §4（失敗を目視してから §5） |
| **コンパイルエラーだけの Red** | 意図した理由で失敗していない。実装後に偶然緑になると仕様が固まらない | §4（アサーションが将来の振る舞いを表す形に） |
| **1 Red に複数論点（XSS + サニタイズ + バリデーション）を詰める** | Green の最小差分が決まらず、何が効いたか追えない | §4（受け入れ条件を分割、tests を複数 `it` に） |
| **Green で無関係リファクタを同梱** | bisect 不能、レビュー困難 | §5（最小差分のみ） → リファクタは別コミット |
| **`saveRecord` に sanitize を適用し `updateRecord` を忘れる** | 片方だけ数式インジェクション脆弱。頻出バグ | §5（**全書き込み系関数** で sanitize import + 適用、integration テストで全関数を対象化） |
| **`JSON.parse` を try-catch せず追加** | 外部 API 応答の壊れ JSON で即 500 | §5（try-catch + degraded return + warnings） |
| **`innerHTML` を使って Step 6 を先に緑にする** | `tests/unit/no-innerhtml.test.js` 等の品質ゲートが即落ちる | §6c（`textContent` / `replaceChildren` / `createElement` に置換） |
| **範囲外値をサイレント clamp** | 医療データ改ざん。`warnings` なしで丸める禁止 | §5（clamp 時は必ず `warnings` に記録） |
| **インラインバリデーション文言が英語 / 正本とズレる** | GAS 保存時のサーバーメッセージと UI トーストが食い違う | §6b（`validation.js` と `validate()` を日本語で同文固定） |
| **`MOCK_MODE=true` 既定のまま** | 本番 URL で `google.script.run` が呼ばれない | §6a（既定 `false`、`?mock=true` のみ mock） |
| **`toISOString().slice(0,10)` を常用** | UTC 境界で日付が 1 日ズレる（未来日チェック / CSV フィルタ誤判定） | §5（`todayYmdAsiaTokyo()` / ローカル時刻で YYYY-MM-DD 生成） |
| **`waitLock` の例外を英語のまま UI に出す** | ユーザーに `Lock timeout` が出て混乱 | §5（`withSpreadsheetLock` に集約 + 日本語の短い案内に置換） |
| **`page.once("dialog")` でカスタムモーダルを受ける** | `#saveClearDialog` には効かず E2E が空振り | §6h（`await expect(page.locator("#saveClearDialog")).toBeVisible()` + `#saveClearDismiss`） |
| **`ROUTE_LINE_CAPS` 相当の上限超過を「後で直す」** | 本 GAS では `src/application/*.js` 薄化が崩れる | §5（`domain` / `infrastructure` へ抽出、application は配線） |

**1 ルール**: 「Red → Green → build:gas + biome + vitest → 品質ゲート」の **どれか 1 つを飛ばしたら直前のステップに戻る**。**飛ばしたまま §7 に進まない**。

## 関連

- **[shuusei/SKILL.md](../shuusei/SKILL.md)** — このアンチパターン表の出典。skill 自体を大改訂した直後は shuusei の subagent 評価ループにかける。
- **[steps-7-8-check.md](steps-7-8-check.md)** — §check の「誤報防止 / Red flags」は `check` 実行時の合理化注意（grep ヒット → finding の直結を防ぐ）。
