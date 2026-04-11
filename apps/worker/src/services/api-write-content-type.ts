/**
 * POST/PUT/PATCH under `/api` must declare JSON (or a `+json` subtype) so bodies are not
 * accepted as `text/plain` while routes still parse JSON. Exceptions cover binary uploads and
 * third-party receivers that may use other media types.
 */

export function getDeclaredContentTypeMedia(header: string | undefined): string | null {
  if (!header?.trim()) {
    return null;
  }
  const media = header.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return media || null;
}

/** True for `application/json`, `text/json`, and `application/*+json` (e.g. `application/vnd.api+json`). */
export function isJsonFamilyContentType(contentTypeHeader: string | undefined): boolean {
  const media = getDeclaredContentTypeMedia(contentTypeHeader);
  if (!media) {
    return false;
  }
  if (media === 'application/json' || media === 'text/json') {
    return true;
  }
  return media.startsWith('application/') && media.endsWith('+json');
}

export function allowsApiWriteContentType(
  pathname: string,
  method: string,
  contentTypeHeader: string | undefined,
): boolean {
  if (method === 'POST' && /^\/api\/webhooks\/incoming\/[^/]+\/receive$/.test(pathname)) {
    return true;
  }
  if (isJsonFamilyContentType(contentTypeHeader)) {
    return true;
  }
  if (method === 'POST' && /^\/api\/rich-menus\/[^/]+\/image$/.test(pathname)) {
    const media = getDeclaredContentTypeMedia(contentTypeHeader);
    return media !== null && media.startsWith('image/');
  }
  return false;
}
