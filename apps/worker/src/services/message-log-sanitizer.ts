import { escapeHtmlTextForJsonApi } from './api-json-sanitizer.js';

export type MessageLogListItem = Readonly<{
  id: string;
  direction: string;
  messageType: string;
  content: string;
  createdAt: string;
}>;

export function sanitizeMessageLogListForJsonApi(
  items: readonly MessageLogListItem[],
): MessageLogListItem[] {
  return items.map((m) => ({
    ...m,
    content: escapeHtmlTextForJsonApi(String(m.content ?? '')),
  }));
}
