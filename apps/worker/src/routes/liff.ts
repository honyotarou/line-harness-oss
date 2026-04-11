import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  DEFAULT_PUBLIC_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import { renderAuthQrPage } from '../ui/landing.js';
import { runAuthLineStart } from '../application/liff-oauth-start.js';
import { runLiffOAuthCallback } from '../application/liff-oauth-callback.js';
import { errorPage } from '../application/liff-pages.js';
import type { LiffLineUserBody } from '../application/liff-identity.js';
import {
  liffAnalyticsRefDetail,
  liffAnalyticsRefSummary,
  liffBookingPhoneFallbackPost,
  liffLinkPost,
  liffLinksWrapPost,
  liffProfilePost,
  type LiffLinkBody,
} from '../application/liff-json-handlers.js';

const liffRoutes = new Hono<Env>();

/**
 * GET /auth/line — redirect to LINE Login with bot_prompt=aggressive
 */
liffRoutes.get('/auth/line', async (c) => {
  const r = await runAuthLineStart({
    db: c.env.DB,
    bindings: c.env,
    origin: new URL(c.req.url).origin,
    userAgent: c.req.header('user-agent') || '',
    ref: c.req.query('ref') || '',
    redirectRaw: c.req.query('redirect') || '',
    gclid: c.req.query('gclid') || '',
    fbclid: c.req.query('fbclid') || '',
    utmSource: c.req.query('utm_source') || '',
    utmMedium: c.req.query('utm_medium') || '',
    utmCampaign: c.req.query('utm_campaign') || '',
    utmContent: c.req.query('utm_content') || '',
    utmTerm: c.req.query('utm_term') || '',
    accountParam: c.req.query('account') || '',
    uidParam: c.req.query('uid') || '',
  });

  if (r.kind === 'log_error') {
    console.error(r.message);
    return c.html(errorPage(r.userHtmlMessage));
  }
  if (r.kind === 'generic_error') {
    return c.html(errorPage(r.userHtmlMessage));
  }
  if (r.kind === 'redirect') {
    return c.redirect(r.location);
  }
  return c.html(renderAuthQrPage(c.env, r.scanTarget));
});

/**
 * GET /auth/callback — LINE Login callback
 */
liffRoutes.get('/auth/callback', async (c) => {
  const result = await runLiffOAuthCallback({
    db: c.env.DB,
    bindings: c.env,
    origin: new URL(c.req.url).origin,
    code: c.req.query('code'),
    stateParam: c.req.query('state') || '',
    oauthError: c.req.query('error'),
    fetchImpl: fetch,
  });
  if (result.kind === 'redirect') {
    return c.redirect(result.location);
  }
  return c.html(result.html);
});

// POST /api/liff/profile
liffRoutes.post('/api/liff/profile', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<LiffLineUserBody>(
      c.req.raw,
      DEFAULT_PUBLIC_JSON_BODY_LIMIT_BYTES,
    );
    const r = await liffProfilePost(c.env.DB, c.env.LINE_LOGIN_CHANNEL_ID, body);
    return c.json(r.body, r.status);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/liff/profile error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/liff/booking/phone-fallback
liffRoutes.post('/api/liff/booking/phone-fallback', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<LiffLineUserBody>(
      c.req.raw,
      DEFAULT_PUBLIC_JSON_BODY_LIMIT_BYTES,
    );
    const r = await liffBookingPhoneFallbackPost(
      c.env.DB,
      c.env.LINE_LOGIN_CHANNEL_ID,
      c.env.BOOKING_FALLBACK_TEL,
      body,
    );
    return c.json(r.body, r.status);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/liff/booking/phone-fallback error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/liff/link
liffRoutes.post('/api/liff/link', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<LiffLinkBody>(
      c.req.raw,
      DEFAULT_PUBLIC_JSON_BODY_LIMIT_BYTES,
    );
    const r = await liffLinkPost(c.env.DB, c.env.LINE_LOGIN_CHANNEL_ID, body);
    return c.json(r.body, r.status);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/liff/link error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/analytics/ref-summary
liffRoutes.get('/api/analytics/ref-summary', async (c) => {
  try {
    const r = await liffAnalyticsRefSummary(c.env.DB, c.req.query('lineAccountId'));
    return c.json(r.body, r.status);
  } catch (err) {
    console.error('GET /api/analytics/ref-summary error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/analytics/ref/:refCode
liffRoutes.get('/api/analytics/ref/:refCode', async (c) => {
  try {
    const r = await liffAnalyticsRefDetail(
      c.env.DB,
      c.req.param('refCode'),
      c.req.query('lineAccountId'),
    );
    return c.json(r.body, r.status);
  } catch (err) {
    console.error('GET /api/analytics/ref/:refCode error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/links/wrap
liffRoutes.post('/api/links/wrap', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<{ url: string; ref?: string }>(
      c.req.raw,
      DEFAULT_PUBLIC_JSON_BODY_LIMIT_BYTES,
    );
    const r = await liffLinksWrapPost(c.env, fetch, body);
    return c.json(r.body, r.status);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/links/wrap error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { liffRoutes };
