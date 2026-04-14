import type { WebhookEvent } from '@line-crm/line-sdk';

function eventPriority(type: string): number {
  switch (type) {
    case 'follow':
      return 0;
    case 'unfollow':
      return 1;
    case 'postback':
      return 2;
    case 'message':
      return 3;
    default:
      return 9;
  }
}

/**
 * Process events in a safe order.
 * - `follow` first so `message` / `postback` don't get dropped when the same webhook contains both.
 */
export function prioritizeLineWebhookEvents(events: WebhookEvent[]): WebhookEvent[] {
  return [...events].sort((a, b) => eventPriority(a.type) - eventPriority(b.type));
}
