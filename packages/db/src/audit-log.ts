import { jstNow } from './utils.js';

export type AdminAuditActorKind = 'cloudflare_access' | 'unknown';

export interface AdminAuditLogRow {
  id: string;
  created_at: string;
  action: string;
  actor_email: string | null;
  actor_kind: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: string | null;
  request_path: string | null;
  ip_hash: string | null;
}

export type InsertAdminAuditLogInput = {
  action: string;
  actorEmail?: string | null;
  actorKind: AdminAuditActorKind;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: string | null;
  requestPath?: string | null;
  ipHash?: string | null;
};

export async function insertAdminAuditLog(
  db: D1Database,
  input: InsertAdminAuditLogInput,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO admin_audit_log (id, created_at, action, actor_email, actor_kind, resource_type, resource_id, metadata, request_path, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      now,
      input.action,
      input.actorEmail ?? null,
      input.actorKind,
      input.resourceType ?? null,
      input.resourceId ?? null,
      input.metadata ?? null,
      input.requestPath ?? null,
      input.ipHash ?? null,
    )
    .run();
}

export async function listAdminAuditLogs(
  db: D1Database,
  opts: { limit: number; offset?: number },
): Promise<AdminAuditLogRow[]> {
  const limit = Math.min(Math.max(opts.limit, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const result = await db
    .prepare(`SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(limit, offset)
    .all<AdminAuditLogRow>();
  return result.results;
}
