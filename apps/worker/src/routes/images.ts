import { Hono } from 'hono';
import { createMediaAsset, getMediaAssetByPublicToken } from '@line-crm/db';
import type { Env } from '../index.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import {
  resolveLineAccountScopeForRequest,
  validateScopedLineAccountBody,
} from '../services/admin-line-account-scope.js';
import {
  assertDeclaredMimeMatchesSniff,
  inspectImageBinary,
} from '../services/image-binary-policy.js';
import { enforceRateLimit } from '../services/request-rate-limit.js';
import { fireAdminAuditLog } from '../services/admin-audit-log.js';

const images = new Hono<Env>();

const MAX_B64_CHARS = 3_600_000;

function decodeBase64ToBytes(raw: string): Uint8Array {
  const t = raw.replace(/\s+/g, '');
  if (t.length > MAX_B64_CHARS) {
    throw new Error('image_payload_too_large');
  }
  let bin: string;
  try {
    bin = atob(t);
  } catch {
    throw new Error('image_invalid_base64');
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i) & 0xff;
  }
  return out;
}

// POST /api/images — store bytes in R2 + D1 row (admin)
images.post('/api/images', async (c) => {
  try {
    const limited = await enforceRateLimit(c, {
      bucket: 'image-upload',
      db: c.env.DB,
      limit: 20,
      windowMs: 60_000,
    });
    if (limited) return limited;

    const bucket = c.env.LINE_CRM_IMAGES;
    if (!bucket || typeof bucket.put !== 'function') {
      return c.json(
        {
          success: false,
          error:
            'Image storage is not configured: bind R2 bucket LINE_CRM_IMAGES in wrangler (see wrangler.toml comment)',
        },
        503,
      );
    }

    const body = await readJsonBodyWithLimit<{
      mimeType: string;
      base64: string;
      lineAccountId?: string | null;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);

    if (!body.mimeType?.trim() || !body.base64?.trim()) {
      return c.json({ success: false, error: 'mimeType and base64 are required' }, 400);
    }

    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const scoped = validateScopedLineAccountBody(scope, body.lineAccountId ?? null);
    if (!scoped.ok) {
      return c.json({ success: false, error: scoped.error }, scoped.status);
    }
    if (scope.mode === 'restricted' && !scoped.lineAccountId) {
      return c.json({ success: false, error: 'lineAccountId is required for this principal' }, 400);
    }

    const bytes = decodeBase64ToBytes(body.base64);
    const sniff = inspectImageBinary(bytes);
    assertDeclaredMimeMatchesSniff(body.mimeType, sniff.mime);

    const id = crypto.randomUUID();
    const publicToken =
      crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const r2Key = `img/${id}`;

    await bucket.put(r2Key, bytes, { httpMetadata: { contentType: sniff.mime } });

    const row = await createMediaAsset(c.env.DB, {
      lineAccountId: scoped.lineAccountId,
      r2Key,
      mimeType: sniff.mime,
      byteSize: bytes.byteLength,
      publicToken,
    });

    fireAdminAuditLog(c, {
      action: 'media.image_upload',
      resourceType: 'media_asset',
      resourceId: row.id,
    });

    return c.json(
      {
        success: true,
        data: {
          id: row.id,
          mimeType: row.mime_type,
          byteSize: row.byte_size,
          publicUrlPath: `/api/images/public/${row.public_token}`,
        },
      },
      201,
    );
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    if (err instanceof Error) {
      if (
        err.message === 'image_too_large' ||
        err.message === 'image_too_small' ||
        err.message === 'image_unsupported_type' ||
        err.message === 'image_mime_mismatch' ||
        err.message === 'image_invalid_base64' ||
        err.message === 'image_payload_too_large'
      ) {
        return c.json({ success: false, error: err.message }, 400);
      }
    }
    console.error('POST /api/images error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/images/public/:token — LINE-accessible binary URL (unguessable token + IP rate limit)
images.get('/api/images/public/:token', async (c) => {
  try {
    const limited = await enforceRateLimit(c, {
      bucket: 'public-image-fetch',
      db: c.env.DB,
      limit: 120,
      windowMs: 60_000,
    });
    if (limited) return limited;

    const bucket = c.env.LINE_CRM_IMAGES;
    if (!bucket || typeof bucket.get !== 'function') {
      return c.json({ success: false, error: 'Not found' }, 404);
    }

    const token = c.req.param('token')?.trim() ?? '';
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }

    const row = await getMediaAssetByPublicToken(c.env.DB, token);
    if (!row) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }

    const obj = await bucket.get(row.r2_key);
    if (!obj) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }

    const headers = new Headers();
    headers.set('Content-Type', row.mime_type);
    headers.set('Cache-Control', 'public, max-age=3600');
    return new Response(obj.body, { status: 200, headers });
  } catch (err) {
    console.error('GET /api/images/public/:token error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { images };
