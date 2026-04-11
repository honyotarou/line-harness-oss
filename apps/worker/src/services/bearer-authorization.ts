/**
 * RFC 7235: the authorization scheme name is case-insensitive.
 * Extract Bearer credentials from the Authorization header.
 */
export function parseBearerAuthorization(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!m) return null;
  const token = m[1].trim();
  return token.length > 0 ? token : null;
}
