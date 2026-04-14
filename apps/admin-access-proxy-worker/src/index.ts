import {
  isEligibleWorkerAdminProxyTargetPath,
  stripAdminAccessProxyPrefix,
} from '@line-crm/shared';

export interface Env {
  UPSTREAM_API_ORIGIN: string;
  PATH_PREFIX: string;
  CF_ACCESS_CLIENT_ID: string;
  CF_ACCESS_CLIENT_SECRET: string;
}

const HOP_HEADERS = new Set(
  [
    'cf-connecting-ip',
    'cf-ray',
    'cf-visitor',
    'cf-access-client-id',
    'cf-access-client-secret',
    'cf-access-jwt-assertion',
    'host',
    'connection',
    'content-length',
  ].map((s) => s.toLowerCase()),
);

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

    const origin = env.UPSTREAM_API_ORIGIN.replace(/\/+$/, '');
    const upstreamUrl = `${origin}${stripped}${url.search}`;

    const headers = new Headers();
    for (const [k, v] of request.headers) {
      if (HOP_HEADERS.has(k.toLowerCase())) {
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
    // Upstream Access login redirects break browser fetch (cross-origin redirect + no CORS).
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('Location') ?? '';
      if (loc.includes('cloudflareaccess.com') && loc.includes('access/login')) {
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
    const out = new Response(res.body, res);
    out.headers.delete('set-cookie');
    return out;
  },
};
