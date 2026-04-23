import type { Friend } from '@line-crm/db';
import { fireEventRespectingAutomationWebhookHosts } from '../services/fire-event-outbound.js';
import type { AutomationWebhookBindings } from '../services/fire-event-outbound.js';

export type TagChangeAction = 'add' | 'remove';

/**
 * Fires the `tag_change` event with the friend's tenant context so the
 * event bus filters scoped automations / notifications correctly (fail-closed).
 *
 * Why extracted: two routes (`POST /:id/tags`, `DELETE /:id/tags/:tagId`)
 * share this call shape, and inlining it in the route both duplicates the
 * forward of `friend.line_account_id` (easy to forget) and grows the route
 * beyond the encapsulation cap.
 */
export async function fireFriendTagChangeEvent(
  db: D1Database,
  bindings: AutomationWebhookBindings,
  friend: Readonly<Pick<Friend, 'id' | 'line_account_id'>>,
  tagId: string,
  action: TagChangeAction,
): Promise<void> {
  await fireEventRespectingAutomationWebhookHosts(
    db,
    'tag_change',
    { friendId: friend.id, eventData: { tagId, action } },
    bindings,
    undefined,
    friend.line_account_id ?? null,
  );
}
