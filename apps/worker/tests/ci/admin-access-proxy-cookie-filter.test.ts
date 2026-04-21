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

describe('admin-access-proxy-worker cookie boundary contract', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('strips CF_* cookies from request Cookie before forwarding upstream', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const req = new Request('https://admin.example.test/api/lh-upstream/api/friends', {
      method: 'GET',
      headers: {
        Cookie: 'CF_Authorization=a; lh_admin_session=sess; CF_Device=x; other=1',
      },
    });

    const res = await proxyFetch(req, baseEnv);
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const forwardedCookie =
      init.headers instanceof Headers ? init.headers.get('Cookie') : undefined;
    expect(forwardedCookie).toBe('lh_admin_session=sess; other=1');
  });

  it('drops CF_* Set-Cookie lines and forwards only app-owned cookies', async () => {
    globalThis.fetch = vi.fn(async () => {
      const h = new Headers({ 'Content-Type': 'application/json' });
      h.append('Set-Cookie', 'CF_Authorization=a; Secure; HttpOnly; SameSite=None; Path=/');
      h.append(
        'Set-Cookie',
        'lh_admin_session=x.y; HttpOnly; Secure; SameSite=None; Path=/; Domain=api.example.test',
      );
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: h });
    });

    const req = new Request('https://admin.example.test/api/lh-upstream/api/auth/session', {
      method: 'GET',
    });

    const res = await proxyFetch(req, baseEnv);
    expect(res.status).toBe(200);

    const anyH = res.headers as Headers & { getSetCookie?: () => string[] };
    const lines =
      typeof anyH.getSetCookie === 'function' && anyH.getSetCookie().length > 0
        ? anyH.getSetCookie()
        : (() => {
            const one = res.headers.get('Set-Cookie');
            return one ? [one] : [];
          })();

    expect(lines.join('\n')).not.toMatch(/CF_Authorization/i);
    expect(lines.join('\n')).toMatch(/lh_admin_session=/);
    // Domain stripped + Path forced by existing rewrite helper.
    expect(lines.join('\n')).not.toMatch(/domain=/i);
    expect(lines.join('\n')).toMatch(/path=\//i);
  });
});
