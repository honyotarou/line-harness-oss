import { tryParseJsonLoose } from '@line-crm/shared';

export type StoredImageMessageContent = Readonly<{
  originalContentUrl: string;
  previewImageUrl: string;
}>;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function buildStoredImageMessageContent(input: {
  originalContentUrl: string;
  previewImageUrl?: string;
}): string {
  const originalContentUrl = input.originalContentUrl.trim();
  const previewImageUrl = (input.previewImageUrl ?? input.originalContentUrl).trim();
  return JSON.stringify({ originalContentUrl, previewImageUrl });
}

export function parseStoredImageMessageContent(jsonText: string): StoredImageMessageContent | null {
  const parsed = tryParseJsonLoose(jsonText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (!isNonEmptyString(obj.originalContentUrl) || !isNonEmptyString(obj.previewImageUrl))
    return null;
  return {
    originalContentUrl: obj.originalContentUrl.trim(),
    previewImageUrl: obj.previewImageUrl.trim(),
  };
}

export function isStoredFlexMessageContent(jsonText: string): boolean {
  const parsed = tryParseJsonLoose(jsonText);
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
}
