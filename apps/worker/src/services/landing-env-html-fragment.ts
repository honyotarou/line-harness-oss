import { escapeHtmlTextForJsonApi } from './api-json-sanitizer.js';

/** Split on `<br>` / `<br/>` / `<br />` (case-insensitive, permissive whitespace). */
const BR_TAG_SPLIT = /<\s*br\s*\/?\s*>/gi;

/**
 * Sanitizes Worker `LANDING_*_HTML` env fragments for static landing HTML: only line breaks
 * expressed as `<br>` tags are preserved; every text segment is HTML-escaped (no other tags).
 */
export function sanitizeLandingEnvHtmlFragmentAllowBrOnly(
  value: string | undefined,
  fallbackHtml: string,
): string {
  const raw = (value ?? '').trim();
  if (raw === '') return fallbackHtml;
  const parts = raw.split(BR_TAG_SPLIT);
  return parts.map((segment) => escapeHtmlTextForJsonApi(segment.trim())).join('<br>');
}
