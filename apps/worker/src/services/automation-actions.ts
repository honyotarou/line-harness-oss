/** Action types implemented by `executeAction` in `event-bus.ts` (keep in sync). */
export const ALLOWED_AUTOMATION_ACTION_TYPES = new Set([
  'add_tag',
  'remove_tag',
  'start_scenario',
  'send_message',
  'send_webhook',
  'switch_rich_menu',
  'remove_rich_menu',
  'set_metadata',
]);

export function validateAutomationActions(
  actions: unknown,
): { ok: true } | { ok: false; error: string } {
  if (!Array.isArray(actions)) {
    return { ok: false, error: 'actions must be an array' };
  }
  if (actions.length === 0) {
    return { ok: false, error: 'actions must not be empty' };
  }
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (!a || typeof a !== 'object' || Array.isArray(a)) {
      return { ok: false, error: `actions[${i}] must be an object` };
    }
    const rec = a as Record<string, unknown>;
    if (typeof rec.type !== 'string' || !ALLOWED_AUTOMATION_ACTION_TYPES.has(rec.type)) {
      return { ok: false, error: `actions[${i}].type is not an allowed automation action` };
    }
    if (!rec.params || typeof rec.params !== 'object' || Array.isArray(rec.params)) {
      return { ok: false, error: `actions[${i}].params must be an object` };
    }
  }
  return { ok: true };
}
