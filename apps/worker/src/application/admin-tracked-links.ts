import {
  countActiveLineAccounts,
  createTrackedLink,
  deleteTrackedLink,
  getFriendById,
  getLinkClicks,
  getScenarioById,
  getTagById,
  getTrackedLinkById,
  getTrackedLinks,
  updateTrackedLink,
} from '@line-crm/db';
import type { TrackedLink, UpdateTrackedLinkInput } from '@line-crm/db';
import type { LineAccountScope } from '../services/admin-line-account-scope.js';
import {
  jsonBodyForLineAccountScopeFailure,
  resourceLineAccountVisibleInScope,
  validateScopedLineAccountBody,
  validateScopedLineAccountQueryParam,
} from '../services/admin-line-account-scope.js';
import { assertHttpsOutboundUrlResolvedSafe } from '../services/outbound-url-resolve.js';
import {
  DEFAULT_TRACKED_LINK_TTL_SECONDS,
  issueTrackedLinkFriendToken,
} from '../services/tracking-friend-token.js';

export type AdminTrackedLinkCreateBody = Readonly<{
  name: string;
  originalUrl: string;
  lineAccountId?: string | null;
  tagId?: string | null;
  scenarioId?: string | null;
  introTemplateId?: string | null;
  rewardTemplateId?: string | null;
}>;

export type AdminTrackedLinkUpdateBody = Readonly<{
  name?: string;
  originalUrl?: string;
  lineAccountId?: string | null;
  tagId?: string | null;
  scenarioId?: string | null;
  introTemplateId?: string | null;
  rewardTemplateId?: string | null;
  isActive?: boolean;
}>;

export type SerializedTrackedLink = Readonly<{
  id: string;
  name: string;
  originalUrl: string;
  trackingUrl: string;
  tagId: string | null;
  scenarioId: string | null;
  introTemplateId: string | null;
  rewardTemplateId: string | null;
  lineAccountId: string | null;
  isActive: boolean;
  clickCount: number;
  createdAt: string;
  updatedAt: string;
}>;

export type TrackedLinkClickDetail = Readonly<{
  id: string;
  friendId: string | null;
  friendDisplayName: string | null;
  clickedAt: string;
}>;

type TrackedLinkFailure = Readonly<{ ok: false; status: number; body: unknown }>;

type VisibleTrackedLinkResult = Readonly<{ ok: true; link: TrackedLink }> | TrackedLinkFailure;

const TRACKED_LINK_ORIGINAL_URL_ERROR =
  'originalUrl must be a public https URL (private IPs and localhost are not allowed)';

function trackedLinkNotFoundFailure(): TrackedLinkFailure {
  return { ok: false, status: 404, body: { success: false, error: 'Tracked link not found' } };
}

function friendNotFoundFailure(): TrackedLinkFailure {
  return { ok: false, status: 404, body: { success: false, error: 'Friend not found' } };
}

function templateLookupFailure(err: unknown): TrackedLinkFailure | null {
  if (!(err instanceof Error)) {
    return null;
  }
  if (err.message === 'intro_template_not_found' || err.message === 'reward_template_not_found') {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: 'Unknown introTemplateId or rewardTemplateId' },
    };
  }
  return null;
}

function serializeTrackedLinkForApi(row: TrackedLink, baseUrl: string): SerializedTrackedLink {
  return {
    id: row.id,
    name: row.name,
    originalUrl: row.original_url,
    trackingUrl: `${baseUrl}/t/${row.id}`,
    tagId: row.tag_id,
    scenarioId: row.scenario_id,
    introTemplateId: row.intro_template_id,
    rewardTemplateId: row.reward_template_id,
    lineAccountId: row.line_account_id ?? null,
    isActive: Boolean(row.is_active),
    clickCount: row.click_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertExplicitLineAccountWhenMultiTenant(
  db: D1Database,
  lineAccountId: string | null,
): Promise<TrackedLinkFailure | null> {
  if (lineAccountId && lineAccountId.trim().length > 0) {
    return null;
  }
  if ((await countActiveLineAccounts(db)) > 1) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: 'lineAccountId is required when multiple LINE accounts are active',
      },
    };
  }
  return null;
}

async function assertTrackedLinkRefsAllowed(
  db: D1Database,
  multi: boolean,
  lineAccountId: string | null,
  tagId: string | null,
  scenarioId: string | null,
): Promise<TrackedLinkFailure | null> {
  if (tagId) {
    const tag = await getTagById(db, tagId);
    if (!tag) {
      return { ok: false, status: 400, body: { success: false, error: 'Unknown tagId' } };
    }
    if (multi) {
      if (!lineAccountId || tag.line_account_id !== lineAccountId) {
        return {
          ok: false,
          status: 400,
          body: {
            success: false,
            error: 'tagId must belong to the same lineAccountId when multi-account',
          },
        };
      }
    } else if (lineAccountId && tag.line_account_id && tag.line_account_id !== lineAccountId) {
      return {
        ok: false,
        status: 400,
        body: { success: false, error: 'tagId does not match lineAccountId' },
      };
    }
  }

  if (scenarioId) {
    const scenario = await getScenarioById(db, scenarioId);
    if (!scenario) {
      return { ok: false, status: 400, body: { success: false, error: 'Unknown scenarioId' } };
    }
    if (multi) {
      if (!lineAccountId || scenario.line_account_id !== lineAccountId) {
        return {
          ok: false,
          status: 400,
          body: {
            success: false,
            error: 'scenarioId must belong to the same lineAccountId when multi-account',
          },
        };
      }
    } else if (
      lineAccountId &&
      scenario.line_account_id &&
      scenario.line_account_id !== lineAccountId
    ) {
      return {
        ok: false,
        status: 400,
        body: { success: false, error: 'scenarioId does not match lineAccountId' },
      };
    }
  }

  return null;
}

async function resolveVisibleTrackedLink(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
): Promise<VisibleTrackedLinkResult> {
  const link = await getTrackedLinkById(db, id);
  if (!link) {
    return trackedLinkNotFoundFailure();
  }
  if (!resourceLineAccountVisibleInScope(scope, link.line_account_id ?? null)) {
    return trackedLinkNotFoundFailure();
  }
  return { ok: true, link };
}

export async function listAdminTrackedLinks(
  db: D1Database,
  scope: LineAccountScope,
  requestedLineAccountId: string | undefined,
  baseUrl: string,
): Promise<Readonly<{ ok: true; data: SerializedTrackedLink[] }> | TrackedLinkFailure> {
  const q = validateScopedLineAccountQueryParam(scope, requestedLineAccountId);
  if (!q.ok) {
    return { ok: false, status: q.status, body: jsonBodyForLineAccountScopeFailure(q) };
  }

  const queryLineAccountId = requestedLineAccountId?.trim();
  const items =
    queryLineAccountId && queryLineAccountId.length > 0
      ? await getTrackedLinks(db, { lineAccountIds: [queryLineAccountId] })
      : await getTrackedLinks(db);

  return {
    ok: true,
    data: items.map((item) => serializeTrackedLinkForApi(item, baseUrl)),
  };
}

export async function getAdminTrackedLinkDetail(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
  baseUrl: string,
): Promise<
  | Readonly<{
      ok: true;
      data: SerializedTrackedLink & Readonly<{ clicks: readonly TrackedLinkClickDetail[] }>;
    }>
  | TrackedLinkFailure
> {
  const visible = await resolveVisibleTrackedLink(db, scope, id);
  if (!visible.ok) {
    return visible;
  }

  const clicks = await getLinkClicks(db, id);
  return {
    ok: true,
    data: {
      ...serializeTrackedLinkForApi(visible.link, baseUrl),
      clicks: clicks.map((click) => ({
        id: click.id,
        friendId: click.friend_id,
        friendDisplayName: click.friend_display_name,
        clickedAt: click.clicked_at,
      })),
    },
  };
}

export async function issueAdminTrackedLinkPersonalizedUrl(
  db: D1Database,
  scope: LineAccountScope,
  trackingSecret: string | null,
  baseUrl: string,
  id: string,
  friendId: string,
): Promise<
  Readonly<{ ok: true; data: Readonly<{ url: string; expiresAt: string }> }> | TrackedLinkFailure
> {
  const visible = await resolveVisibleTrackedLink(db, scope, id);
  if (!visible.ok) {
    return visible;
  }

  const friend = await getFriendById(db, friendId);
  if (!friend || !resourceLineAccountVisibleInScope(scope, friend.line_account_id)) {
    return friendNotFoundFailure();
  }

  const linkLineAccountId = visible.link.line_account_id ?? null;
  if (linkLineAccountId && friend.line_account_id !== linkLineAccountId) {
    return friendNotFoundFailure();
  }

  if (!linkLineAccountId && (await countActiveLineAccounts(db)) > 1) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error:
          'Tracked link is missing lineAccountId; personalize is unavailable in multi-account mode until the link is scoped',
      },
    };
  }

  if (trackingSecret === null) {
    return {
      ok: false,
      status: 503,
      body: {
        success: false,
        error:
          'Tracked link signing is disabled: set TRACKING_LINK_SECRET (REQUIRE_TRACKING_LINK_SECRET=1)',
      },
    };
  }

  const token = await issueTrackedLinkFriendToken(trackingSecret, { linkId: id, friendId });
  return {
    ok: true,
    data: {
      url: `${baseUrl}/t/${encodeURIComponent(id)}?f=${encodeURIComponent(token)}`,
      expiresAt: new Date(Date.now() + DEFAULT_TRACKED_LINK_TTL_SECONDS * 1000).toISOString(),
    },
  };
}

export async function createAdminTrackedLink(
  db: D1Database,
  scope: LineAccountScope,
  body: AdminTrackedLinkCreateBody,
  baseUrl: string,
  fetchFn: typeof fetch,
): Promise<Readonly<{ ok: true; data: SerializedTrackedLink }> | TrackedLinkFailure> {
  const originalUrl = body.originalUrl?.trim() ?? '';
  if (!body.name || !originalUrl) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: 'name and originalUrl are required' },
    };
  }

  const bodyScope = validateScopedLineAccountBody(scope, body.lineAccountId);
  if (!bodyScope.ok) {
    return {
      ok: false,
      status: bodyScope.status,
      body: jsonBodyForLineAccountScopeFailure(bodyScope),
    };
  }

  const lineAccountRequired = await assertExplicitLineAccountWhenMultiTenant(
    db,
    bodyScope.lineAccountId,
  );
  if (lineAccountRequired) {
    return lineAccountRequired;
  }

  const multi = (await countActiveLineAccounts(db)) > 1;
  const refFailure = await assertTrackedLinkRefsAllowed(
    db,
    multi,
    bodyScope.lineAccountId,
    body.tagId ?? null,
    body.scenarioId ?? null,
  );
  if (refFailure) {
    return refFailure;
  }

  const outboundOk = await assertHttpsOutboundUrlResolvedSafe(originalUrl, fetchFn);
  if (!outboundOk.ok) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: TRACKED_LINK_ORIGINAL_URL_ERROR },
    };
  }

  try {
    const link = await createTrackedLink(db, {
      name: body.name,
      originalUrl,
      lineAccountId: bodyScope.lineAccountId,
      tagId: body.tagId ?? null,
      scenarioId: body.scenarioId ?? null,
      introTemplateId: body.introTemplateId ?? null,
      rewardTemplateId: body.rewardTemplateId ?? null,
    });
    return { ok: true, data: serializeTrackedLinkForApi(link, baseUrl) };
  } catch (err) {
    const templateFailure = templateLookupFailure(err);
    if (templateFailure) {
      return templateFailure;
    }
    throw err;
  }
}

export async function updateAdminTrackedLink(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
  body: AdminTrackedLinkUpdateBody,
  baseUrl: string,
  fetchFn: typeof fetch,
): Promise<Readonly<{ ok: true; data: SerializedTrackedLink }> | TrackedLinkFailure> {
  const visible = await resolveVisibleTrackedLink(db, scope, id);
  if (!visible.ok) {
    return visible;
  }

  const multi = (await countActiveLineAccounts(db)) > 1;
  const input: UpdateTrackedLinkInput = {};

  if (body.name !== undefined) {
    input.name = body.name;
  }

  if (body.originalUrl !== undefined) {
    const originalUrl = body.originalUrl.trim();
    const outboundOk = await assertHttpsOutboundUrlResolvedSafe(originalUrl, fetchFn);
    if (!outboundOk.ok) {
      return {
        ok: false,
        status: 400,
        body: { success: false, error: TRACKED_LINK_ORIGINAL_URL_ERROR },
      };
    }
    input.originalUrl = originalUrl;
  }

  if ('lineAccountId' in body) {
    const bodyScope = validateScopedLineAccountBody(scope, body.lineAccountId);
    if (!bodyScope.ok) {
      return {
        ok: false,
        status: bodyScope.status,
        body: jsonBodyForLineAccountScopeFailure(bodyScope),
      };
    }
    if (multi && !bodyScope.lineAccountId) {
      return {
        ok: false,
        status: 400,
        body: {
          success: false,
          error: 'lineAccountId is required when multiple LINE accounts are active',
        },
      };
    }
    input.lineAccountId = bodyScope.lineAccountId;
  }

  if ('tagId' in body) {
    input.tagId = body.tagId ?? null;
  }
  if ('scenarioId' in body) {
    input.scenarioId = body.scenarioId ?? null;
  }
  if ('introTemplateId' in body) {
    input.introTemplateId = body.introTemplateId ?? null;
  }
  if ('rewardTemplateId' in body) {
    input.rewardTemplateId = body.rewardTemplateId ?? null;
  }
  if (body.isActive !== undefined) {
    input.isActive = body.isActive;
  }

  const nextLineAccountId =
    'lineAccountId' in input
      ? (input.lineAccountId ?? null)
      : (visible.link.line_account_id ?? null);
  const nextTagId = 'tagId' in input ? (input.tagId ?? null) : visible.link.tag_id;
  const nextScenarioId =
    'scenarioId' in input ? (input.scenarioId ?? null) : visible.link.scenario_id;

  const refFailure = await assertTrackedLinkRefsAllowed(
    db,
    multi,
    nextLineAccountId,
    nextTagId,
    nextScenarioId,
  );
  if (refFailure) {
    return refFailure;
  }

  try {
    const updated = await updateTrackedLink(db, id, input);
    if (!updated) {
      return trackedLinkNotFoundFailure();
    }
    return { ok: true, data: serializeTrackedLinkForApi(updated, baseUrl) };
  } catch (err) {
    const templateFailure = templateLookupFailure(err);
    if (templateFailure) {
      return templateFailure;
    }
    throw err;
  }
}

export async function deleteAdminTrackedLink(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
): Promise<Readonly<{ ok: true; data: null }> | TrackedLinkFailure> {
  const visible = await resolveVisibleTrackedLink(db, scope, id);
  if (!visible.ok) {
    return visible;
  }

  await deleteTrackedLink(db, id);
  return { ok: true, data: null };
}
