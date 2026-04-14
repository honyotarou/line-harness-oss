/**
 * Cloudflare Access [service token](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
 * JWT payloads omit `email` and set `common_name` to the token client id (`*.access`).
 */

export function isTrustedCloudflareAccessServiceTokenPayload(
  payload: Record<string, unknown>,
  trustedRaw: string | undefined,
): boolean {
  const raw = trustedRaw?.trim();
  if (!raw) {
    return false;
  }
  const cn = payload.common_name;
  if (typeof cn !== 'string' || !cn.endsWith('.access')) {
    return false;
  }
  const allow = new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return allow.has(cn.toLowerCase());
}
