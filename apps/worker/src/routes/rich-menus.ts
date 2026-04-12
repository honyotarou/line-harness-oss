import { Hono } from 'hono';
import { LineClient, type RichMenuObject } from '@line-crm/line-sdk';
import { getFriendById } from '@line-crm/db';
import type { Env } from '../index.js';
import { lineAccountDbOptions } from '../services/line-account-at-rest-key.js';
import {
  resolveLineAccessTokenForFriend,
  resolveLineAccessTokenForLineAccountId,
} from '../services/line-account-routing.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  RICH_MENU_IMAGE_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import {
  resolveLineAccountScopeForRequest,
  resourceLineAccountVisibleInScope,
  validateScopedLineAccountBody,
  validateScopedLineAccountQueryParam,
} from '../services/admin-line-account-scope.js';

const richMenus = new Hono<Env>();

// GET /api/rich-menus — list all rich menus from LINE API
richMenus.get('/api/rich-menus', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const lineAccountId = c.req.query('lineAccountId');
    const q = validateScopedLineAccountQueryParam(scope, lineAccountId);
    if (!q.ok) {
      return c.json({ success: false, error: q.error }, q.status);
    }
    const accessToken = await resolveLineAccessTokenForLineAccountId(
      c.env.DB,
      c.env.LINE_CHANNEL_ACCESS_TOKEN,
      lineAccountId ?? null,
      lineAccountDbOptions(c.env),
    );
    const lineClient = new LineClient(accessToken);
    const result = await lineClient.getRichMenuList();
    return c.json({ success: true, data: result.richmenus ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('GET /api/rich-menus error:', message);
    return c.json({ success: false, error: `Failed to fetch rich menus: ${message}` }, 500);
  }
});

// POST /api/rich-menus — create a rich menu via LINE API
richMenus.post('/api/rich-menus', async (c) => {
  try {
    const scopePost = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    const lineAccountIdFromBody =
      typeof body.lineAccountId === 'string' ? body.lineAccountId : null;
    const scopedBody = validateScopedLineAccountBody(scopePost, lineAccountIdFromBody);
    if (!scopedBody.ok) {
      return c.json({ success: false, error: scopedBody.error }, scopedBody.status);
    }
    const effectiveLineAccountId = scopedBody.lineAccountId;
    const { lineAccountId: _discard, ...menuRest } = body;
    const menuPayload = menuRest as unknown as RichMenuObject;

    // Policy: do not allow `tel:` links in rich menus (phone should not be shown there).
    const areas = (menuPayload as { areas?: unknown }).areas;
    if (Array.isArray(areas)) {
      for (const area of areas as Array<{ action?: { type?: string; uri?: string } }>) {
        const uri = area?.action?.type === 'uri' ? area.action.uri : undefined;
        if (typeof uri === 'string' && uri.trim().toLowerCase().startsWith('tel:')) {
          return c.json(
            {
              success: false,
              error:
                'Rich menu policy: `tel:` links are not allowed. Use reservation / chat consult instead.',
            },
            400,
          );
        }
      }
    }

    const accessToken = await resolveLineAccessTokenForLineAccountId(
      c.env.DB,
      c.env.LINE_CHANNEL_ACCESS_TOKEN,
      effectiveLineAccountId,
      lineAccountDbOptions(c.env),
    );
    const lineClient = new LineClient(accessToken);
    const result = await lineClient.createRichMenu(menuPayload);
    return c.json({ success: true, data: result }, 201);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/rich-menus error:', message);
    return c.json({ success: false, error: `Failed to create rich menu: ${message}` }, 500);
  }
});

// DELETE /api/rich-menus/:id — delete a rich menu
richMenus.delete('/api/rich-menus/:id', async (c) => {
  try {
    const richMenuId = c.req.param('id');
    const scopeDel = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const lineAccountId = c.req.query('lineAccountId');
    const qDel = validateScopedLineAccountQueryParam(scopeDel, lineAccountId);
    if (!qDel.ok) {
      return c.json({ success: false, error: qDel.error }, qDel.status);
    }
    const accessToken = await resolveLineAccessTokenForLineAccountId(
      c.env.DB,
      c.env.LINE_CHANNEL_ACCESS_TOKEN,
      lineAccountId ?? null,
      lineAccountDbOptions(c.env),
    );
    const lineClient = new LineClient(accessToken);
    await lineClient.deleteRichMenu(richMenuId);
    return c.json({ success: true, data: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('DELETE /api/rich-menus/:id error:', message);
    return c.json({ success: false, error: `Failed to delete rich menu: ${message}` }, 500);
  }
});

// POST /api/rich-menus/:id/default — set rich menu as default for all users
richMenus.post('/api/rich-menus/:id/default', async (c) => {
  try {
    const richMenuId = c.req.param('id');
    const scopeDef = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const lineAccountId = c.req.query('lineAccountId');
    const qDef = validateScopedLineAccountQueryParam(scopeDef, lineAccountId);
    if (!qDef.ok) {
      return c.json({ success: false, error: qDef.error }, qDef.status);
    }
    const accessToken = await resolveLineAccessTokenForLineAccountId(
      c.env.DB,
      c.env.LINE_CHANNEL_ACCESS_TOKEN,
      lineAccountId ?? null,
      lineAccountDbOptions(c.env),
    );
    const lineClient = new LineClient(accessToken);
    await lineClient.setDefaultRichMenu(richMenuId);
    return c.json({ success: true, data: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/rich-menus/:id/default error:', message);
    return c.json({ success: false, error: `Failed to set default rich menu: ${message}` }, 500);
  }
});

// POST /api/friends/:friendId/rich-menu — link rich menu to a specific friend
richMenus.post('/api/friends/:friendId/rich-menu', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const body = await readJsonBodyWithLimit<{ richMenuId: string }>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );

    if (!body.richMenuId) {
      return c.json({ success: false, error: 'richMenuId is required' }, 400);
    }

    const db = c.env.DB;
    const friend = await getFriendById(db, friendId);
    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }
    const scopeLink = await resolveLineAccountScopeForRequest(db, c);
    if (!resourceLineAccountVisibleInScope(scopeLink, friend.line_account_id)) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    const accessToken = await resolveLineAccessTokenForFriend(
      db,
      c.env.LINE_CHANNEL_ACCESS_TOKEN,
      friendId,
      lineAccountDbOptions(c.env),
    );
    const lineClient = new LineClient(accessToken);
    await lineClient.linkRichMenuToUser(friend.line_user_id, body.richMenuId);

    return c.json({ success: true, data: null });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/friends/:friendId/rich-menu error:', message);
    return c.json({ success: false, error: `Failed to link rich menu to friend: ${message}` }, 500);
  }
});

// DELETE /api/friends/:friendId/rich-menu — unlink rich menu from a specific friend
richMenus.delete('/api/friends/:friendId/rich-menu', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const db = c.env.DB;

    const friend = await getFriendById(db, friendId);
    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }
    const scopeUnlink = await resolveLineAccountScopeForRequest(db, c);
    if (!resourceLineAccountVisibleInScope(scopeUnlink, friend.line_account_id)) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    const accessToken = await resolveLineAccessTokenForFriend(
      db,
      c.env.LINE_CHANNEL_ACCESS_TOKEN,
      friendId,
      lineAccountDbOptions(c.env),
    );
    const lineClient = new LineClient(accessToken);
    await lineClient.unlinkRichMenuFromUser(friend.line_user_id);

    return c.json({ success: true, data: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('DELETE /api/friends/:friendId/rich-menu error:', message);
    return c.json(
      { success: false, error: `Failed to unlink rich menu from friend: ${message}` },
      500,
    );
  }
});

export { richMenus };

function richMenuImageBytesMatchFormat(
  buf: ArrayBuffer,
  kind: 'image/png' | 'image/jpeg',
): boolean {
  const u = new Uint8Array(buf);
  if (u.byteLength < 8) return false;
  if (kind === 'image/png') {
    return u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47;
  }
  return u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff;
}

// POST /api/rich-menus/:id/image — upload rich menu image (accepts base64 body or binary)
richMenus.post('/api/rich-menus/:id/image', async (c) => {
  try {
    const richMenuId = c.req.param('id');
    const contentType = c.req.header('content-type') ?? '';

    let imageData: ArrayBuffer;
    let imageContentType: 'image/png' | 'image/jpeg' = 'image/png';

    if (contentType.includes('application/json')) {
      // Accept base64 encoded image in JSON body
      const body = await readJsonBodyWithLimit<{ image: string; contentType?: string }>(
        c.req.raw,
        RICH_MENU_IMAGE_JSON_BODY_LIMIT_BYTES,
      );
      if (!body.image) {
        return c.json({ success: false, error: 'image (base64) is required' }, 400);
      }
      // Strip data URI prefix if present
      const base64 = body.image.replace(/^data:image\/\w+;base64,/, '');
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      imageData = bytes.buffer;
      if (body.contentType === 'image/jpeg') imageContentType = 'image/jpeg';
    } else if (contentType.includes('image/')) {
      // Accept raw binary upload
      imageData = await c.req.arrayBuffer();
      imageContentType =
        contentType.includes('jpeg') || contentType.includes('jpg') ? 'image/jpeg' : 'image/png';
    } else {
      return c.json(
        {
          success: false,
          error: 'Content-Type must be application/json (with base64) or image/png or image/jpeg',
        },
        400,
      );
    }

    const declared: 'image/png' | 'image/jpeg' =
      imageContentType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    if (!richMenuImageBytesMatchFormat(imageData, declared)) {
      return c.json(
        {
          success: false,
          error: 'Image bytes do not match declared PNG or JPEG format',
        },
        400,
      );
    }

    const scopeImg = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const lineAccountId = c.req.query('lineAccountId');
    const qImg = validateScopedLineAccountQueryParam(scopeImg, lineAccountId);
    if (!qImg.ok) {
      return c.json({ success: false, error: qImg.error }, qImg.status);
    }
    const accessToken = await resolveLineAccessTokenForLineAccountId(
      c.env.DB,
      c.env.LINE_CHANNEL_ACCESS_TOKEN,
      lineAccountId ?? null,
      lineAccountDbOptions(c.env),
    );
    const lineClient = new LineClient(accessToken);
    await lineClient.uploadRichMenuImage(richMenuId, imageData, imageContentType);

    return c.json({ success: true, data: null });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/rich-menus/:id/image error:', message);
    return c.json({ success: false, error: `Failed to upload rich menu image: ${message}` }, 500);
  }
});
