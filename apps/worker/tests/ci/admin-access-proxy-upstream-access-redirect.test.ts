import { afterEach, describe, expect, it, vi } from 'vitest';
import proxy, { type Env } from '../../../admin-access-proxy-worker/src/index.js';

const { fetch: proxyFetch } = proxy as {
  fetch: (request: Request, env: Env, ctx?: ExecutionContext) => Promise<Response>;
};

const baseEnv: Env = {
  UPSTREAM_API_ORIGIN: 'https://api.example.test',
  PATH_PREFIX: '/api/lh-upstream',
  CF_ACCESS_CLIENT_ID: 'test-client-id',
  CF_ACCESS_CLIENT_SECRET: 'test-client-secret',
};

function req(pathWithQuery = '/api/lh-upstream/api/health', host = 'https://admin.example.test') {
  return new Request(`${host}${pathWithQuery}`, { method: 'GET' });
}

describe('admin-access-proxy-worker fetch (upstream Access login → 502 JSON)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns 503 when service token secrets are missing', async () => {
    globalThis.fetch = vi.fn();
    const res = await proxyFetch(req(), {
      ...baseEnv,
      CF_ACCESS_CLIENT_ID: '',
      CF_ACCESS_CLIENT_SECRET: '',
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(String(body.error)).toMatch(/CF_ACCESS_CLIENT/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns 503 when UPSTREAM_API_ORIGIN is still the repo placeholder (misdeploy / unset GitHub secret)', async () => {
    globalThis.fetch = vi.fn();
    const res = await proxyFetch(
      req('/api/lh-upstream/api/auth/access-bootstrap?returnTo=%2Flogin'),
      {
        ...baseEnv,
        UPSTREAM_API_ORIGIN: 'https://YOUR_UPSTREAM_API_ORIGIN',
      },
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(String(body.error)).toMatch(/UPSTREAM_API_ORIGIN/);
    expect(String(body.error)).toMatch(/ADMIN_ACCESS_PROXY_UPSTREAM_ORIGIN/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns 503 when UPSTREAM_API_ORIGIN is empty', async () => {
    globalThis.fetch = vi.fn();
    const res = await proxyFetch(req(), { ...baseEnv, UPSTREAM_API_ORIGIN: '   ' });
    expect(res.status).toBe(503);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('allows http://127.0.0.1 upstream for local wrangler dev', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const res = await proxyFetch(req(), {
      ...baseEnv,
      UPSTREAM_API_ORIGIN: 'http://127.0.0.1:8787',
    });
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('maps upstream Access application login redirect to 502 JSON (not forwarded to browser)', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(null, {
        status: 302,
        headers: {
          Location: 'https://honyonn.cloudflareaccess.com/cdn-cgi/access/login/callback',
        },
      });
    });

    const res = await proxyFetch(req(), baseEnv);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(String(body.error)).toMatch(/API Access did not accept the service token/);
    expect(String(body.error)).toMatch(/CLOUDFLARE_ACCESS_TRUSTED_SERVICE_CLIENT_IDS/);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(init.redirect).toBe('manual');
  });

  it('forwards non-Access 3xx responses to the caller unchanged', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://api.example.test/other' },
      });
    });

    const res = await proxyFetch(req(), baseEnv);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://api.example.test/other');
  });

  it('forwards upstream 200 responses', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const res = await proxyFetch(req(), baseEnv);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rewrites Set-Cookie Domain/Path for browser admin origin', async () => {
    globalThis.fetch = vi.fn(async () => {
      const h = new Headers({ 'Content-Type': 'application/json' });
      h.append(
        'Set-Cookie',
        'lh_admin_session=x.y; HttpOnly; Secure; SameSite=None; Path=/; Domain=api.example.test',
      );
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: h });
    });

    const res = await proxyFetch(req(), baseEnv);
    const anyH = res.headers as Headers & { getSetCookie?: () => string[] };
    const lines =
      typeof anyH.getSetCookie === 'function' && anyH.getSetCookie().length > 0
        ? anyH.getSetCookie()
        : (() => {
            const one = res.headers.get('Set-Cookie');
            return one ? [one] : [];
          })();
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0]).toContain('lh_admin_session=x.y');
    expect(lines[0]).toContain('Path=/');
    expect(lines[0]).not.toMatch(/domain=/i);
  });
});
