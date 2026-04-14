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
    headers.set('CF-Access-Client-Id', env.CF_ACCESS_CLIENT_ID);
    headers.set('CF-Access-Client-Secret', env.CF_ACCESS_CLIENT_SECRET);

    const init: RequestInit & { duplex?: 'half' } = {
      method: request.method,
      headers,
      redirect: 'manual',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
      init.duplex = 'half';
    }

    const res = await fetch(upstreamUrl, init);
    const out = new Response(res.body, res);
    out.headers.delete('set-cookie');
    return out;
  },
};
