/** Allow only LINE CDN HTTPS URLs for profile images (mitigate `javascript:` / open redirect in `img src`). */
export function sanitizeLineProfilePictureUrlForHtml(
  raw: string | null | undefined,
): string | null {
  if (raw == null) {
    return null;
  }
  const t = raw.trim();
  if (!t) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host === 'profile.line-scdn.net' || host.endsWith('.line-scdn.net')) {
    return url.toString();
  }
  return null;
}
