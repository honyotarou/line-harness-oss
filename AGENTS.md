# LINE Harness OSS — エージェント向けポインタ

長文の仕様書は置かない。**コード・テスト・ADR** が真実。詳細な開発ハーネスは Cursor スキルに集約する。

## 必読（オンデマンド）

- **スラッシュコマンド（チャットで `/`）**: プロジェクト直下 [`.cursor/commands/`](.cursor/commands/) — 例 **`/line`**（統合メニュー）、**`/pentest-tdd-loop`**（ペネトレ→TDD 自走ループ；**フェーズ1＋フェーズ2**の固定順で全チェックリスト相当を踏み、その後変種ラウンド。**最大 100 ラウンド**または P1 が 2 連続ゼロまで確認なしで回せる）。中身はエージェントへの指示プロンプト。
- **LINE 統合スキル（デザイン・壁打ち・TDD・ハーネス・デプロイ）**: [`.cursor/skills/line/SKILL.md`](.cursor/skills/line/SKILL.md)（**`/line`** コマンドまたは **Agent Skills** の `line` — デザイン・要件は **親 0（ビジュアル・任意リッチ）** と **親 1（8 Round＋ブランド）** の2段；リッチ枝は [`steps-rich-menu-wallball.md`](.cursor/skills/line/steps-rich-menu-wallball.md)、ほか `steps-*.md`）
- **ペネトレ枝（Skills でも検出可）**: [`.cursor/skills/pentest-tdd-loop/SKILL.md`](.cursor/skills/pentest-tdd-loop/SKILL.md)（正本の手順は [`.cursor/skills/line/steps-pentest-tdd-loop.md`](.cursor/skills/line/steps-pentest-tdd-loop.md)）
- **意思決定の履歴**: [`docs/adr/`](docs/adr/)（テスト層: [`0001`](docs/adr/0001-testing-and-harness-layers.md)、ハーネス方針: [`0002`](docs/adr/0002-harness-engineering.md)）

## よく使うコマンド（ルート）

| 目的 | コマンド |
|------|-----------|
| クイック検証（Biome + **カプセル化** + **`build:libs`** + 型 + LIFF build + ユニット）。**失敗メッセージは Lint と同様**に順に潰す | `pnpm harness` |
| レイヤー／薄いルートだけ（単体） | `pnpm check:encapsulation` |
| コード整形（Biome） | `pnpm format`（`pnpm format:check` で検証のみ） |
| CI `unit` ジョブ相当（LIFF 型・`build:libs`・`next build`・カバレッジ + SDK） | `pnpm harness:ci` |
| 広い完了ゲート（harness + E2E + API 統合） | `pnpm harness:full` |
| ユニット（CI と同系） | `pnpm test` |
| カバレッジ | `pnpm test:coverage` |
| ベンチマーク（Worker の Vitest bench） | `pnpm test:bench` |
| Playwright（UI；API はモック） | `pnpm test:e2e` |
| **API 統合（実 Worker ローカル + [Hurl](https://hurl.dev)）** | `pnpm test:api` |
| D1 スキーマをローカルに流す（worker ディレクトリ基準） | `pnpm db:migrate:worker-local` |
| D1 ローカルを**完全初期化**（`.wrangler` 削除 → `schema.sql`） | `pnpm db:fresh:local` |
| D1 リモート `line-crm` を**削除して作り直し** → `schema.sql`（全データ消去） | `CONFIRM=YES CONFIRM_REMOTE_D1_WIPE=YES pnpm db:fresh:remote` |
| D1 010 適用前の重複チェック（local / remote） | `pnpm db:pre-010-check` / `pnpm db:pre-010-check:remote` |
| D1 `010_users_unique_contact` 適用（local） | `pnpm db:apply-010:local` |
| デプロイ先 Worker の HTTP スモーク + LIFF 手動メモ | `STAGING_WORKER_URL=… pnpm smoke:staging` |
| Worker 開発 | `pnpm dev:worker` |
| Web 開発 | `pnpm dev:web` |

**PR の CI**（`.github/workflows/ci.yml` の `unit` ジョブ）は **Biome の直後**に **`pnpm check:encapsulation`** を走らせる（TDD と同じレイヤー規約をビルド前に強制）。Worker の Vitest にも `encapsulation-gate` がある。

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
- ルートの `pnpm db:migrate` は **リモートに `schema.sql` 全体**を流す。既存データとの兼ね合いは必ず確認すること。**中身を捨てて空に近づける**なら `pnpm db:fresh:local` / `pnpm db:fresh:remote`（リモートは `wrangler d1 delete`＋`create` で UUID が変わる → `wrangler.local.toml` の `database_id` をスクリプトが更新。本番 Worker / CI の binding も新 ID に合わせて再デプロイ）。

**Worker シークレット（LIFF まわり）**

- **本番で `API_KEY` への HMAC フォールバックを切る（推奨）**: `REQUIRE_ADMIN_SESSION_SECRET=1` と専用 `ADMIN_SESSION_SECRET`（管理セッション署名）、`REQUIRE_LIFF_STATE_SECRET=1` と `LIFF_STATE_SECRET`（OAuth `state`）、`REQUIRE_TRACKING_LINK_SECRET=1` と `TRACKING_LINK_SECRET`（`?f=` トラッキング）。いずれかが未設定のときは該当機能が 503 になる（`admin-session`・`liff-identity`・`tracking-friend-token` 系テスト参照）。
- `LIFF_STATE_SECRET` を推奨。`API_KEY` で OAuth `state` を署名するのは **`ALLOW_LIFF_OAUTH_API_KEY_FALLBACK=1` を付けたローカル開発のみ**。本番は `LIFF_STATE_SECRET` または `REQUIRE_LIFF_STATE_SECRET=1`。
- `LINE_ACCOUNT_SECRETS_KEY`（32 バイトを base64）を設定すると `line_accounts` のトークン類が D1 上で AES-GCM 密封（`lh1:`）される。
- `WEB_URL` / `WORKER_URL` / `ALLOWED_ORIGINS` / `LIFF_URL` が、実際のクライアント・リダイレクト先と一致していること。
- **管理ログインのレート制限**は D1 上の `request_rate_limits` に永続化する。`POST /api/auth/login` と `GET /api/auth/session` で **503**（`D1 database binding required for auth rate limiting`）が返る場合は **Worker に D1 バインディングが付いていない**（誤デプロイ・ローカル設定ミス）を疑う。
- **受信 Webhook** `POST /api/webhooks/incoming/:id/receive` は、ID 列挙対策で **不明・非アクティブ・シークレット未設定・署名不正**などを **同じ 401** で返すことがある。**シークレット未設定の監視を 503 前提にしない**こと。設定状態は管理 API / UI で確認する（`docs/wiki/15-Webhooks-and-Notifications.md`）。
- デプロイ後、**古い未署名 OAuth `state` の QR・ブックマーク**は無効になる。顧客には新フローで再発行が必要な場合がある。

**Cloudflare Access（Zero Trust）+ 別オリジンの管理画面（例: Vercel → Worker API）**

- ブラウザの **CORS プリフライトは `OPTIONS` で、仕様上 Cookie を送らない**。Access で API ホストを保護していると **プリフライトが 403** になり、管理画面からは「CORS 失敗／接続失敗」に見える。Worker の `WEB_URL` やオリジン許可だけでは直らない（**エッジで止まっている**）ことがある。
- **切り分け:** `curl -i -X OPTIONS 'https://<api-host>/api/auth/login' -H 'Origin: https://<web-host>' -H 'Access-Control-Request-Method: POST'` で **`Content-Type: text/html`** の 403 なら、Worker の JSON ではなく **Access 等の手前**の応答を疑う。
- **対処:** Cloudflare One の該当 **Access アプリ**で **Advanced settings → Cross-Origin Resource Sharing (CORS) settings** を開き、[Allow preflighted requests](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/#allow-preflighted-requests) を参照する。**本リポジトリでは CORS の「Bypass options requests to origin」（Option 1 / [公式](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/#bypass-options-requests-to-origin)）は使わない** — プリフライトは **Option 2 — [Configure response to preflight requests](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/#configure-response-to-preflight-requests)** に統一し、Allow-* を **実リクエストでオリジンが返すヘッダと一致**させる。別オリジンから API へ Cookie が届かない構成は **Option 3**（[サービストークン付き Worker / BFF](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/#send-authentication-token-with-cloudflare-worker)）。手順の正本: [Cloudflare Access — CORS](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/)。
- **Access に CORS を寄せるときの分担:** **「Access がプリフライトに応答」**を選ぶと、ブラウザの **`OPTIONS` はエッジで完結し、line-crm Worker には届かない**。それでも **実リクエスト（`GET` / `POST` 等）のレスポンス**に付ける `Access-Control-Allow-Origin` / `Access-Control-Allow-Credentials` / `Access-Control-Allow-Headers` は、クロスオリジンで本文を読むために **オリジン（Worker）が返す必要がある**（Access の CORS UI は主にプリフライト用）。そのため **Worker の `apps/worker/src/index.ts` 先頭の CORS ミドルウェア（`cors-policy.ts`）は残す**運用とし、Access 側の許可オリジン・メソッド・ヘッダ（必要なら Credentials）を **Worker が付ける値と矛盾しないよう**揃える（`*` と `credentials` の併用は CORS 仕様上不可）。
- **同一ホストで Next.js 管理画面 + Access（ゾーン／アプリが apex を丸ごと保護）:** `/_next/static/chunks/*.js` や `/_next/static/css/*.css` が **Access のサインイン HTML** に置き換わると、チャンクが実行できず **白画面・MIME エラー**になる（`fetch` の CORS 以前の問題）。公式の **CORS 設定だけでは足りない**ので、次を組み合わせる。
  - **静的パスは Access の Policies でバイパスする:** Zero Trust の **Policies** で、ホスト＋パス（例: `/_next/static/*`、使うなら `/_next/image`、`/favicon.ico` 等）に **Bypass**（認証不要）のポリシーを追加し、**一覧の上（先に評価される位置）**に置く（これは **CORS 設定の「Bypass options requests to origin」とは別物**）。より具体的なパス用ルールが優先されるのは [Application paths](https://developers.cloudflare.com/cloudflare-one/policies/access/app-paths/) のモデルに沿う。
  - **`/_next/static/chunks/*.js` が 404 かつ `Content-Type: text/plain`（`ChunkLoadError`）:** 多くは **古い HTML がエッジ／ブラウザに残り、新デプロイのチャンクハッシュと不一致**なとき。デプロイ後に **HTML 周りのキャッシュを Purge**、または HTML の **TTL を短く**（チャンク自体は `immutable` で長くてよい）。Access で静的がサインイン HTMLに差し替わっていないかも確認。**アプリ**は `ChunkLoadRecovery`（`sessionStorage` で **1 回だけ**フルリロード）で軽い自己回復（判定の正本は `apps/web/src/lib/chunk-load-recovery-policy.ts`）。
  - **API / BFF 用の CORS（OPTIONS）:** **CORS 設定の「Bypass options requests to origin」は使わず**、[Configure response to preflight requests](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/#configure-response-to-preflight-requests) に統一する（[Allow preflighted requests](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/#allow-preflighted-requests)）。
  - **実リクエスト（`GET` / `POST` 等）:** **`CF_Authorization`（または `Cf-Access-Jwt-Assertion`）付きの通常プロファイル**で通す。`/api/lh-upstream/*` を **Policies でメソッド無差別に Bypass しない**（エッジ認証が効かなくなる）。line-crm Worker は `shouldBypassCloudflareAccessJwtForCorsPreflight`（`apps/worker/src/services/cloudflare-access-preflight-policy.ts`）で、**万一 `OPTIONS` がオリジンに届いたとき**に **JWT ゲートの手前で通過**させる（ローカル・検知用。Vitest・`scripts/check-encapsulation.mjs` で契約固定）。
  - **Access Application のパスを API に絞る（RSC プリフェッチ対策）:** 管理 UI と **同一ホスト**で Next（App Router）を動かすとき、Access の **Application に apex 全体 `https://example.com/*` を載せない**方が安全である。`next/link` のビューポート **prefetch** が **`*.txt?_rsc=…`** を叩き、それが Access のインタラクティブログインへ寄ると **OPTIONS が 403 → CORS 失敗 → Next が full page navigation** に倒れ、体感としてダッシュボードのループの起点になり得る。**推奨:** 保護パスを **`/api/lh-upstream/api/*`** のように **BFF 経由の Worker API だけ**に限定する（静的 `/_next/*`・ドキュメント HTML・RSC は別ポリシーで Bypass または保護外）。UI 側の保険は **`SafeLink`（既定 `prefetch={false}`）** を正本とする（`scripts/check-encapsulation.mjs` が `next/link` の直インポートを禁止）。
  - **`CLOUDFLARE_ACCESS_AUDIENCE` と AUD Tag:** Worker（または CI が注入する `wrangler`）の **`CLOUDFLARE_ACCESS_AUDIENCE`** は、該当 Access アプリケーションの **Application Audience (AUD) Tag** と **完全一致**させる。JWT の `aud` が **配列**でもよいが、期待値がずれると **毎レスポンス `Set-Cookie: CF_Authorization` が再発行**されやすく、遅延やログのノイズの原因になる。
  - **管理 API が 500 のとき:** ブラウザ本文だけでは原因が隠れる。upstream Worker で **`wrangler tail`** を取り、JSON の **`requestId`**（多くの場合 **CF-Ray** と一致）で `console.error` のスタックに突き合わせる。D1 未マイグレーションの典型は **`admin_principal_line_accounts` 欠落**で、現行 Worker は **503 + `ADMIN_PRINCIPAL_LINE_ACCOUNTS_SCHEMA`** を返し得る。
- **補足:** 公式どおり、**シークレット／プライベートウィンドウ**では `CF_Authorization` の扱いで切り分けが狂いやすい。本番確認は通常プロファイル推奨。トラブルシュート時は [CORS — Troubleshooting](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/#troubleshooting)（HAR とコンソールの同時取得など）も参照。
- **Vercel など別オリジンで `CF_Authorization` が `fetch` に載らないとき:** [Access CORS — Send authentication token with Cloudflare Worker](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/#send-authentication-token-with-cloudflare-worker) に沿い、**管理画面と同じホスト上**に `apps/admin-access-proxy-worker` をデプロイしルートを **`/api/lh-upstream/*`** にする。ブラウザは **`NEXT_PUBLIC_ADMIN_BROWSER_API_BASE`**（例: `https://your-admin.example.com/api/lh-upstream`）へだけ `fetch` し、プロキシが **サービストークン**で API Worker に中継する。API の Access アプリに **Service Auth（Service Token）** を追加し、line-crm Worker に **`CLOUDFLARE_ACCESS_TRUSTED_SERVICE_CLIENT_IDS`**（JWT の `common_name`）を設定する。**GitHub 運用:** リポジトリシークレット **`ADMIN_ACCESS_PROXY_CF_ACCESS_CLIENT_ID`** / **`ADMIN_ACCESS_PROXY_CF_ACCESS_CLIENT_SECRET`** → workflow **`deploy-admin-access-proxy.yml`** がデプロイ後に Worker secret を同期。line-crm 側は **`CLOUDFLARE_ACCESS_TRUSTED_SERVICE_CLIENT_IDS`** を **`deploy-worker.yml`** が `wrangler.toml` に注入（`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` は既存どおり）。

**LIFF の手動スモーク（ステージング推奨）**

- 先に `STAGING_WORKER_URL=https://… pnpm smoke:staging` で **openapi / docs** の HTTP を確認（自動）。
- 続いて LINE クライアント側で:
  1. 公式 LIFF から予約・エントリー等の導線を開き、**LINE ログイン**が完了する。
  2. ログイン後の遷移先が **意図したドメイン**のみである（任意 URL への飛び先がない）。
  3. ログイン済みで **プロフィール／紐付け**が表示・更新できる（`POST /api/liff/profile` は **ID トークン付き**。古い LIFF キャッシュに注意）。
  4. 別アカウントで **既存 UUID の乗っ取り**ができないこと。

## パッケージ

- `apps/worker` — Cloudflare Workers + Hono + Vitest
- `apps/admin-access-proxy-worker` — 任意: 管理画面と同オリジンの Access プロキシ（サービストークンで line-crm API へ）
- `apps/web` — Next.js + Vitest
- `packages/db`, `packages/shared`, `packages/line-sdk`

## 原則（1 行ずつ）

1. 品質は **型・テスト・CI** で強制する（プロンプトだけに頼らない）。
2. E2E と言う場合は **UI モック E2E と API 統合テスト** を混同しない（スキル参照）。
3. 同じミスが二度出たら **テストか ADR** を追加する。

## TypeScript 設計（短い要約）

- **クラスを使わない**（必要なら Error/SDK の薄い互換ラッパ程度）。基本は **関数 + 依存注入**。
- **DTO は Readonly**（ミューテーションは境界に閉じ込める）。例: Worker の `readJsonBodyWithLimit<T>` は `Promise<Readonly<T>>`。
- **データ型と振る舞いを分離**し、実行時の検証は関数で行う（型は消える）。
- **Branded Type** で ID 等の値オブジェクトを区別する（名義型ではない: **同じ公開プロパティだけ**の Post/User は型検査上区別されない）。

詳細・チェックリストは `/.cursor/skills/line/SKILL.md` の **「5.4.1 TypeScript 設計」** を正本とする。
