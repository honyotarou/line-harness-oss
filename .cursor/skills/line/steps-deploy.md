# LINE Harness — 構築・デプロイ各ステップ詳細

親メニューは [SKILL.md](SKILL.md) の **Step 12**。正本の手順は **`docs/wiki/Getting-Started.md`** も併読。

## Cursor / Composer で実行するとき

- **Step 12** を選ばれたら、下記 **0→9 を順に**進める（「番号を選んで」とユーザーに待たない）。
- **`wrangler secret put` と Vercel の環境変数**は対話プロンプトまたはダッシュボードが必要。秘密をチャットに貼らせないよう注意喚起する。
- **Hooks は無い**（Composer）ので、区切りで `pnpm format` / `pnpm harness` を実行する。

## 0 — 前提・方針確認

- **Node 20+**, **pnpm 9+**, **Cloudflare**（D1 / Workers）, **LINE Developers**（Messaging API + LINE Login）
- 完了は **コマンド・テスト**で示す。[Harness Engineering（2026）](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/)

## 1 — リポジトリ準備

```bash
pnpm install
pnpm build:libs
```

`build:libs` は `@line-crm/shared` と `@line-crm/line-sdk` の `dist` を生成。Wrangler バンドル前に必要。

## 2 — D1 + スキーマ

```bash
npx wrangler d1 create line-crm
```

`apps/worker/wrangler.toml`（または `wrangler.local.toml`）の `database_id` を実 UUID に置き換える。

```bash
pnpm db:migrate
pnpm db:migrate:local
```

## 3 — Worker シークレット

**必ず `apps/worker` をカレントに**：

```bash
cd apps/worker
pnpm exec wrangler secret put LINE_CHANNEL_SECRET
pnpm exec wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
pnpm exec wrangler secret put API_KEY
pnpm exec wrangler secret put LINE_LOGIN_CHANNEL_ID
pnpm exec wrangler secret put LINE_LOGIN_CHANNEL_SECRET
pnpm exec wrangler secret put LIFF_URL
```

## 4 — Worker デプロイ

```bash
cd /path/to/repo/root
pnpm deploy:worker
```

## 5 — LINE コンソール

Messaging Webhook、Login と公式アカウントのリンク、LIFF、コールバック URL（Getting Started 参照）。

## 6 — LIFF（Vercel）

`VITE_LIFF_ID`, `VITE_API_URL`, `VITE_BOT_BASIC_ID`。変更後は再デプロイ。

## 7 — 管理画面（Vercel）

`NEXT_PUBLIC_API_URL`、Worker の `WEB_URL` / CORS。`Getting-Started.md` のモノレポ設定参照。

## 8 — 動作確認

```bash
curl -sS "https://<worker>/api/friends" -H "Authorization: Bearer <API_KEY>"
STAGING_WORKER_URL=https://... pnpm smoke:staging
```

## 9 — 品質ゲート（リリース前）

```bash
pnpm harness:full
```

CI と揃えるなら `pnpm harness:ci`。

---

**API 統合ローカル:** `pnpm test:api`（`build:libs` 済み・Hurl 必須）。
