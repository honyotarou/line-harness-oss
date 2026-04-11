import type { Context } from 'hono';
import type { Env } from '../index.js';

/**
 * Cloudflare Access まわりの「運用フラグ・HTTP 名・主体クレーム」の単一モジュール。
 * JWT 署名検証は `cloudflare-access-jwt.ts`、ルーティングは各 middleware。
 */

/** Cloudflare Access forwards this header to the origin after successful login. */
export const CF_ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';

const ACCESS_EMAIL_MAX_LEN = 320;

export function isCloudflareAccessEnforced(env: {
  REQUIRE_CLOUDFLARE_ACCESS_JWT?: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
}): boolean {
  const flag = env.REQUIRE_CLOUDFLARE_ACCESS_JWT?.trim().toLowerCase();
  const on = flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
  const domain = env.CLOUDFLARE_ACCESS_TEAM_DOMAIN?.trim();
  return on && Boolean(domain && domain.length > 0);
}

/** ゲート層（Access ミドルウェア）向け */
export const CLOUDFLARE_ACCESS_EMAIL_CLAIM_ERROR =
  'Cloudflare Access JWT must include a valid email claim';

/** アプリ層（RBAC / ルート）向け — ミドルウェア取り違え時の二重防御 */
export const CLOUDFLARE_ACCESS_EMAIL_REQUIRED_ERROR =
  'Forbidden: Cloudflare Access email claim required';

function normalizeAccessPrincipalEmail(raw: string): string | null {
  const t = raw.trim();
  if (t.length === 0 || t.length > ACCESS_EMAIL_MAX_LEN || !t.includes('@')) {
    return null;
  }
  return t.toLowerCase();
}

/**
 * Verified JWT の payload から、RBAC / allowlist に使うメール相当を取り出す（署名はしない）。
 */
export function getValidatedAccessEmailFromPayload(
  payload: Record<string, unknown> | undefined | null,
): string | null {
  if (!payload) {
    return null;
  }
  const v = payload.email;
  if (typeof v !== 'string') {
    return null;
  }
  return normalizeAccessPrincipalEmail(v);
}

/** Hono コンテキスト上の Cf Access payload からメールを解決する唯一の入口（ルート / RBAC 用）。 */
export function getCloudflareAccessEmailFromContext(c: Context<Env>): string | null {
  return getValidatedAccessEmailFromPayload(c.get('cfAccessJwtPayload'));
}
