import {
  addTagToFriend,
  countActiveLineAccounts,
  enrollFriendInScenario,
  getFriendById,
  getScenarioById,
  getTagById,
  getTrackedLinkById,
  recordLinkClick,
} from '@line-crm/db';
import type { TrackedLink } from '@line-crm/db';
import { assertHttpsOutboundUrlResolvedSafe } from '../services/outbound-url-resolve.js';
import { resourceBelongsToFriendTenant } from '../services/resource-friend-tenant.js';
import { isSafeHttpsRedirectUrl } from '../services/safe-redirect-url.js';
import { verifyTrackedLinkFriendToken } from '../services/tracking-friend-token.js';

type TrackedLinkRedirectFailure = Readonly<{ ok: false; status: number; body: unknown }>;

export type PublicTrackedLinkRedirectResult =
  | Readonly<{ ok: true; redirectUrl: string; trackClick: () => Promise<void> }>
  | TrackedLinkRedirectFailure;

async function resolveTrackedLinkEffectiveFriendId(
  db: D1Database,
  link: TrackedLink,
  verifiedFriendId: string | null,
): Promise<string | null> {
  if (!verifiedFriendId) {
    return null;
  }

  const friend = await getFriendById(db, verifiedFriendId);
  if (!friend) {
    return null;
  }

  const mode = { multi: (await countActiveLineAccounts(db)) > 1 } as const;

  if (!resourceBelongsToFriendTenant(link, friend, mode)) {
    return null;
  }

  if (link.tag_id) {
    const tag = await getTagById(db, link.tag_id);
    if (!tag || !resourceBelongsToFriendTenant(tag, friend, mode)) {
      return null;
    }
  }

  if (link.scenario_id) {
    const scenario = await getScenarioById(db, link.scenario_id);
    if (!scenario || !resourceBelongsToFriendTenant(scenario, friend, mode)) {
      return null;
    }
  }

  return verifiedFriendId;
}

export async function resolvePublicTrackedLinkRedirect(input: {
  db: D1Database;
  linkId: string;
  fParam: string;
  secret: string | null;
  fetchFn: typeof fetch;
}): Promise<PublicTrackedLinkRedirectResult> {
  const link = await getTrackedLinkById(input.db, input.linkId);
  if (!link || !link.is_active) {
    return { ok: false, status: 404, body: { success: false, error: 'Link not found' } };
  }

  if (!isSafeHttpsRedirectUrl(link.original_url)) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: 'Tracked link destination is not an allowed https URL' },
    };
  }

  const outboundOk = await assertHttpsOutboundUrlResolvedSafe(link.original_url, input.fetchFn);
  if (!outboundOk.ok) {
    return { ok: false, status: 404, body: { success: false, error: 'Link not found' } };
  }

  const verifiedFriendId = input.fParam
    ? await verifyTrackedLinkFriendToken(input.secret, input.linkId, input.fParam)
    : null;
  const effectiveFriendId = await resolveTrackedLinkEffectiveFriendId(
    input.db,
    link,
    verifiedFriendId,
  );

  const trackClick = async () => {
    try {
      await recordLinkClick(input.db, input.linkId, effectiveFriendId);

      if (!effectiveFriendId) {
        return;
      }

      const actions: Promise<unknown>[] = [];
      if (link.tag_id) {
        actions.push(addTagToFriend(input.db, effectiveFriendId, link.tag_id));
      }
      if (link.scenario_id) {
        actions.push(enrollFriendInScenario(input.db, effectiveFriendId, link.scenario_id));
      }
      if (actions.length > 0) {
        await Promise.allSettled(actions);
      }
    } catch (err) {
      console.error(`/t/${input.linkId} async tracking error:`, err);
    }
  };

  return {
    ok: true,
    redirectUrl: link.original_url,
    trackClick,
  };
}
