import { Hono } from 'hono';
import {
  getTrackedLinks,
  getTrackedLinkById,
  createTrackedLink,
  deleteTrackedLink,
  recordLinkClick,
  getLinkClicks,
} from '@line-crm/db';
import { addTagToFriend, enrollFriendInScenario } from '@line-crm/db';
import type { TrackedLink } from '@line-crm/db';
import type { Env } from '../index.js';
import {
  DEFAULT_TRACKED_LINK_TTL_SECONDS,
  issueTrackedLinkFriendToken,
  trackingLinkSigningSecret,
  verifyTrackedLinkFriendToken,
} from '../services/tracking-friend-token.js';
import { assertHttpsOutboundUrlResolvedSafe } from '../services/outbound-url-resolve.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';

const trackedLinks = new Hono<Env>();

const TRACKED_LINK_ORIGINAL_URL_ERROR =
  'originalUrl must be a public https URL (private IPs and localhost are not allowed)';

function serializeTrackedLink(row: TrackedLink, baseUrl: string) {
  return {
    id: row.id,
    name: row.name,
    originalUrl: row.original_url,
    trackingUrl: `${baseUrl}/t/${row.id}`,
    tagId: row.tag_id,
    scenarioId: row.scenario_id,
    isActive: Boolean(row.is_active),
    clickCount: row.click_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getBaseUrl(c: { req: { url: string } }): string {
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

// GET /api/tracked-links — list all
trackedLinks.get('/api/tracked-links', async (c) => {
  try {
    const items = await getTrackedLinks(c.env.DB);
    const base = getBaseUrl(c);
    return c.json({ success: true, data: items.map((item) => serializeTrackedLink(item, base)) });
  } catch (err) {
    console.error('GET /api/tracked-links error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/tracked-links/:id/personalized-url — signed ?f= for per-friend tracking (auth required)
trackedLinks.get('/api/tracked-links/:id/personalized-url', async (c) => {
  try {
    const friendId = c.req.query('friendId')?.trim();
    if (!friendId) {
      return c.json({ success: false, error: 'friendId query parameter is required' }, 400);
    }

    const id = c.req.param('id');
    const link = await getTrackedLinkById(c.env.DB, id);
    if (!link) {
      return c.json({ success: false, error: 'Tracked link not found' }, 404);
    }

    const secret = trackingLinkSigningSecret(c.env);
    const token = await issueTrackedLinkFriendToken(secret, {
      linkId: id,
      friendId,
    });
    const base = getBaseUrl(c);
    const url = `${base}/t/${encodeURIComponent(id)}?f=${encodeURIComponent(token)}`;
    const expiresAt = new Date(Date.now() + DEFAULT_TRACKED_LINK_TTL_SECONDS * 1000).toISOString();

    return c.json({
      success: true,
      data: { url, expiresAt },
    });
  } catch (err) {
    console.error('GET /api/tracked-links/:id/personalized-url error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/tracked-links/:id — get single with click details
trackedLinks.get('/api/tracked-links/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const link = await getTrackedLinkById(c.env.DB, id);
    if (!link) {
      return c.json({ success: false, error: 'Tracked link not found' }, 404);
    }
    const clicks = await getLinkClicks(c.env.DB, id);
    const base = getBaseUrl(c);
    return c.json({
      success: true,
      data: {
        ...serializeTrackedLink(link, base),
        clicks: clicks.map((click) => ({
          id: click.id,
          friendId: click.friend_id,
          friendDisplayName: click.friend_display_name,
          clickedAt: click.clicked_at,
        })),
      },
    });
  } catch (err) {
    console.error('GET /api/tracked-links/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/tracked-links — create
trackedLinks.post('/api/tracked-links', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<{
      name: string;
      originalUrl: string;
      tagId?: string | null;
      scenarioId?: string | null;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);

    const originalUrl = body.originalUrl?.trim() ?? '';
    if (!body.name || !originalUrl) {
      return c.json({ success: false, error: 'name and originalUrl are required' }, 400);
    }

    const outboundOk = await assertHttpsOutboundUrlResolvedSafe(originalUrl, fetch);
    if (!outboundOk.ok) {
      return c.json({ success: false, error: TRACKED_LINK_ORIGINAL_URL_ERROR }, 400);
    }

    const link = await createTrackedLink(c.env.DB, {
      name: body.name,
      originalUrl,
      tagId: body.tagId ?? null,
      scenarioId: body.scenarioId ?? null,
    });

    const base = getBaseUrl(c);
    return c.json({ success: true, data: serializeTrackedLink(link, base) }, 201);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/tracked-links error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/tracked-links/:id
trackedLinks.delete('/api/tracked-links/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const link = await getTrackedLinkById(c.env.DB, id);
    if (!link) {
      return c.json({ success: false, error: 'Tracked link not found' }, 404);
    }
    await deleteTrackedLink(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/tracked-links/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /t/:linkId — click tracking redirect (no auth, fast redirect)
trackedLinks.get('/t/:linkId', async (c) => {
  const linkId = c.req.param('linkId');
  const fParam = c.req.query('f')?.trim() ?? '';

  // Look up the link first
  const link = await getTrackedLinkById(c.env.DB, linkId);

  if (!link || !link.is_active) {
    return c.json({ success: false, error: 'Link not found' }, 404);
  }

  const outboundOk = await assertHttpsOutboundUrlResolvedSafe(link.original_url, fetch);
  if (!outboundOk.ok) {
    return c.json({ success: false, error: 'Link not found' }, 404);
  }

  const secret = trackingLinkSigningSecret(c.env);
  let verifiedFriendId: string | null = null;
  if (fParam) {
    verifiedFriendId = await verifyTrackedLinkFriendToken(secret, linkId, fParam);
  }

  // Redirect immediately, run side-effects async
  const trackClick = async () => {
    try {
      // Record the click (friend only when cryptographically bound to this link)
      await recordLinkClick(c.env.DB, linkId, verifiedFriendId);

      // Run automatic actions if a friend is identified
      if (verifiedFriendId) {
        const actions: Promise<unknown>[] = [];

        if (link.tag_id) {
          actions.push(addTagToFriend(c.env.DB, verifiedFriendId, link.tag_id));
        }

        if (link.scenario_id) {
          actions.push(enrollFriendInScenario(c.env.DB, verifiedFriendId, link.scenario_id));
        }

        if (actions.length > 0) {
          await Promise.allSettled(actions);
        }
      }
    } catch (err) {
      console.error(`/t/${linkId} async tracking error:`, err);
    }
  };

  try {
    const executionCtx = c.executionCtx as ExecutionContext;
    executionCtx.waitUntil(trackClick());
  } catch {
    await trackClick();
  }

  return c.redirect(link.original_url, 302);
});

export { trackedLinks };
