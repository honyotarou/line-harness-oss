import type { Context } from 'hono';
import type { AdminAuditActorKind } from '@line-crm/db';
import type { Env } from '../index.js';
import { canonicalRequestPathname } from './auth-paths.js';
import {
  getCloudflareAccessEmailFromContext,
  isCloudflareAccessEnforced,
} from './cloudflare-access-principal.js';
import { getRequestClientAddress } from './request-rate-limit.js';

export type AdminAuditPayload = {
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
};

async function hashAuditClientHint(request: Request): Promise<string | undefined> {
  const ip = getRequestClientAddress(request);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`audit-ip-v1:${ip}`),
  );
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 24);
}

function resolveActorKind(c: Context<Env>): AdminAuditActorKind {
  if (isCloudflareAccessEnforced(c.env) && getCloudflareAccessEmailFromContext(c)) {
    return 'cloudflare_access';
  }
  return 'unknown';
}

/**
 * Best-effort append to `admin_audit_log`. Never throws to the caller; logs failures only.
 */
export function fireAdminAuditLog(c: Context<Env>, payload: AdminAuditPayload): void {
  void (async () => {
    try {
      const { insertAdminAuditLog } = await import('@line-crm/db');
      if (typeof insertAdminAuditLog !== 'function') return;
      const actorEmail = getCloudflareAccessEmailFromContext(c);
      const url = new URL(c.req.url);
      const path = canonicalRequestPathname(url.pathname);
      const ipHash = await hashAuditClientHint(c.req.raw);
      const meta = payload.metadata === undefined ? null : JSON.stringify(payload.metadata);
      await insertAdminAuditLog(c.env.DB, {
        action: payload.action,
        actorEmail,
        actorKind: resolveActorKind(c),
        resourceType: payload.resourceType ?? null,
        resourceId: payload.resourceId ?? null,
        metadata: meta,
        requestPath: path,
        ipHash,
      });
    } catch (err) {
      const vitest =
        (globalThis as unknown as { process?: { env?: { VITEST?: string } } }).process?.env
          ?.VITEST === 'true';
      if (vitest && err instanceof Error && err.message.includes('insertAdminAuditLog')) {
        return;
      }
      console.error('fireAdminAuditLog failed:', err);
    }
  })();
}
