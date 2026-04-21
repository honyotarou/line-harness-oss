const DEFAULT_RETURN_TO = '/login';

/**
 * Same-origin relative path only (open-redirect mitigation for Access bootstrap redirect).
 */
const SAFE_RELATIVE_RETURN_TO = /^\/(?!\/)[^\s\\]{0,255}$/;

/**
 * Normalize `returnTo` for `GET /api/auth/access-bootstrap` redirects.
 */
export function sanitizeAccessBootstrapReturnTo(raw: string | undefined): string {
  if (raw === undefined) {
    return DEFAULT_RETURN_TO;
  }
  const t = raw.trim();
  if (!t) {
    return DEFAULT_RETURN_TO;
  }
  if (t.length > 256) {
    return DEFAULT_RETURN_TO;
  }
  if (!SAFE_RELATIVE_RETURN_TO.test(t)) {
    return DEFAULT_RETURN_TO;
  }
  if (t.includes('..')) {
    return DEFAULT_RETURN_TO;
  }
  return t;
}
