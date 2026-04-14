# Admin Access proxy Worker

Implements Cloudflare’s [“Send authentication token with Cloudflare Worker”](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/#send-authentication-token-with-cloudflare-worker) pattern: the browser calls **only** the same origin (`https://your-admin-host/api/lh-upstream/...`); this Worker adds **Access service token** headers and forwards to `line-crm-worker`.

## Deploy

1. `pnpm install` at repo root; `pnpm --filter @line-crm/shared build`.
2. Default `wrangler.toml` uses `YOUR_UPSTREAM_API_ORIGIN`; **GitHub** optional secrets `ADMIN_ACCESS_PROXY_UPSTREAM_ORIGIN`, `ADMIN_ACCESS_PROXY_ROUTE_PATTERN`, `ADMIN_ACCESS_PROXY_ZONE_NAME` are injected by `deploy-admin-access-proxy.yml` before deploy. Or set vars / routes in the dashboard.
3. **GitHub:** set secrets `ADMIN_ACCESS_PROXY_CF_ACCESS_CLIENT_ID` / `ADMIN_ACCESS_PROXY_CF_ACCESS_CLIENT_SECRET` and run `.github/workflows/deploy-admin-access-proxy.yml` (syncs after deploy). **Or** locally: `pnpm exec wrangler secret put CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`.
4. If you did not inject a route via CI, add a **Route** on your **admin** zone: e.g. `your-admin.com/api/lh-upstream/*` → this Worker.
5. **Zero Trust:** protect the **admin** hostname (so only your IdP users hit this Worker). On the **API** app, add **Service Auth — Service Token** for the same service token.
6. On **line-crm-worker**, set `CLOUDFLARE_ACCESS_TRUSTED_SERVICE_CLIENT_IDS` to the token’s client id (`*.access` from JWT `common_name`). **GitHub:** repository secret `CLOUDFLARE_ACCESS_TRUSTED_SERVICE_CLIENT_IDS` → injected by `deploy-worker.yml`.

## Web

Set `NEXT_PUBLIC_ADMIN_BROWSER_API_BASE=https://your-admin.com/api/lh-upstream` and keep `NEXT_PUBLIC_API_URL` as the public Worker URL for LIFF links.
