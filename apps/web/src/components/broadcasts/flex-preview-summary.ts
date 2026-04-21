import { tryParseJsonLoose } from '@line-crm/shared';

export type FlexPreviewSummary = Readonly<{
  ok: boolean;
  typeLabel: string;
  altText: string;
  sizeHint: string;
  parseError: string | null;
}>;

/** Read-only summary of Flex JSON for operator preview (not a pixel-perfect LINE simulator). */
export function summarizeFlexJsonForPreview(raw: string): FlexPreviewSummary {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      typeLabel: '',
      altText: '',
      sizeHint: '',
      parseError: 'JSON を入力してください',
    };
  }
  const parsed = tryParseJsonLoose(trimmed);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      typeLabel: '',
      altText: '',
      sizeHint: '',
      parseError: 'Flex は JSON オブジェクトである必要があります',
    };
  }
  const o = parsed as Record<string, unknown>;
  const typeLabel = typeof o.type === 'string' ? o.type : '(type なし)';
  const altText = typeof o.altText === 'string' ? o.altText : '';
  const contents = o.contents;
  const sizeHint =
    typeLabel === 'carousel' && Array.isArray(contents)
      ? `カルーセル: ${contents.length} 枚`
      : typeLabel === 'bubble'
        ? 'バブル 1 枚'
        : '';
  return {
    ok: true,
    typeLabel,
    altText,
    sizeHint,
    parseError: null,
  };
}
