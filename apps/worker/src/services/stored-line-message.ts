import type { Message } from '@line-crm/line-sdk';

/** Recursively find the first text element in a Flex Message for altText */
function extractFlexAltText(obj: unknown, depth = 0): string | null {
  if (depth > 10 || !obj || typeof obj !== 'object') return null;
  const node = obj as Record<string, unknown>;
  if (node.type === 'text' && typeof node.text === 'string') {
    return node.text.slice(0, 100);
  }
  if (Array.isArray(node.contents)) {
    for (const child of node.contents) {
      const found = extractFlexAltText(child, depth + 1);
      if (found) return found;
    }
  }
  for (const key of ['header', 'body', 'footer']) {
    if (node[key]) {
      const found = extractFlexAltText(node[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Remove empty text nodes from Flex JSON (caused by conditional blocks) */
function cleanEmptyNodes(obj: unknown): void {
  if (!obj || typeof obj !== 'object') return;
  const node = obj as Record<string, unknown>;
  for (const key of ['header', 'body', 'footer']) {
    if (node[key]) cleanEmptyNodes(node[key]);
  }
  if (Array.isArray(node.contents)) {
    node.contents = (node.contents as unknown[]).filter((c) => {
      if (c && typeof c === 'object' && (c as Record<string, unknown>).type === 'text') {
        const text = (c as Record<string, unknown>).text;
        return typeof text === 'string' && text.trim().length > 0;
      }
      return true;
    });
    for (const c of node.contents as unknown[]) cleanEmptyNodes(c);
  }
}

export type BuildStoredMessageOptions = {
  /** Used when flex JSON has no extractable text (default: お知らせ) */
  flexAltFallback?: string;
};

/**
 * Build a LINE push message from DB-stored template fields.
 * Hardens against poisoned JSON: non-object flex / malformed image payloads fall back to text.
 */
export function buildMessageFromStoredContent(
  messageType: string,
  messageContent: string,
  options?: BuildStoredMessageOptions,
): Message {
  const flexAltFallback = options?.flexAltFallback ?? 'お知らせ';

  if (messageType === 'text') {
    return { type: 'text', text: messageContent };
  }

  if (messageType === 'image') {
    try {
      const parsed = JSON.parse(messageContent) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { type: 'text', text: messageContent };
      }
      const o = parsed.originalContentUrl;
      const p = parsed.previewImageUrl;
      if (typeof o !== 'string' || typeof p !== 'string') {
        return { type: 'text', text: messageContent };
      }
      if (!o.trim() || !p.trim()) {
        return { type: 'text', text: messageContent };
      }
      return { type: 'image', originalContentUrl: o, previewImageUrl: p };
    } catch {
      return { type: 'text', text: messageContent };
    }
  }

  if (messageType === 'flex') {
    try {
      const contents = JSON.parse(messageContent);
      if (contents === null || typeof contents !== 'object' || Array.isArray(contents)) {
        return { type: 'text', text: messageContent };
      }
      cleanEmptyNodes(contents);
      const altText = extractFlexAltText(contents) || flexAltFallback;
      return { type: 'flex', altText, contents };
    } catch {
      return { type: 'text', text: messageContent };
    }
  }

  return { type: 'text', text: messageContent };
}
