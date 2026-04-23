import { jstNow } from './utils.js';
import { getTemplateById } from './templates.js';
// =============================================================================
// Tracked Links — URL click tracking with automatic actions
// =============================================================================

export type TrackedLink = Readonly<{
  id: string;
  name: string;
  original_url: string;
  tag_id: string | null;
  scenario_id: string | null;
  intro_template_id: string | null;
  reward_template_id: string | null;
  line_account_id: string | null;
  is_active: number;
  click_count: number;
  created_at: string;
  updated_at: string;
}>;

export type LinkClick = Readonly<{
  id: string;
  tracked_link_id: string;
  friend_id: string | null;
  clicked_at: string;
}>;

// ── CRUD ─────────────────────────────────────────────────────────────────────

export type GetTrackedLinksOptions = Readonly<{
  lineAccountIds?: readonly string[];
}>;

export async function getTrackedLinks(
  db: D1Database,
  opts: GetTrackedLinksOptions = {},
): Promise<TrackedLink[]> {
  const ids = opts.lineAccountIds;
  if (ids !== undefined) {
    if (ids.length === 0) {
      return [];
    }
    const ph = ids.map(() => '?').join(',');
    const result = await db
      .prepare(
        `SELECT * FROM tracked_links WHERE line_account_id IS NOT NULL AND line_account_id IN (${ph}) ORDER BY created_at DESC`,
      )
      .bind(...ids)
      .all<TrackedLink>();
    return result.results;
  }
  const result = await db
    .prepare(`SELECT * FROM tracked_links ORDER BY created_at DESC`)
    .all<TrackedLink>();
  return result.results;
}

export async function getTrackedLinkById(db: D1Database, id: string): Promise<TrackedLink | null> {
  return db.prepare(`SELECT * FROM tracked_links WHERE id = ?`).bind(id).first<TrackedLink>();
}

export type CreateTrackedLinkInput = Readonly<{
  name: string;
  originalUrl: string;
  lineAccountId?: string | null;
  tagId?: string | null;
  scenarioId?: string | null;
  introTemplateId?: string | null;
  rewardTemplateId?: string | null;
}>;

async function assertTemplateRefsExist(
  db: D1Database,
  introTemplateId: string | null,
  rewardTemplateId: string | null,
): Promise<void> {
  if (introTemplateId) {
    const t = await getTemplateById(db, introTemplateId);
    if (!t) throw new Error('intro_template_not_found');
  }
  if (rewardTemplateId) {
    const t = await getTemplateById(db, rewardTemplateId);
    if (!t) throw new Error('reward_template_not_found');
  }
}

/** Reject non-http(s) schemes and userinfo (defense in depth vs javascript:/data: in stored URLs). */
export function assertHttpOrHttpsTrackedOriginalUrl(url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('original_url must be a valid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('original_url must use http or https');
  }
  if (u.username || u.password) {
    throw new Error('original_url must not include credentials');
  }
}

export async function createTrackedLink(
  db: D1Database,
  input: CreateTrackedLinkInput,
): Promise<TrackedLink> {
  assertHttpOrHttpsTrackedOriginalUrl(input.originalUrl);
  const introTemplateId = input.introTemplateId ?? null;
  const rewardTemplateId = input.rewardTemplateId ?? null;
  await assertTemplateRefsExist(db, introTemplateId, rewardTemplateId);
  const id = crypto.randomUUID();
  const now = jstNow();

  const lineAccountId = input.lineAccountId?.trim() ? input.lineAccountId.trim() : null;

  await db
    .prepare(
      `INSERT INTO tracked_links (id, name, original_url, tag_id, scenario_id, intro_template_id, reward_template_id, line_account_id, is_active, click_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
    )
    .bind(
      id,
      input.name,
      input.originalUrl,
      input.tagId ?? null,
      input.scenarioId ?? null,
      introTemplateId,
      rewardTemplateId,
      lineAccountId,
      now,
      now,
    )
    .run();

  return (await getTrackedLinkById(db, id))!;
}

export type UpdateTrackedLinkInput = Partial<{
  name: string;
  originalUrl: string;
  lineAccountId: string | null;
  tagId: string | null;
  scenarioId: string | null;
  introTemplateId: string | null;
  rewardTemplateId: string | null;
  isActive: boolean;
}>;

export async function updateTrackedLink(
  db: D1Database,
  id: string,
  input: UpdateTrackedLinkInput,
): Promise<TrackedLink | null> {
  const existing = await getTrackedLinkById(db, id);
  if (!existing) return null;

  const name = input.name ?? existing.name;
  const originalUrl = input.originalUrl ?? existing.original_url;
  if (input.originalUrl !== undefined) {
    assertHttpOrHttpsTrackedOriginalUrl(originalUrl);
  }
  const tagId = 'tagId' in input ? (input.tagId ?? null) : existing.tag_id;
  const scenarioId = 'scenarioId' in input ? (input.scenarioId ?? null) : existing.scenario_id;
  const lineAccountId =
    'lineAccountId' in input
      ? input.lineAccountId?.trim()
        ? input.lineAccountId.trim()
        : null
      : existing.line_account_id;
  const introTemplateId =
    'introTemplateId' in input
      ? (input.introTemplateId ?? null)
      : (existing.intro_template_id ?? null);
  const rewardTemplateId =
    'rewardTemplateId' in input
      ? (input.rewardTemplateId ?? null)
      : (existing.reward_template_id ?? null);
  const isActive = 'isActive' in input ? (input.isActive ? 1 : 0) : existing.is_active;

  await assertTemplateRefsExist(db, introTemplateId, rewardTemplateId);

  const now = jstNow();
  await db
    .prepare(
      `UPDATE tracked_links
       SET name = ?, original_url = ?, tag_id = ?, scenario_id = ?,
           intro_template_id = ?, reward_template_id = ?, line_account_id = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      name,
      originalUrl,
      tagId,
      scenarioId,
      introTemplateId,
      rewardTemplateId,
      lineAccountId,
      isActive,
      now,
      id,
    )
    .run();

  return getTrackedLinkById(db, id);
}

export async function deleteTrackedLink(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM tracked_links WHERE id = ?`).bind(id).run();
}

// ── Click Recording ───────────────────────────────────────────────────────────

export async function recordLinkClick(
  db: D1Database,
  trackedLinkId: string,
  friendId?: string | null,
): Promise<LinkClick> {
  const id = crypto.randomUUID();
  const now = jstNow();

  await db
    .prepare(
      `INSERT INTO link_clicks (id, tracked_link_id, friend_id, clicked_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(id, trackedLinkId, friendId ?? null, now)
    .run();

  await db
    .prepare(`UPDATE tracked_links SET click_count = click_count + 1, updated_at = ? WHERE id = ?`)
    .bind(now, trackedLinkId)
    .run();

  return (await db.prepare(`SELECT * FROM link_clicks WHERE id = ?`).bind(id).first<LinkClick>())!;
}

export type LinkClickWithFriend = LinkClick & Readonly<{ friend_display_name: string | null }>;

export async function getLinkClicks(
  db: D1Database,
  trackedLinkId: string,
): Promise<LinkClickWithFriend[]> {
  const result = await db
    .prepare(
      `SELECT lc.*, f.display_name as friend_display_name
       FROM link_clicks lc
       LEFT JOIN friends f ON f.id = lc.friend_id
       WHERE lc.tracked_link_id = ?
       ORDER BY lc.clicked_at DESC`,
    )
    .bind(trackedLinkId)
    .all<LinkClickWithFriend>();
  return result.results;
}
