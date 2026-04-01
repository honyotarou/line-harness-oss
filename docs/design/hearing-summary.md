## 設計サマリ

### 概要（機能名 / 目的 / ユーザー / 触るアプリ: web | liff | worker）

- **機能名**: LINE Harness OSS（クリニック向け LINE CRM / 友だち獲得〜予約導線〜運用管理）
- **目的**: 友だち追加（獲得）を起点に、ステップ配信・フォーム・自動返信・運用（タグ/シナリオ/配信/通知等）を一体で回す。予約導線は LIFF を中心に、失敗時は必ず電話へフォールバック。
- **ユーザー**
  - **運用者（管理者）**: 管理画面で友だち・タグ・配信・シナリオ等を管理
  - **エンドユーザー（患者/見込み）**: LINE 内（LIFF）で導線・フォーム・予約・プロフィール紐付け
- **触るアプリ**
  - **web（管理画面）**: `apps/web`
  - **worker（API / webhook / LIFF 認証）**: `apps/worker`
  - **liff（LINE 内 UI）**: `apps/liff`

### 画面・ルート（Next / LIFF）

- **管理画面（Next）**
  - `/login`: API キーでログイン（セッション）
  - `/`: ダッシュボード（友だち数など）+ 友だち追加導線（Worker の `/auth/line` へ）
  - `/friends`: 友だち一覧・タグ付け
  - `/scenarios`: ステップ配信（作成/編集/有効化）
  - `/broadcasts`: 一斉配信
  - `/templates`, `/automations`, `/scoring`, `/reminders`, `/chats`, `/conversions`, `/affiliates`, `/webhooks`, `/accounts`, `/health`, `/emergency`
  - `/users`: ユーザー UUID 管理（クロスアカウント紐付け）
  - `/notifications`: 通知ルール設定

- **LIFF（LINE 内）**
  - 予約・エントリー等の導線を LIFF で開く（LINE Login / ID token を前提）
  - LIFF 内で API 連携が失敗するケース（予約完結不可など）では **電話フォールバック**を必ず提示する
  - 友だち追加導線の中心は Worker `/auth/line`（友だち追加 URL として利用）

### API・Worker（メソッド / パス / 認可 / リクエスト・レスポンス例）

- **CORS / Origin**
  - 許可 Origin は `WEB_URL` / `WORKER_URL` / `LIFF_URL` / `ALLOWED_ORIGINS` から構成（不一致はプリフライトで拒否）

- **管理者認証（web → worker）**
  - `POST /api/auth/login`
    - **認可**: API キー（JSON body）
    - **用途**: 管理者セッション開始
  - `GET /api/auth/session`
    - **認可**: Cookie（クロスオリジンの場合は Bearer 併用）
    - **用途**: ログイン状態確認

- **友だち追加導線（web → worker）**
  - `GET /auth/line`
    - **用途**: LINE Login（bot_prompt=aggressive）へ遷移（PC は QR、モバイルは LIFF or OAuth 直遷移）
    - **状態**: state は HMAC 署名（`LIFF_STATE_SECRET` または `API_KEY`）

- **LINE Login コールバック（LINE → worker）**
  - `GET /auth/callback`
    - **用途**: code を token 交換 → id_token verify → friend/user 作成・紐付け → 完了ページ
    - **注意**: 予約・友だち追加のトラッキング（ref / gclid / utm 等）を state から復元し保存

- **LIFF API（liff → worker）**
  - `POST /api/liff/profile`
    - **認可**: LINE Login ID token（サーバ verify）、sub と `lineUserId` が一致必須
  - `POST /api/liff/link`
    - **認可**: LINE Login ID token（サーバ verify）
    - **用途**: friend ↔ user UUID 紐付け（既存 UUID の回復も含む）
  - `POST /api/liff/booking/phone-fallback`
    - **認可**: LINE Login ID token（サーバ verify）、friend の存在必須
    - **用途**: オンライン予約が完結できない場合の **電話番号（tel: URI）** を返す
    - **レスポンス例（成功）**

```json
{
  "success": true,
  "data": {
    "telUri": "tel:0312345678",
    "message": "オンラインで予約を完了できない場合は、お電話にてご連絡ください。"
  }
}
```

### D1（テーブル・マイグレーション方針）

- **DB**: Cloudflare D1（`packages/db/schema.sql` が正本）
- **主な関係**: friends / users / friend_scenarios / scenarios / scenario_steps / messages_log / tags / line_accounts など
- **方針**
  - 既存データがある場合はマイグレーション前の重複チェック等のスクリプトを使う（`010_users_unique_contact` 関連）

### データの流れ（イベント → 処理 → 結果）

- **友だち追加（follow）**
  1. LINE → Worker `POST /webhook`（署名検証）
  2. `follow` イベントで友だち upsert、必要なら welcome Flex、friend_add シナリオ enroll
  3. delay=0 の最初のステップは replyToken で即時送信（welcome が replyToken を使った場合は二重送信を回避）

- **管理画面ログイン**
  1. Web → Worker `POST /api/auth/login`
  2. セッション発行（Cookie / 必要なら Bearer）
  3. Web は以降の API を同セッションで叩く

- **LIFF（プロフィール/紐付け/予約フォールバック）**
  1. LIFF → Worker に ID token を送る
  2. Worker で LINE verify API へ問い合わせて検証（sub の一致）
  3. friend / user の参照・更新、必要なレスポンスを返す
  4. 予約が完結しない場合は **電話へ誘導**（`BOOKING_FALLBACK_TEL`）

### バリデーション（フィールド / ルール / メッセージ）

- **CORS**
  - Origin が allowlist に無い場合: OPTIONS は 403（CORS denied）、通常リクエストはヘッダを付けず通す（ブラウザはブロック）
- **LIFF ID token**
  - 形式の妥当性 + verify API で検証
  - `sub` と `lineUserId` 不一致: 401（Invalid ID token）
- **予約フォールバック**
  - `BOOKING_FALLBACK_TEL` が未設定: 503（Booking phone fallback is not configured）
  - `tel:` 形式で正規化（`tel:` なしなら付与）

### 状態・UX（ローディング / エラー表示）

- **LIFF**
  - 通信失敗時は「やり直し」だけでなく **次の行動**（電話）を提示
  - 予約不能/障害時は **必ず電話誘導**（UI/文言を統一）
- **管理画面**
  - ローディング、空状態、失敗時の再試行を標準化

### セキュリティ・運用（秘密情報・CORS・LIFF）

- **秘密情報の置き場所**
  - Worker: `wrangler secret` / Cloudflare Variables（`API_KEY`, `LINE_*`, `LIFF_STATE_SECRET` など）
  - Web: Vercel Env（`NEXT_PUBLIC_API_URL`）
  - LIFF: Vercel Env（`VITE_API_URL`, `VITE_LIFF_ID`, `VITE_BOT_BASIC_ID` など）
- **CORS**
  - `WEB_URL` / `ALLOWED_ORIGINS` を実際の Vercel の origin と一致させる（プレビュー URL を許可するかは運用で決める）
- **LIFF**
  - 署名付き state を使い、redirect は allowlist で解決（open redirect を避ける）
  - LIFF の導線が古い QR / ブックマークに残っている場合、state secret を変えると無効化される点に留意

