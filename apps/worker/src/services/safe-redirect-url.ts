/**
 * Only allow https: redirects without embedded credentials (open-redirect / phishing mitigation).
 */
export function isSafeHttpsRedirectUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') {
      return false;
    }
    if (u.username || u.password) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
