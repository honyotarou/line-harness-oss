import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { issueAdminSessionToken } from '../../src/services/admin-session.js';
import {
  issueTrackedLinkFriendToken,
  verifyTrackedLinkFriendToken,
} from '../../src/services/tracking-friend-token.js';

const dbMocks = vi.hoisted(() => ({
  getTrackedLinks: vi.fn(),
  getTrackedLinkById: vi.fn(),
  createTrackedLink: vi.fn(),
  deleteTrackedLink: vi.fn(),
  recordLinkClick: vi.fn(),
  getLinkClicks: vi.fn(),
  addTagToFriend: vi.fn(),
  enrollFriendInScenario: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

const API_KEY = 'test-api-key-for-tracking';

describe('tracked link routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('cloudflare-dns.com/dns-query')) {
          return new Response(
            JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }),
            { status: 200, headers: { 'Content-Type': 'application/dns-json' } },
          );
        }
        return new Response('', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects without an execution context and records anonymous click when f is omitted', async () => {
    dbMocks.getTrackedLinkById.mockResolvedValue({
      id: 'link-1',
      name: 'Promo',
      original_url: 'https://example.com/offer',
      tag_id: 'tag-1',
      scenario_id: 'scenario-1',
      is_active: 1,
      click_count: 0,
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });
    dbMocks.recordLinkClick.mockResolvedValue({
      id: 'click-1',
      tracked_link_id: 'link-1',
      friend_id: null,
      clicked_at: '2026-03-26T10:00:00+09:00',
    });

    const { trackedLinks } = await import('../../src/routes/tracked-links.js');
    const app = new Hono();
    app.route('/', trackedLinks);

    const response = await app.fetch(new Request('http://localhost/t/link-1'), {
      DB: {} as D1Database,
      API_KEY,
    } as never);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://example.com/offer');
    expect(dbMocks.recordLinkClick).toHaveBeenCalledWith(expect.anything(), 'link-1', null);
    expect(dbMocks.addTagToFriend).not.toHaveBeenCalled();
    expect(dbMocks.enrollFriendInScenario).not.toHaveBeenCalled();
  });

  it('ignores raw friend UUID in f= (no tag/scenario side effects; records anonymous click)', async () => {
    dbMocks.getTrackedLinkById.mockResolvedValue({
      id: 'link-1',
      name: 'Promo',
      original_url: 'https://example.com/offer',
      tag_id: 'tag-1',
      scenario_id: 'scenario-1',
      is_active: 1,
      click_count: 0,
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });
    dbMocks.recordLinkClick.mockResolvedValue({
      id: 'click-1',
      tracked_link_id: 'link-1',
      friend_id: null,
      clicked_at: '2026-03-26T10:00:00+09:00',
    });

    const { trackedLinks } = await import('../../src/routes/tracked-links.js');
    const app = new Hono();
    app.route('/', trackedLinks);

    const response = await app.fetch(new Request('http://localhost/t/link-1?f=friend-1'), {
      DB: {} as D1Database,
      API_KEY,
    } as never);

    expect(response.status).toBe(302);
    expect(dbMocks.recordLinkClick).toHaveBeenCalledWith(expect.anything(), 'link-1', null);
    expect(dbMocks.addTagToFriend).not.toHaveBeenCalled();
    expect(dbMocks.enrollFriendInScenario).not.toHaveBeenCalled();
  });

  it('applies click side effects when f is a valid signed token for this link', async () => {
    dbMocks.getTrackedLinkById.mockResolvedValue({
      id: 'link-1',
      name: 'Promo',
      original_url: 'https://example.com/offer',
      tag_id: 'tag-1',
      scenario_id: 'scenario-1',
      is_active: 1,
      click_count: 0,
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });
    dbMocks.recordLinkClick.mockResolvedValue({
      id: 'click-1',
      tracked_link_id: 'link-1',
      friend_id: 'friend-1',
      clicked_at: '2026-03-26T10:00:00+09:00',
    });
    dbMocks.addTagToFriend.mockResolvedValue(undefined);
    dbMocks.enrollFriendInScenario.mockResolvedValue(undefined);

    const token = await issueTrackedLinkFriendToken(API_KEY, {
      linkId: 'link-1',
      friendId: 'friend-1',
      expiresInSeconds: 3600,
    });
    const f = encodeURIComponent(token);

    const { trackedLinks } = await import('../../src/routes/tracked-links.js');
    const app = new Hono();
    app.route('/', trackedLinks);

    const response = await app.fetch(new Request(`http://localhost/t/link-1?f=${f}`), {
      DB: {} as D1Database,
      API_KEY,
    } as never);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://example.com/offer');
    expect(dbMocks.recordLinkClick).toHaveBeenCalledWith(expect.anything(), 'link-1', 'friend-1');
    expect(dbMocks.addTagToFriend).toHaveBeenCalledWith(expect.anything(), 'friend-1', 'tag-1');
    expect(dbMocks.enrollFriendInScenario).toHaveBeenCalledWith(
      expect.anything(),
      'friend-1',
      'scenario-1',
    );
  });

  it('GET /api/tracked-links/:id/personalized-url returns signed tracking URL', async () => {
    dbMocks.getTrackedLinkById.mockResolvedValue({
      id: 'link-1',
      name: 'Promo',
      original_url: 'https://example.com/offer',
      tag_id: null,
      scenario_id: null,
      is_active: 1,
      click_count: 0,
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });

    const { trackedLinks } = await import('../../src/routes/tracked-links.js');
    const app = new Hono();
    app.route('/', trackedLinks);

    const res = await app.fetch(
      new Request('http://localhost/api/tracked-links/link-1/personalized-url?friendId=friend-99'),
      { DB: {} as D1Database, API_KEY } as never,
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { url: string; expiresAt: string };
    };
    expect(json.success).toBe(true);
    expect(json.data.url).toMatch(/^http:\/\/localhost\/t\/link-1\?f=/);
    const u = new URL(json.data.url);
    const f = u.searchParams.get('f');
    expect(f).toBeTruthy();
    const verified = await verifyTrackedLinkFriendToken(API_KEY, 'link-1', f!);
    expect(verified).toBe('friend-99');
  });

  it('POST /api/tracked-links rejects javascript: originalUrl', async () => {
    const token = await issueAdminSessionToken(API_KEY, {
      issuedAt: 1_700_000_000,
      expiresInSeconds: 3600,
    });
    const { trackedLinks } = await import('../../src/routes/tracked-links.js');
    const app = new Hono();
    app.route('/', trackedLinks);

    const res = await app.fetch(
      new Request('http://localhost/api/tracked-links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Bad',
          originalUrl: 'javascript:alert(1)',
        }),
      }),
      { DB: {} as D1Database, API_KEY } as never,
    );

    expect(res.status).toBe(400);
    expect(dbMocks.createTrackedLink).not.toHaveBeenCalled();
  });

  it('POST /api/tracked-links stores trimmed https originalUrl', async () => {
    const token = await issueAdminSessionToken(API_KEY, {
      issuedAt: 1_700_000_000,
      expiresInSeconds: 3600,
    });
    dbMocks.createTrackedLink.mockResolvedValue({
      id: 'new-link',
      name: 'Ok',
      original_url: 'https://example.com/x',
      tag_id: null,
      scenario_id: null,
      is_active: 1,
      click_count: 0,
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });

    const { trackedLinks } = await import('../../src/routes/tracked-links.js');
    const app = new Hono();
    app.route('/', trackedLinks);

    const res = await app.fetch(
      new Request('http://localhost/api/tracked-links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Ok',
          originalUrl: '  https://example.com/x  ',
        }),
      }),
      { DB: {} as D1Database, API_KEY } as never,
    );

    expect(res.status).toBe(201);
    expect(dbMocks.createTrackedLink).toHaveBeenCalledWith(expect.anything(), {
      name: 'Ok',
      originalUrl: 'https://example.com/x',
      tagId: null,
      scenarioId: null,
    });
  });

  it('GET /t/:id returns 404 when stored original_url is not a safe https target', async () => {
    dbMocks.getTrackedLinkById.mockResolvedValue({
      id: 'link-1',
      name: 'Legacy',
      original_url: 'javascript:evil()',
      tag_id: null,
      scenario_id: null,
      is_active: 1,
      click_count: 0,
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });

    const { trackedLinks } = await import('../../src/routes/tracked-links.js');
    const app = new Hono();
    app.route('/', trackedLinks);

    const response = await app.fetch(new Request('http://localhost/t/link-1'), {
      DB: {} as D1Database,
      API_KEY,
    } as never);

    expect(response.status).toBe(404);
    expect(dbMocks.recordLinkClick).not.toHaveBeenCalled();
  });

  it('GET /t/:id returns 404 when DNS resolves the hostname to a private address', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('cloudflare-dns.com/dns-query')) {
          return new Response(
            JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '192.168.1.1' }] }),
            { status: 200, headers: { 'Content-Type': 'application/dns-json' } },
          );
        }
        return new Response('', { status: 404 });
      }),
    );

    dbMocks.getTrackedLinkById.mockResolvedValue({
      id: 'link-1',
      name: 'Promo',
      original_url: 'https://evil-dns.example/offer',
      tag_id: 'tag-1',
      scenario_id: 'scenario-1',
      is_active: 1,
      click_count: 0,
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });

    const { trackedLinks } = await import('../../src/routes/tracked-links.js');
    const app = new Hono();
    app.route('/', trackedLinks);

    const response = await app.fetch(new Request('http://localhost/t/link-1'), {
      DB: {} as D1Database,
      API_KEY,
    } as never);

    expect(response.status).toBe(404);
    expect(dbMocks.recordLinkClick).not.toHaveBeenCalled();
  });
});
