import {
  isCloudflareAccessApplicationLoginRedirect,
  isEligibleWorkerAdminProxyTargetPath,
  rewriteSetCookieLineForAdminBrowserOrigin,
  stripAdminAccessProxyPrefix,
} from '@line-crm/shared';
import { STRIP_REQUEST_HOP_BY_HOP_HEADERS } from './hop-headers.js';

export interface Env {
  UPSTREAM_API_ORIGIN: string;
  PATH_PREFIX: string;
  CF_ACCESS_CLIENT_ID: string;
  CF_ACCESS_CLIENT_SECRET: string;
}

export { STRIP_REQUEST_HOP_BY_HOP_HEADERS } from './hop-headers.js';

const DEFAULT_RETURN_TO = '/login';
/** Same-origin relative path only (open-redirect mitigation for Access bootstrap redirect). */
const SAFE_RELATIVE_RETURN_TO = /^\/(?!\/)[^\s\\]{0,255}$/;
function sanitizeAccessBootstrapReturnTo(raw: string | undefined): string {
  if (raw === undefined) return DEFAULT_RETURN_TO;
  const t = raw.trim();
  if (!t) return DEFAULT_RETURN_TO;
  if (t.length > 256) return DEFAULT_RETURN_TO;
  if (!SAFE_RELATIVE_RETURN_TO.test(t)) return DEFAULT_RETURN_TO;
  if (t.includes('..')) return DEFAULT_RETURN_TO;
  return t;
}

function isLocalDevHttpHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function isUpstreamOriginConfigured(origin: string): boolean {
  const t = origin.trim();
  if (!t) {
    return false;
  }
  // Commit placeholder + deploy-admin-access-proxy.yml sed target; never call fetch with it.
  if (t.includes('YOUR_UPSTREAM_API_ORIGIN')) {
    return false;
  }
  try {
    const u = new URL(t);
    if (u.protocol === 'https:') {
      return true;
    }
    if (u.protocol === 'http:' && isLocalDevHttpHostname(u.hostname)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function forwardedUpstreamResponse(res: Response): Response {
  const out = new Headers();
  res.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      return;
    }
    out.append(key, value);
  });
  const hdrs = res.headers as Headers & { getSetCookie?: () => string[] };
  const setLines =
    typeof hdrs.getSetCookie === 'function' && hdrs.getSetCookie().length > 0
      ? hdrs.getSetCookie()
      : (() => {
          const one = res.headers.get('Set-Cookie');
          return one ? [one] : [];
        })();
  for (const line of setLines) {
    out.append('Set-Cookie', rewriteSetCookieLineForAdminBrowserOrigin(line));
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: out,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const prefix = (env.PATH_PREFIX || '/api/lh-upstream').replace(/\/+$/, '');
    const stripped = stripAdminAccessProxyPrefix(url.pathname, prefix);
    if (stripped === null) {
      return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!isEligibleWorkerAdminProxyTargetPath(stripped)) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden path' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    /**
     * `GET /api/auth/access-bootstrap` is a top-level-navigation helper for Cloudflare Access.
     * Handle it locally so it never depends on upstream rewrites / auth exemptions.
     */
    if (request.method === 'GET' && stripped === '/api/auth/access-bootstrap') {
      const returnTo = sanitizeAccessBootstrapReturnTo(
        url.searchParams.get('returnTo') ?? undefined,
      );
      // `Response.redirect` rejects relative URLs in some runtimes; emit Location manually.
      return new Response(null, { status: 302, headers: { Location: returnTo } });
    }

    const origin = env.UPSTREAM_API_ORIGIN.replace(/\/+$/, '');
    if (!isUpstreamOriginConfigured(origin)) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Proxy misconfigured: UPSTREAM_API_ORIGIN is missing, invalid, or still the repo placeholder (set GitHub Secret ADMIN_ACCESS_PROXY_UPSTREAM_ORIGIN to your line-crm API origin, e.g. https://api.example.com, then redeploy this Worker).',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const upstreamUrl = `${origin}${stripped}${url.search}`;

    const headers = new Headers();
    for (const [k, v] of request.headers) {
      if (STRIP_REQUEST_HOP_BY_HOP_HEADERS.has(k.toLowerCase())) {
        continue;
      }
      headers.set(k, v);
    }
    const id = env.CF_ACCESS_CLIENT_ID?.trim() ?? '';
    const secret = env.CF_ACCESS_CLIENT_SECRET?.trim() ?? '';
    if (!id || !secret) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Proxy misconfigured: CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET are missing (set Worker secrets or GitHub Actions secrets).',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }
    headers.set('CF-Access-Client-Id', id);
    headers.set('CF-Access-Client-Secret', secret);

    const method = request.method;
    const init: RequestInit & { duplex?: 'half' } = {
      method,
      headers,
      redirect: 'manual',
    };
    // OPTIONS must not use a streaming body / duplex; omit body for read-only methods.
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      init.body = request.body;
      init.duplex = 'half';
    }

    const res = await fetch(upstreamUrl, init);
    // Upstream Access login redirects break browser fetch (cross-origin redirect + no CORS on Access host).
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('Location');
      if (isCloudflareAccessApplicationLoginRedirect(loc, upstreamUrl)) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              'API Access did not accept the service token (see JWT meta service_token_status). Check: (1) Worker secrets match the Service Token, (2) line-crm-api policy allows that token, (3) CLOUDFLARE_ACCESS_TRUSTED_SERVICE_CLIENT_IDS on line-crm Worker.',
          }),
          { status: 502, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }
    // Forward upstream `Set-Cookie` so the browser can store `lh_admin_session` on this origin.
    // Rewrite Domain/Path so cookies are not scoped to the upstream Worker hostname.
    return forwardedUpstreamResponse(res);
  },
};
