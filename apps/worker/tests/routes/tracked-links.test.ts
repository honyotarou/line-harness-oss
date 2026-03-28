import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('tracked link routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('redirects without an execution context and still applies click side effects', async () => {
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

    const { trackedLinks } = await import('../../src/routes/tracked-links.js');
    const app = new Hono();
    app.route('/', trackedLinks);

    const response = await app.fetch(
      new Request('http://localhost/t/link-1?f=friend-1'),
      { DB: {} as D1Database } as never,
    );

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
});
